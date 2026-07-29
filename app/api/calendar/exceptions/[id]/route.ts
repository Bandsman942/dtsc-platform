import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, getCalendarContext } from "@/lib/internal-calendar";
import { normalizePositionCode } from "@/lib/business-roles";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  dateOnlyToUtcDate,
  dtscScheduleExceptionSchema,
  dtscScheduleExceptionUpdateSchema,
  isDtscScheduleException,
  isPastDateKey,
  notifyScheduleExceptionManagers,
  scheduleExceptionStatusForType,
  scheduleExceptionTypeForStatus,
  serializeScheduleException,
  todayDateKey,
} from "@/lib/work-schedule";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const record = await prisma.collaboratorAvailability.findFirst({
    where: { id, organizationId: context.activeOrganizationId, deletedAt: null },
  });
  if (!record || !isDtscScheduleException(record)) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const canReadOther = context.canViewOrganizationAvailability;
  if (record.collaboratorId !== context.calendarCollaboratorId && !canReadOther) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const includeReason = record.collaboratorId === context.calendarCollaboratorId || normalizePositionCode(context.positionCode || "") === "HR_CFO";
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ exception: serializeScheduleException(record, includeReason) });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-exception-update:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop de modifications de planning sur une courte période." }, { status: 429 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId || !context.employee) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.collaboratorAvailability.findFirst({ where: { id, organizationId: context.activeOrganizationId, deletedAt: null } });
  if (!existing || !isDtscScheduleException(existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.collaboratorId !== context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "schedule_exception_cross_update_denied", targetCollaboratorId: existing.collaboratorId } });
    return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement modifier vos propres exceptions et absences." }, { status: 403 });
  }
  const userPreference = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
  const timezone = userPreference?.timezone || "Africa/Kinshasa";
  const existingStartDate = existing.specificDate?.toISOString().slice(0, 10) || "";
  if (existingStartDate && isPastDateKey(existingStartDate, timezone)) {
    return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Cette exception appartient au passé et reste en lecture seule." }, { status: 409 });
  }
  const update = dtscScheduleExceptionUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!update.success) return NextResponse.json({ error: "Invalid payload", message: update.error.issues[0]?.message || "L'exception est invalide." }, { status: 400 });
  if (update.data.collaboratorId && update.data.collaboratorId !== context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement modifier votre propre planning." }, { status: 403 });

  const currentType = scheduleExceptionTypeForStatus(existing.availabilityStatus);
  const merged = dtscScheduleExceptionSchema.safeParse({
    type: update.data.type ?? currentType,
    startDate: update.data.startDate ?? existingStartDate,
    endDate: update.data.endDate ?? existing.recurrenceUntil?.toISOString().slice(0, 10) ?? existingStartDate,
    startTime: update.data.startTime ?? existing.startTime,
    endTime: update.data.endTime ?? existing.endTime,
    allDay: update.data.allDay ?? (existing.startTime === "00:00" && existing.endTime === "23:59"),
    locationMode: update.data.locationMode ?? existing.locationMode,
    reason: update.data.reason ?? existing.notes ?? "",
  });
  if (!merged.success) return NextResponse.json({ error: "Invalid payload", message: merged.error.issues[0]?.message || "L'exception est invalide." }, { status: 400 });
  if (isPastDateKey(merged.data.startDate, timezone)) return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "La date de début ne peut pas être déplacée dans le passé." }, { status: 409 });

  const startTime = merged.data.allDay ? "00:00" : merged.data.startTime;
  const endTime = merged.data.allDay ? "23:59" : merged.data.endTime;
  const record = await prisma.collaboratorAvailability.update({
    where: { id },
    data: {
      specificDate: dateOnlyToUtcDate(merged.data.startDate),
      recurrenceUntil: dateOnlyToUtcDate(merged.data.endDate),
      startTime,
      endTime,
      availabilityStatus: scheduleExceptionStatusForType(merged.data.type),
      locationMode: merged.data.locationMode,
      notes: merged.data.reason || null,
    },
  });
  await writeAuditLog({
    userId: session.userId,
    action: "WORK_SCHEDULE_EXCEPTION_UPDATED",
    entity: "CollaboratorScheduleException",
    entityId: record.id,
    request: req,
    metadata: { type: merged.data.type, startDate: merged.data.startDate, endDate: merged.data.endDate },
  });
  await notifyScheduleExceptionManagers({ actorEmployeeName: context.employee.fullName, exceptionType: merged.data.type, startDate: merged.data.startDate, organizationId: context.activeOrganizationId });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, exception: serializeScheduleException(record, true) });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-exception-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.collaboratorAvailability.findFirst({ where: { id, organizationId: context.activeOrganizationId, deletedAt: null } });
  if (!existing || !isDtscScheduleException(existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.collaboratorId !== context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "schedule_exception_cross_delete_denied", targetCollaboratorId: existing.collaboratorId } });
    return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement supprimer vos propres exceptions et absences." }, { status: 403 });
  }
  const userPreference = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
  const timezone = userPreference?.timezone || "Africa/Kinshasa";
  const startDate = existing.specificDate?.toISOString().slice(0, 10) || todayDateKey(timezone);
  if (isPastDateKey(startDate, timezone)) return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Une exception passée reste en lecture seule pour préserver l'historique." }, { status: 409 });

  await prisma.collaboratorAvailability.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_EXCEPTION_DELETED", entity: "CollaboratorScheduleException", entityId: existing.id, request: req, metadata: { type: scheduleExceptionTypeForStatus(existing.availabilityStatus) } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
