import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canAccessInternalCalendar, getCalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import {
  canViewOrganizationAvailability,
  dtscScheduleExceptionWhere,
  dtscWeeklyAvailabilityWhere,
  serializeScheduleException,
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.dtscInternal || !context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Mon planning est réservé aux collaborateurs DTSC actifs." }, { status: 403 });
  }
  const userPreference = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
  const timezone = userPreference?.timezone || "Africa/Kinshasa";
  const today = todayDateKey(timezone);
  const [weeklyRecords, exceptionRecords] = await Promise.all([
    prisma.collaboratorAvailability.findMany({
      where: dtscWeeklyAvailabilityWhere(context),
      orderBy: [{ dayOfWeek: "asc" }, { recurrenceStart: "desc" }, { startTime: "asc" }],
      take: 300,
    }),
    prisma.collaboratorAvailability.findMany({
      where: dtscScheduleExceptionWhere(context),
      orderBy: [{ specificDate: "desc" }, { startTime: "asc" }],
      take: 300,
    }),
  ]);
  const activeWeekly = weeklyRecords.filter((record) => {
    const from = record.recurrenceStart?.toISOString().slice(0, 10) || null;
    const until = record.recurrenceUntil?.toISOString().slice(0, 10) || null;
    return (!from || from <= today) && (!until || until >= today);
  });
  const totalMinutes = activeWeekly.reduce((sum, record) => sum + Math.max(0, timeMinutes(record.endTime) - timeMinutes(record.startTime)), 0);
  const days = new Set(activeWeekly.map((record) => record.dayOfWeek).filter((value): value is number => typeof value === "number"));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    weeklyAvailabilities: weeklyRecords.map(serializeWeeklyAvailability),
    exceptions: exceptionRecords.map((record) => serializeScheduleException(record, true)),
    summary: {
      hoursAvailableThisWeek: Math.round((totalMinutes / 60) * 100) / 100,
      availableDays: days.size,
      configuredSlots: activeWeekly.length,
      overlapConflicts: 0,
    },
    policy: {
      selfServiceOnly: true,
      availabilityIsWorkedTime: false,
      canViewOrganizationAvailability: canViewOrganizationAvailability(context),
      timezone,
    },
  });
}

function timeMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}
