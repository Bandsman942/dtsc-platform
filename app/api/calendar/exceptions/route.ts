import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, getCalendarContext } from "@/lib/internal-calendar";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { canManageOwnWorkSchedule, canViewTeamWorkSchedule, listDtscWorkSchedule, scheduleExceptionStatus, scheduleExceptionType, type ScheduleExceptionType } from "@/lib/work-schedule";
import { scheduleExceptionCreateSchema } from "@/lib/work-schedule-validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const requestedCollaboratorId = new URL(req.url).searchParams.get("collaboratorId") || undefined;
  if (requestedCollaboratorId && requestedCollaboratorId !== context.calendarCollaboratorId && !canViewTeamWorkSchedule(context)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const schedule = await listDtscWorkSchedule(context, requestedCollaboratorId);
  const canReadReason = !requestedCollaboratorId || requestedCollaboratorId === context.calendarCollaboratorId || context.positionCode === "HR_CFO" || session.role === "ADMIN";
  const exceptions = schedule.exceptions.map((row) => ({
    ...row,
    type: scheduleExceptionType(row.availabilityStatus),
    reason: canReadReason ? row.notes : null,
    notes: canReadReason ? row.notes : null,
    startDateTime: (row.recurrenceStart || row.specificDate)?.toISOString() || null,
    endDateTime: (row.recurrenceUntil || row.specificDate)?.toISOString() || null,
  }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ exceptions });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "work_schedule_exception_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `work-schedule-exception-create:${session.userId}`), 50, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de modifications de planning sur une courte période." }, { status: 429 });
  }
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId || !canManageOwnWorkSchedule(context, context.calendarCollaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement gérer vos propres exceptions et absences." }, { status: 403 });
  }
  const parsed = scheduleExceptionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Exception invalide." }, { status: 400 });
  }
  if (parsed.data.endDateTime <= new Date()) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Une exception entièrement passée ne peut pas être créée ou réécrite." }, { status: 409 });
  }
  const specificDate = utcDateOnly(parsed.data.startDateTime);
  const exception = await prisma.collaboratorAvailability.create({
    data: {
      organizationId: context.activeOrganizationId,
      collaboratorId: context.calendarCollaboratorId,
      dayOfWeek: null,
      specificDate,
      startTime: utcTime(parsed.data.startDateTime),
      endTime: utcTime(parsed.data.endDateTime),
      availabilityStatus: scheduleExceptionStatus(parsed.data.type),
      recurrenceType: "Aucune",
      recurrenceStart: parsed.data.startDateTime,
      recurrenceUntil: parsed.data.endDateTime,
      recurrenceInterval: 1,
      locationMode: parsed.data.locationMode,
      notes: parsed.data.reason || null,
      createdBy: session.userId,
    },
  });
  await writeAuditLog({ userId: session.userId, action: "WORK_SCHEDULE_EXCEPTION_CREATED", entity: "CollaboratorAvailability", entityId: exception.id, request: req, metadata: { type: parsed.data.type } });
  await notifyRelevantManagers({ type: parsed.data.type, start: parsed.data.startDateTime, end: parsed.data.endDateTime, employeeId: context.calendarCollaboratorId, actorUserId: session.userId, organizationId: context.activeOrganizationId });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, exception: { ...exception, type: parsed.data.type, reason: exception.notes, startDateTime: parsed.data.startDateTime.toISOString(), endDateTime: parsed.data.endDateTime.toISOString() } }, { status: 201 });
}

async function notifyRelevantManagers({ type, start, end, employeeId, actorUserId, organizationId }: { type: ScheduleExceptionType; start: Date; end: Date; employeeId: string; actorUserId: string; organizationId: string }) {
  const durationHours = (end.getTime() - start.getTime()) / 3_600_000;
  const absenceTypes: ScheduleExceptionType[] = ["ABSENCE", "LEAVE", "SICKNESS", "PERSONAL_ABSENCE", "ADMINISTRATIVE_ABSENCE", "UNAVAILABLE"];
  const isSignificantAbsence = absenceTypes.includes(type) && durationHours >= 4;
  const isNearOperationalException = (type === "MISSION" || type === "TRAINING") && start.getTime() - Date.now() <= 48 * 3_600_000;
  if (!isSignificantAbsence && !isNearOperationalException) return;

  const employee = await prisma.hrcfoEmployee.findUnique({ where: { id: employeeId }, select: { fullName: true } });
  const positions = isSignificantAbsence ? ["COO", "HR_CFO"] : ["COO"];
  const recipients = await prisma.hrcfoEmployee.findMany({
    where: {
      status: { not: "EXITED" },
      userId: { not: null },
      OR: [{ positionCode: { in: positions } }, { position: { code: { in: positions } } }],
    },
    select: { userId: true },
  });
  const userIds = recipients.map((item) => item.userId).filter((userId): userId is string => Boolean(userId) && userId !== actorUserId);
  if (!userIds.length) return;
  await notifyUsers({
    userIds,
    title: isSignificantAbsence ? "Absence déclarée" : "Exception de planning",
    body: `${employee?.fullName || "Un collaborateur"} a mis à jour son planning.`,
    type: "CALENDAR",
    targetUrl: "/calendar",
    organizationId,
  });
}

function utcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function utcTime(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}
