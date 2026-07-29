import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canManageCollaboratorCalendar, canUseInternalCalendarFeature, collaboratorAvailabilityWhere, getCalendarContext, validateCalendarCollaborators } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { internalCalendarAvailabilitySchema, internalCalendarAvailabilityUpdateSchema } from "@/lib/validators";
import { assertNoWeeklyOverlap, canManageOwnWorkSchedule, isDtscScheduleException, isDtscWeeklyAvailability, scheduleExceptionStatus, scheduleExceptionType } from "@/lib/work-schedule";
import { scheduleExceptionUpdateSchema, weeklyAvailabilityUpdateSchema } from "@/lib/work-schedule-validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status: calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403 });
  const availability = await prisma.collaboratorAvailability.findFirst({ where: { AND: [collaboratorAvailabilityWhere(context), { id }] } });
  if (!availability) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ availability });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-availability-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations calendrier sur une courte période." }, { status: 429 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status: calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403 });
  const existing = await prisma.collaboratorAvailability.findFirst({ where: { organizationId: context.activeOrganizationId, id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const raw = await req.json().catch(() => null);

  if (context.dtscInternal) {
    if (!canManageOwnWorkSchedule(context, existing.collaboratorId)) {
      await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_CROSS_USER_WRITE_DENIED", entity: "CollaboratorAvailability", entityId: id, request: req });
      return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez modifier que votre propre planning." }, { status: 403 });
    }
    if (isDtscScheduleException(existing)) {
      const legacy = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const startDateTime = legacy.specificDate ? combineLegacyDateTime(String(legacy.specificDate), String(legacy.startTime || existing.startTime)) : existing.recurrenceStart || existing.specificDate;
      const endDateTime = legacy.specificDate ? combineLegacyDateTime(String(legacy.specificDate), String(legacy.endTime || existing.endTime)) : existing.recurrenceUntil || existing.specificDate;
      const parsed = scheduleExceptionUpdateSchema.safeParse({
        type: legacy.availabilityStatus ? scheduleExceptionType(String(legacy.availabilityStatus)) : undefined,
        startDateTime,
        endDateTime,
        reason: legacy.notes,
        locationMode: legacy.locationMode ? normalizeExceptionLocation(String(legacy.locationMode)) : undefined,
      });
      if (!parsed.success || !startDateTime || !endDateTime) return NextResponse.json({ error: "Invalid payload", message: parsed.success ? "Exception invalide." : parsed.error.issues[0]?.message }, { status: 400 });
      if (endDateTime <= new Date()) return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "L'historique passé est en lecture seule." }, { status: 409 });
      const type = parsed.data.type || scheduleExceptionType(existing.availabilityStatus);
      const updated = await prisma.collaboratorAvailability.update({
        where: { id },
        data: {
          specificDate: utcDateOnly(startDateTime),
          startTime: utcTime(startDateTime),
          endTime: utcTime(endDateTime),
          recurrenceStart: startDateTime,
          recurrenceUntil: endDateTime,
          availabilityStatus: scheduleExceptionStatus(type),
          locationMode: parsed.data.locationMode ?? existing.locationMode,
          notes: parsed.data.reason === undefined ? existing.notes : parsed.data.reason || null,
        },
      });
      await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_EXCEPTION_UPDATED", entity: "CollaboratorAvailability", entityId: id, request: req });
      return NextResponse.json({ ok: true, availability: updated });
    }
    if (!isDtscWeeklyAvailability(existing)) return NextResponse.json({ error: "Invalid schedule record" }, { status: 409 });
    const legacy = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const parsed = weeklyAvailabilityUpdateSchema.safeParse({
      dayOfWeek: legacy.dayOfWeek,
      startTime: legacy.startTime,
      endTime: legacy.endTime,
      locationMode: legacy.locationMode ? normalizeWeeklyLocation(String(legacy.locationMode)) : undefined,
      notes: legacy.notes,
      effectiveFrom: legacy.effectiveFrom || legacy.recurrenceStart,
      effectiveUntil: legacy.effectiveUntil || legacy.recurrenceUntil,
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Disponibilité invalide." }, { status: 400 });
    const dayOfWeek = parsed.data.dayOfWeek ?? existing.dayOfWeek;
    const startTime = parsed.data.startTime ?? existing.startTime;
    const endTime = parsed.data.endTime ?? existing.endTime;
    if (dayOfWeek === null) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const effectiveFrom = parsed.data.effectiveFrom === undefined ? existing.recurrenceStart : parsed.data.effectiveFrom;
    const effectiveUntil = parsed.data.effectiveUntil === undefined ? existing.recurrenceUntil : parsed.data.effectiveUntil;
    const overlap = await assertNoWeeklyOverlap({ context, collaboratorId: existing.collaboratorId, dayOfWeek, startTime, endTime, effectiveFrom, effectiveUntil, excludeId: id });
    if (overlap) return NextResponse.json({ error: "OVERLAPPING_AVAILABILITY", message: `Cette plage chevauche déjà votre disponibilité de ${overlap.startTime} à ${overlap.endTime}.` }, { status: 409 });

    const now = new Date();
    const existingStarted = !existing.recurrenceStart || existing.recurrenceStart <= now;
    if (existingStarted) {
      const successorStart = effectiveFrom && effectiveFrom > now ? effectiveFrom : utcToday();
      const predecessorEnd = new Date(successorStart.getTime() - 86_400_000);
      const successor = await prisma.$transaction(async (tx) => {
        await tx.collaboratorAvailability.update({ where: { id }, data: { recurrenceUntil: predecessorEnd } });
        return tx.collaboratorAvailability.create({
          data: {
            organizationId: context.activeOrganizationId,
            collaboratorId: existing.collaboratorId,
            dayOfWeek,
            specificDate: null,
            startTime,
            endTime,
            availabilityStatus: "Disponible",
            recurrenceType: "Hebdomadaire",
            recurrenceStart: successorStart,
            recurrenceUntil: effectiveUntil || null,
            recurrenceInterval: 1,
            locationMode: parsed.data.locationMode ?? existing.locationMode,
            notes: parsed.data.notes === undefined ? existing.notes : parsed.data.notes || null,
            createdBy: session.userId,
          },
        });
      });
      await writeAuditLog({ userId: session.userId, action: "WORK_AVAILABILITY_UPDATED", entity: "CollaboratorAvailability", entityId: successor.id, request: req, metadata: { supersedesId: id } });
      return NextResponse.json({ ok: true, availability: successor });
    }
    const availability = await prisma.collaboratorAvailability.update({
      where: { id },
      data: {
        dayOfWeek,
        startTime,
        endTime,
        recurrenceStart: effectiveFrom || null,
        recurrenceUntil: effectiveUntil || null,
        locationMode: parsed.data.locationMode ?? existing.locationMode,
        notes: parsed.data.notes === undefined ? existing.notes : parsed.data.notes || null,
      },
    });
    await writeAuditLog({ userId: session.userId, action: "WORK_AVAILABILITY_UPDATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
    return NextResponse.json({ ok: true, availability });
  }

  if (!canManageCollaboratorCalendar(context, existing.collaboratorId)) return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier cette disponibilité." }, { status: 403 });
  const parsed = internalCalendarAvailabilityUpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
  const merged = internalCalendarAvailabilitySchema.safeParse({
    collaboratorId: existing.collaboratorId,
    dayOfWeek: existing.dayOfWeek,
    specificDate: existing.specificDate,
    startTime: existing.startTime,
    endTime: existing.endTime,
    availabilityStatus: existing.availabilityStatus,
    recurrenceType: existing.recurrenceType,
    recurrenceStart: existing.recurrenceStart,
    recurrenceUntil: existing.recurrenceUntil,
    recurrenceInterval: existing.recurrenceInterval,
    locationMode: existing.locationMode,
    notes: existing.notes || "",
    ...parsed.data,
  });
  if (!merged.success) return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
  if (!canManageCollaboratorCalendar(context, merged.data.collaboratorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await validateCalendarCollaborators(context, [merged.data.collaboratorId]))) return NextResponse.json({ error: "Invalid collaborator" }, { status: 400 });
  const availability = await prisma.collaboratorAvailability.update({
    where: { id },
    data: {
      collaboratorId: merged.data.collaboratorId,
      dayOfWeek: merged.data.dayOfWeek ?? null,
      specificDate: merged.data.specificDate || null,
      startTime: merged.data.startTime,
      endTime: merged.data.endTime,
      availabilityStatus: merged.data.availabilityStatus,
      recurrenceType: merged.data.recurrenceType,
      recurrenceStart: merged.data.recurrenceStart || null,
      recurrenceUntil: merged.data.recurrenceUntil || null,
      recurrenceInterval: merged.data.recurrenceInterval || 1,
      locationMode: merged.data.locationMode,
      notes: merged.data.notes || null,
    },
  });
  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_UPDATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, availability });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-availability-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.collaboratorAvailability.findFirst({ where: { organizationId: context.activeOrganizationId, id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (context.dtscInternal) {
    if (!canManageOwnWorkSchedule(context, existing.collaboratorId)) {
      await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_CROSS_USER_WRITE_DENIED", entity: "CollaboratorAvailability", entityId: id, request: req });
      return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez supprimer que votre propre planning." }, { status: 403 });
    }
    if (isDtscScheduleException(existing)) {
      const end = existing.recurrenceUntil || existing.specificDate;
      if (end && end <= new Date()) return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "L'historique passé est en lecture seule." }, { status: 409 });
      await prisma.collaboratorAvailability.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_EXCEPTION_DELETED", entity: "CollaboratorAvailability", entityId: id, request: req });
      return NextResponse.json({ ok: true });
    }
    if (!isDtscWeeklyAvailability(existing)) return NextResponse.json({ error: "Invalid schedule record" }, { status: 409 });
    const started = !existing.recurrenceStart || existing.recurrenceStart <= new Date();
    if (started) {
      await prisma.collaboratorAvailability.update({ where: { id }, data: { recurrenceUntil: new Date(utcToday().getTime() - 86_400_000) } });
    } else {
      await prisma.collaboratorAvailability.update({ where: { id }, data: { deletedAt: new Date() } });
    }
    await writeAuditLog({ userId: session.userId, action: "WORK_AVAILABILITY_DELETED", entity: "CollaboratorAvailability", entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true });
  }

  if (!canManageCollaboratorCalendar(context, existing.collaboratorId)) return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas supprimer cette disponibilité." }, { status: 403 });
  await prisma.collaboratorAvailability.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_DELETED", entity: "CollaboratorAvailability", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}

function normalizeWeeklyLocation(value: string) {
  if (value === "Sur site" || value === "Site DTSC") return "Site DTSC";
  if (value === "Télétravail") return "Télétravail";
  if (value === "Hybride") return "Hybride";
  return "Non défini";
}

function normalizeExceptionLocation(value: string) {
  if (["Site DTSC", "Télétravail", "Hybride", "Externe", "Mission", "Non défini"].includes(value)) return value;
  if (value === "Sur site") return "Site DTSC";
  return "Non défini";
}

function combineLegacyDateTime(date: string, time: string) {
  return new Date(`${date.slice(0, 10)}T${time}:00`);
}

function utcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function utcTime(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
