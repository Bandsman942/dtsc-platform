import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getCalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { canManageOwnWorkSchedule, isDtscScheduleException, scheduleExceptionStatus, scheduleExceptionType } from "@/lib/work-schedule";
import { scheduleExceptionUpdateSchema } from "@/lib/work-schedule-validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `work-schedule-exception-update:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.collaboratorAvailability.findFirst({ where: { id, organizationId: context.activeOrganizationId, deletedAt: null } });
  if (!existing || !isDtscScheduleException(existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageOwnWorkSchedule(context, existing.collaboratorId)) {
    await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_CROSS_USER_WRITE_DENIED", entity: "CollaboratorAvailability", entityId: id, request: req });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier l'exception d'un autre collaborateur." }, { status: 403 });
  }
  const existingEnd = existing.recurrenceUntil || existing.specificDate;
  if (existingEnd && existingEnd <= new Date()) return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "L'historique passé est en lecture seule." }, { status: 409 });
  const parsed = scheduleExceptionUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Exception invalide." }, { status: 400 });
  const start = parsed.data.startDateTime || existing.recurrenceStart || existing.specificDate;
  const end = parsed.data.endDateTime || existing.recurrenceUntil || existing.specificDate;
  if (!start || !end || end <= start) return NextResponse.json({ error: "Invalid payload", message: "La fin doit être après le début." }, { status: 400 });
  if (end <= new Date()) return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Une exception passée ne peut pas être réécrite." }, { status: 409 });
  const type = parsed.data.type || scheduleExceptionType(existing.availabilityStatus);
  const exception = await prisma.collaboratorAvailability.update({
    where: { id },
    data: {
      specificDate: utcDateOnly(start),
      startTime: utcTime(start),
      endTime: utcTime(end),
      recurrenceStart: start,
      recurrenceUntil: end,
      availabilityStatus: scheduleExceptionStatus(type),
      locationMode: parsed.data.locationMode ?? existing.locationMode,
      notes: parsed.data.reason === undefined ? existing.notes : parsed.data.reason || null,
    },
  });
  await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_EXCEPTION_UPDATED", entity: "CollaboratorAvailability", entityId: id, request: req, metadata: { type } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, exception: { ...exception, type, reason: exception.notes, startDateTime: start.toISOString(), endDateTime: end.toISOString() } });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `work-schedule-exception-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.collaboratorAvailability.findFirst({ where: { id, organizationId: context.activeOrganizationId, deletedAt: null } });
  if (!existing || !isDtscScheduleException(existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageOwnWorkSchedule(context, existing.collaboratorId)) {
    await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_CROSS_USER_WRITE_DENIED", entity: "CollaboratorAvailability", entityId: id, request: req });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas supprimer l'exception d'un autre collaborateur." }, { status: 403 });
  }
  const existingEnd = existing.recurrenceUntil || existing.specificDate;
  if (existingEnd && existingEnd <= new Date()) return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "L'historique passé est en lecture seule." }, { status: 409 });
  await prisma.collaboratorAvailability.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_EXCEPTION_DELETED", entity: "CollaboratorAvailability", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}

function utcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function utcTime(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}
