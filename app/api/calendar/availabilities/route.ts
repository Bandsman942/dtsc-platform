import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canManageCollaboratorCalendar, canUseInternalCalendarFeature, collaboratorAvailabilityWhere, getCalendarContext, validateCalendarCollaborators } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { internalCalendarAvailabilitySchema } from "@/lib/validators";
import {
  dateOnlyToUtcDate,
  dtscWeeklyAvailabilitySchema,
  ensureNoWeeklyAvailabilityOverlap,
  isPastDateKey,
  rejectCrossCollaboratorWrite,
  serializeWeeklyAvailability,
  todayDateKey,
} from "@/lib/work-schedule";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) {
    const status = calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status });
  }
  const collaboratorId = new URL(req.url).searchParams.get("collaboratorId") || "";
  const where = collaboratorAvailabilityWhere(context, collaboratorId);

  const availabilities = await prisma.collaboratorAvailability.findMany({
    where,
    orderBy: [{ specificDate: "asc" }, { recurrenceStart: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    take: 300,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ availabilities });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "calendar_availability_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `calendar-availability-create:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations calendrier sur une courte période." }, { status: 429 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) {
    const status = calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status });
  }

  const rawPayload = await req.json().catch(() => null);
  if (context.dtscInternal) {
    const weekly = dtscWeeklyAvailabilitySchema.safeParse(rawPayload);
    if (weekly.success) {
      if (rejectCrossCollaboratorWrite(context, weekly.data.collaboratorId)) {
        await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "work_availability_cross_write_denied" } });
        return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement gérer votre propre disponibilité." }, { status: 403 });
      }
      const userPreference = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
      const timezone = userPreference?.timezone || "Africa/Kinshasa";
      const effectiveFromKey = weekly.data.effectiveFrom || todayDateKey(timezone);
      if (isPastDateKey(effectiveFromKey, timezone)) {
        return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Un planning passé ne peut pas être réécrit. Choisissez une date d'effet actuelle ou future." }, { status: 409 });
      }
      const effectiveFrom = dateOnlyToUtcDate(effectiveFromKey);
      const effectiveUntil = dateOnlyToUtcDate(weekly.data.effectiveUntil || null);
      const overlap = await ensureNoWeeklyAvailabilityOverlap({
        organizationId: context.activeOrganizationId,
        collaboratorId: context.calendarCollaboratorId,
        dayOfWeek: weekly.data.dayOfWeek,
        startTime: weekly.data.startTime,
        endTime: weekly.data.endTime,
        effectiveFrom,
        effectiveUntil,
      });
      if (overlap) {
        return NextResponse.json({
          error: "WORK_AVAILABILITY_OVERLAP",
          message: `Cette plage chevauche déjà votre disponibilité de ${overlap.startTime} à ${overlap.endTime}.`,
        }, { status: 409 });
      }

      const availability = await prisma.collaboratorAvailability.create({
        data: {
          organizationId: context.activeOrganizationId,
          collaboratorId: context.calendarCollaboratorId,
          dayOfWeek: weekly.data.dayOfWeek,
          specificDate: null,
          startTime: weekly.data.startTime,
          endTime: weekly.data.endTime,
          availabilityStatus: "Disponible",
          recurrenceType: "Hebdomadaire",
          recurrenceStart: effectiveFrom,
          recurrenceUntil: effectiveUntil,
          recurrenceInterval: 1,
          locationMode: weekly.data.locationMode,
          notes: weekly.data.notes || null,
          createdBy: session.userId,
        },
      });
      await writeAuditLog({ userId: session.userId, action: "WORK_AVAILABILITY_CREATED", entity: "CollaboratorWeeklyAvailability", entityId: availability.id, request: req });
      await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
      return NextResponse.json({ ok: true, availability: serializeWeeklyAvailability(availability), kind: "WEEKLY" }, { status: 201 });
    }

    // Compatibility for the pre-Sprint-3 calendar form. It remains self-service only;
    // the dedicated Sprint-3 APIs/UI should be preferred for new DTSC planning data.
    const legacyParsed = internalCalendarAvailabilitySchema.safeParse(rawPayload);
    if (!legacyParsed.success) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
    }
    if (legacyParsed.data.collaboratorId !== context.calendarCollaboratorId) {
      await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "legacy_work_availability_cross_write_denied" } });
      return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement gérer votre propre planning." }, { status: 403 });
    }
    const availability = await prisma.collaboratorAvailability.create({
      data: {
        ...legacyParsed.data,
        organizationId: context.activeOrganizationId,
        collaboratorId: context.calendarCollaboratorId,
        dayOfWeek: legacyParsed.data.dayOfWeek ?? null,
        specificDate: legacyParsed.data.specificDate || null,
        notes: legacyParsed.data.notes || null,
        recurrenceStart: legacyParsed.data.recurrenceStart || null,
        recurrenceUntil: legacyParsed.data.recurrenceUntil || null,
        recurrenceInterval: legacyParsed.data.recurrenceInterval || 1,
        createdBy: session.userId,
      },
    });
    await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_CREATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req, metadata: { compatibilityMode: true } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, availability }, { status: 201 });
  }

  const parsed = internalCalendarAvailabilitySchema.safeParse(rawPayload);
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
  }
  if (!canManageCollaboratorCalendar(context, parsed.data.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier cette disponibilité." }, { status: 403 });
  }
  if (!(await validateCalendarCollaborators(context, [parsed.data.collaboratorId]))) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid collaborator", message: "Ce collaborateur n'appartient pas à l'organisation active." }, { status: 400 });
  }

  const availability = await prisma.collaboratorAvailability.create({
    data: {
      ...parsed.data,
      organizationId: context.activeOrganizationId,
      dayOfWeek: parsed.data.dayOfWeek ?? null,
      specificDate: parsed.data.specificDate || null,
      notes: parsed.data.notes || null,
      recurrenceStart: parsed.data.recurrenceStart || null,
      recurrenceUntil: parsed.data.recurrenceUntil || null,
      recurrenceInterval: parsed.data.recurrenceInterval || 1,
      createdBy: session.userId,
    },
  });

  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_CREATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, availability }, { status: 201 });
}
