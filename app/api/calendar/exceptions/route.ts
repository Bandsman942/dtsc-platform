import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canUseInternalCalendarFeature, getCalendarContext } from "@/lib/internal-calendar";
import { normalizePositionCode } from "@/lib/business-roles";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  canViewOrganizationAvailability,
  dateOnlyToUtcDate,
  dtscScheduleExceptionSchema,
  dtscScheduleExceptionWhere,
  isPastDateKey,
  notifyScheduleExceptionManagers,
  rejectCrossCollaboratorWrite,
  scheduleExceptionStatusForType,
  serializeScheduleException,
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Les exceptions de planning DTSC sont réservées à l'espace interne DTSC." }, { status: 403 });
  }
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status: 403 });
  }

  const url = new URL(req.url);
  const requestedCollaboratorId = url.searchParams.get("collaboratorId") || undefined;
  const start = url.searchParams.get("start") || undefined;
  const end = url.searchParams.get("end") || undefined;
  const type = url.searchParams.get("type") || undefined;
  const records = await prisma.collaboratorAvailability.findMany({
    where: dtscScheduleExceptionWhere(context, requestedCollaboratorId),
    orderBy: [{ specificDate: "desc" }, { startTime: "asc" }],
    take: 300,
  });
  const isHrcfo = normalizePositionCode(context.positionCode || "") === "HR_CFO";
  const exceptions = records
    .map((record) => serializeScheduleException(record, isHrcfo || record.collaboratorId === context.calendarCollaboratorId))
    .filter((record) => (!start || (record.endDate || record.startDate || "") >= start) && (!end || (record.startDate || "") <= end) && (!type || record.type === type));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ exceptions });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "schedule_exception_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `calendar-exception-create:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de modifications de planning sur une courte période." }, { status: 429 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId || !context.employee) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Aucun dossier collaborateur DTSC actif n'est associé à cette session." }, { status: 403 });
  }
  const parsed = dtscScheduleExceptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "L'exception de planning est invalide." }, { status: 400 });
  }
  if (rejectCrossCollaboratorWrite(context, parsed.data.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "schedule_exception_cross_write_denied" } });
    return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement déclarer vos propres exceptions et absences." }, { status: 403 });
  }
  const userPreference = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
  const timezone = userPreference?.timezone || "Africa/Kinshasa";
  if (isPastDateKey(parsed.data.startDate, timezone)) {
    return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Une exception passée ne peut pas être créée rétroactivement dans ce workflow." }, { status: 409 });
  }

  const startTime = parsed.data.allDay ? "00:00" : parsed.data.startTime;
  const endTime = parsed.data.allDay ? "23:59" : parsed.data.endTime;
  const record = await prisma.collaboratorAvailability.create({
    data: {
      organizationId: context.activeOrganizationId,
      collaboratorId: context.calendarCollaboratorId,
      dayOfWeek: null,
      specificDate: dateOnlyToUtcDate(parsed.data.startDate),
      startTime,
      endTime,
      availabilityStatus: scheduleExceptionStatusForType(parsed.data.type),
      recurrenceType: "Aucune",
      recurrenceStart: null,
      recurrenceUntil: dateOnlyToUtcDate(parsed.data.endDate),
      recurrenceInterval: 1,
      locationMode: parsed.data.locationMode,
      notes: parsed.data.reason || null,
      createdBy: session.userId,
    },
  });
  await writeAuditLog({
    userId: session.userId,
    action: "WORK_SCHEDULE_EXCEPTION_CREATED",
    entity: "CollaboratorScheduleException",
    entityId: record.id,
    request: req,
    metadata: { type: parsed.data.type, startDate: parsed.data.startDate, endDate: parsed.data.endDate },
  });
  await notifyScheduleExceptionManagers({
    actorEmployeeName: context.employee.fullName,
    exceptionType: parsed.data.type,
    startDate: parsed.data.startDate,
    organizationId: context.activeOrganizationId,
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, exception: serializeScheduleException(record, true) }, { status: 201 });
}
