import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canManageCollaboratorCalendar, canUseInternalCalendarFeature, collaboratorAvailabilityWhere, getCalendarContext, validateCalendarCollaborators } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { internalCalendarAvailabilitySchema } from "@/lib/validators";
import { assertNoWeeklyOverlap, canManageOwnWorkSchedule, isDtscWeeklyAvailability, listDtscWorkSchedule, scheduleExceptionStatus, scheduleExceptionType } from "@/lib/work-schedule";
import { scheduleExceptionCreateSchema, weeklyAvailabilityCreateSchema } from "@/lib/work-schedule-validators";

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
    await writeApiLog({ request: req, statusCode: calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status: calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403 });
  }
  const collaboratorId = new URL(req.url).searchParams.get("collaboratorId") || "";
  if (context.dtscInternal) {
    const schedule = await listDtscWorkSchedule(context, collaboratorId || undefined);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ availabilities: schedule.weekly });
  }

  const availabilities = await prisma.collaboratorAvailability.findMany({
    where: collaboratorAvailabilityWhere(context, collaboratorId),
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
    await writeApiLog({ request: req, statusCode: calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status: calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403 });
  }
  const raw = await req.json().catch(() => null);

  if (context.dtscInternal) {
    if (!canManageOwnWorkSchedule(context, context.calendarCollaboratorId)) {
      return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement gérer votre propre disponibilité." }, { status: 403 });
    }
    const legacy = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (legacy.recurrenceType === "Aucune" && legacy.specificDate) {
      const startDateTime = combineLegacyDateTime(String(legacy.specificDate), String(legacy.startTime || "00:00"));
      const endDateTime = combineLegacyDateTime(String(legacy.specificDate), String(legacy.endTime || "00:00"));
      const parsedException = scheduleExceptionCreateSchema.safeParse({
        type: scheduleExceptionType(String(legacy.availabilityStatus || "Indisponible")),
        startDateTime,
        endDateTime,
        reason: String(legacy.notes || ""),
        locationMode: normalizeLocationMode(String(legacy.locationMode || "Non défini")),
      });
      if (!parsedException.success) return NextResponse.json({ error: "Invalid payload", message: parsedException.error.issues[0]?.message || "Exception invalide." }, { status: 400 });
      const exception = await prisma.collaboratorAvailability.create({
        data: {
          organizationId: context.activeOrganizationId,
          collaboratorId: context.calendarCollaboratorId,
          dayOfWeek: null,
          specificDate: new Date(`${String(legacy.specificDate).slice(0, 10)}T00:00:00.000Z`),
          startTime: String(legacy.startTime || "00:00"),
          endTime: String(legacy.endTime || "00:00"),
          availabilityStatus: scheduleExceptionStatus(parsedException.data.type),
          recurrenceType: "Aucune",
          recurrenceStart: parsedException.data.startDateTime,
          recurrenceUntil: parsedException.data.endDateTime,
          recurrenceInterval: 1,
          locationMode: parsedException.data.locationMode,
          notes: parsedException.data.reason || null,
          createdBy: session.userId,
        },
      });
      await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_EXCEPTION_CREATED", entity: "CollaboratorAvailability", entityId: exception.id, request: req });
      await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
      return NextResponse.json({ ok: true, availability: exception }, { status: 201 });
    }

    const parsed = weeklyAvailabilityCreateSchema.safeParse({
      dayOfWeek: legacy.dayOfWeek,
      startTime: legacy.startTime,
      endTime: legacy.endTime,
      locationMode: normalizeLocationMode(String(legacy.locationMode || legacy.availabilityStatus || "Non défini")),
      notes: legacy.notes,
      effectiveFrom: legacy.effectiveFrom || legacy.recurrenceStart || null,
      effectiveUntil: legacy.effectiveUntil || legacy.recurrenceUntil || null,
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Disponibilité invalide." }, { status: 400 });
    const overlap = await assertNoWeeklyOverlap({ context, collaboratorId: context.calendarCollaboratorId, ...parsed.data });
    if (overlap) return NextResponse.json({ error: "OVERLAPPING_AVAILABILITY", message: `Cette plage chevauche déjà votre disponibilité de ${overlap.startTime} à ${overlap.endTime}.` }, { status: 409 });
    const availability = await prisma.collaboratorAvailability.create({
      data: {
        organizationId: context.activeOrganizationId,
        collaboratorId: context.calendarCollaboratorId,
        dayOfWeek: parsed.data.dayOfWeek,
        specificDate: null,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        availabilityStatus: "Disponible",
        recurrenceType: "Hebdomadaire",
        recurrenceStart: parsed.data.effectiveFrom || null,
        recurrenceUntil: parsed.data.effectiveUntil || null,
        recurrenceInterval: 1,
        locationMode: parsed.data.locationMode,
        notes: parsed.data.notes || null,
        createdBy: session.userId,
      },
    });
    await writeAuditLog({ userId: session.userId, action: "WORK_AVAILABILITY_CREATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, availability }, { status: 201 });
  }

  const parsed = internalCalendarAvailabilitySchema.safeParse(raw);
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

function normalizeLocationMode(value: string) {
  if (value === "Sur site" || value === "Site DTSC") return "Site DTSC";
  if (value === "Télétravail") return "Télétravail";
  if (value === "Hybride") return "Hybride";
  return "Non défini";
}

function combineLegacyDateTime(date: string, time: string) {
  return new Date(`${date.slice(0, 10)}T${time}:00`);
}
