import type { CollaboratorAvailability } from "@prisma/client";
import type { CalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";

export const DTSC_WEEKLY_STATUS = "Disponible";
export const DTSC_WEEKLY_RECURRENCE = "Hebdomadaire";
export const DTSC_EXCEPTION_RECURRENCE = "Aucune";

export const SCHEDULE_EXCEPTION_TYPES = [
  "ABSENCE",
  "LEAVE",
  "SICKNESS",
  "PERSONAL_ABSENCE",
  "ADMINISTRATIVE_ABSENCE",
  "MISSION",
  "TRAINING",
  "REMOTE_WORK",
  "EXTRA_AVAILABILITY",
  "UNAVAILABLE",
  "OTHER",
] as const;

export type ScheduleExceptionType = (typeof SCHEDULE_EXCEPTION_TYPES)[number];

const exceptionStatusByType: Record<ScheduleExceptionType, string> = {
  ABSENCE: "Absent",
  LEAVE: "Congé",
  SICKNESS: "Maladie",
  PERSONAL_ABSENCE: "Absence personnelle",
  ADMINISTRATIVE_ABSENCE: "Absence administrative",
  MISSION: "Mission",
  TRAINING: "Formation",
  REMOTE_WORK: "Télétravail exceptionnel",
  EXTRA_AVAILABILITY: "Disponibilité exceptionnelle",
  UNAVAILABLE: "Indisponible",
  OTHER: "Autre exception",
};

const exceptionTypeByStatus = new Map(Object.entries(exceptionStatusByType).map(([type, status]) => [status, type as ScheduleExceptionType]));

export function scheduleExceptionStatus(type: ScheduleExceptionType) {
  return exceptionStatusByType[type];
}

export function scheduleExceptionType(status: string): ScheduleExceptionType {
  return exceptionTypeByStatus.get(status) || legacyExceptionType(status);
}

function legacyExceptionType(status: string): ScheduleExceptionType {
  if (status === "Congé") return "LEAVE";
  if (status === "Absent") return "ABSENCE";
  if (status === "Mission") return "MISSION";
  if (status === "Formation") return "TRAINING";
  if (status === "Télétravail") return "REMOTE_WORK";
  if (status === "Indisponible" || status === "Occupé") return "UNAVAILABLE";
  if (status === "Disponible" || status === "Sur site") return "EXTRA_AVAILABILITY";
  return "OTHER";
}

export function isDtscWeeklyAvailability(row: Pick<CollaboratorAvailability, "recurrenceType" | "specificDate" | "availabilityStatus">) {
  return row.recurrenceType === DTSC_WEEKLY_RECURRENCE && !row.specificDate && row.availabilityStatus === DTSC_WEEKLY_STATUS;
}

export function isDtscScheduleException(row: Pick<CollaboratorAvailability, "recurrenceType" | "specificDate">) {
  return row.recurrenceType === DTSC_EXCEPTION_RECURRENCE && Boolean(row.specificDate);
}

export function canManageOwnWorkSchedule(context: CalendarContext, collaboratorId?: string | null) {
  return Boolean(context.dtscInternal && context.calendarCollaboratorId && collaboratorId === context.calendarCollaboratorId);
}

export function canViewTeamWorkSchedule(context: CalendarContext) {
  return Boolean(context.dtscInternal && (context.canViewGlobal || context.canManagePeople || context.canViewPeopleAvailability));
}

export function dtscWorkScheduleWhere(context: CalendarContext, collaboratorId?: string) {
  const requestedId = collaboratorId && canViewTeamWorkSchedule(context) ? collaboratorId : context.calendarCollaboratorId || "__no_employee__";
  return {
    organizationId: context.activeOrganizationId,
    collaboratorId: requestedId,
    deletedAt: null,
  };
}

export async function listDtscWorkSchedule(context: CalendarContext, collaboratorId?: string) {
  const where = dtscWorkScheduleWhere(context, collaboratorId);
  const rows = await prisma.collaboratorAvailability.findMany({
    where,
    orderBy: [{ dayOfWeek: "asc" }, { specificDate: "asc" }, { startTime: "asc" }],
    take: 400,
  });
  return {
    weekly: rows.filter(isDtscWeeklyAvailability),
    exceptions: rows.filter(isDtscScheduleException),
  };
}

export async function assertNoWeeklyOverlap({
  context,
  collaboratorId,
  dayOfWeek,
  startTime,
  endTime,
  effectiveFrom,
  effectiveUntil,
  excludeId,
}: {
  context: CalendarContext;
  collaboratorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
  excludeId?: string;
}) {
  const candidates = await prisma.collaboratorAvailability.findMany({
    where: {
      organizationId: context.activeOrganizationId,
      collaboratorId,
      deletedAt: null,
      recurrenceType: DTSC_WEEKLY_RECURRENCE,
      specificDate: null,
      availabilityStatus: DTSC_WEEKLY_STATUS,
      dayOfWeek,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startTime: true, endTime: true, recurrenceStart: true, recurrenceUntil: true },
  });
  const overlap = candidates.find((candidate) =>
    rangesOverlap(startTime, endTime, candidate.startTime, candidate.endTime)
      && dateRangesOverlap(effectiveFrom || null, effectiveUntil || null, candidate.recurrenceStart, candidate.recurrenceUntil),
  );
  return overlap || null;
}

export async function detectEffectiveWorkScheduleConflicts({
  context,
  participantIds,
  startDateTime,
  endDateTime,
  excludeEventId,
}: {
  context: CalendarContext;
  participantIds: string[];
  startDateTime: Date;
  endDateTime: Date;
  excludeEventId?: string;
}) {
  const uniqueIds = [...new Set(participantIds.filter(Boolean))];
  if (!uniqueIds.length || !context.dtscInternal) return [];

  const [existingEvents, scheduleRows, collaborators, user] = await Promise.all([
    prisma.internalCalendarEvent.findMany({
      where: {
        organizationId: context.activeOrganizationId,
        deletedAt: null,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        startDateTime: { lt: endDateTime },
        endDateTime: { gt: startDateTime },
        OR: [
          { ownerCollaboratorId: { in: uniqueIds } },
          { participants: { some: { collaboratorId: { in: uniqueIds }, participantStatus: "Actif" } } },
        ],
      },
      include: { participants: true },
      take: 80,
    }),
    prisma.collaboratorAvailability.findMany({
      where: { organizationId: context.activeOrganizationId, collaboratorId: { in: uniqueIds }, deletedAt: null },
      take: 500,
    }),
    prisma.hrcfoEmployee.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, fullName: true } }),
    prisma.user.findUnique({ where: { id: context.userId }, select: { timezone: true } }),
  ]);

  const timezone = validTimezone(user?.timezone) ? user!.timezone : "UTC";
  const names = new Map(collaborators.map((item) => [item.id, item.fullName]));
  const eventLocal = localDateTimeParts(startDateTime, timezone);
  const eventEndLocal = localDateTimeParts(endDateTime, timezone);
  const eventStartMinutes = eventLocal.hour * 60 + eventLocal.minute;
  const eventEndMinutes = eventEndLocal.dateKey === eventLocal.dateKey ? eventEndLocal.hour * 60 + eventEndLocal.minute : 24 * 60;
  const conflicts: Array<{
    collaboratorId: string;
    conflictType: string;
    conflictWithEventId?: string;
    conflictWithAvailabilityId?: string;
    severity: string;
    message: string;
  }> = [];

  for (const collaboratorId of uniqueIds) {
    const name = names.get(collaboratorId) || "Ce collaborateur";
    const overlappingEvent = existingEvents.find((event) =>
      event.ownerCollaboratorId === collaboratorId || event.participants.some((participant) => participant.collaboratorId === collaboratorId),
    );
    if (overlappingEvent) {
      conflicts.push({
        collaboratorId,
        conflictType: "Chevauchement événement",
        conflictWithEventId: overlappingEvent.id,
        severity: "Avertissement",
        message: `${name} a déjà « ${overlappingEvent.title} » sur ce créneau.`,
      });
    }

    const rows = scheduleRows.filter((row) => row.collaboratorId === collaboratorId);
    const weekly = rows.filter((row) => isDtscWeeklyAvailability(row) && weeklyApplies(row, eventLocal.dateKey, eventLocal.dayOfWeek));
    const exceptions = rows.filter((row) => isDtscScheduleException(row) && exceptionOverlaps(row, startDateTime, endDateTime));
    const blocking = exceptions.find((row) => ["ABSENCE", "LEAVE", "SICKNESS", "PERSONAL_ABSENCE", "ADMINISTRATIVE_ABSENCE", "UNAVAILABLE"].includes(scheduleExceptionType(row.availabilityStatus)));
    if (blocking) {
      conflicts.push({
        collaboratorId,
        conflictType: scheduleExceptionType(blocking.availabilityStatus),
        conflictWithAvailabilityId: blocking.id,
        severity: "Bloquant",
        message: `${name} a une absence ou indisponibilité déclarée sur ce créneau.`,
      });
      continue;
    }

    const warning = exceptions.find((row) => ["MISSION", "TRAINING"].includes(scheduleExceptionType(row.availabilityStatus)));
    if (warning) {
      conflicts.push({
        collaboratorId,
        conflictType: scheduleExceptionType(warning.availabilityStatus),
        conflictWithAvailabilityId: warning.id,
        severity: "Avertissement",
        message: `${name} a une ${scheduleExceptionType(warning.availabilityStatus) === "MISSION" ? "mission" : "formation"} sur ce créneau.`,
      });
    }

    const weeklyCovers = weekly.some((row) => timeRangeCovers(row.startTime, row.endTime, eventStartMinutes, eventEndMinutes));
    const extraCovers = exceptions.some((row) => scheduleExceptionType(row.availabilityStatus) === "EXTRA_AVAILABILITY" && exceptionCovers(row, startDateTime, endDateTime));
    if (!weeklyCovers && !extraCovers) {
      conflicts.push({
        collaboratorId,
        conflictType: "Hors disponibilité déclarée",
        severity: "Info",
        message: `${name} n'a pas de disponibilité effective couvrant entièrement ce créneau.`,
      });
    }
  }

  return conflicts;
}

export function exceptionDateRange(row: Pick<CollaboratorAvailability, "specificDate" | "recurrenceStart" | "recurrenceUntil" | "startTime" | "endTime">) {
  const start = row.recurrenceStart || combineUtcDateAndTime(row.specificDate, row.startTime);
  const end = row.recurrenceUntil || combineUtcDateAndTime(row.specificDate, row.endTime);
  return { start, end };
}

function exceptionOverlaps(row: CollaboratorAvailability, start: Date, end: Date) {
  const range = exceptionDateRange(row);
  return Boolean(range.start && range.end && range.start < end && range.end > start);
}

function exceptionCovers(row: CollaboratorAvailability, start: Date, end: Date) {
  const range = exceptionDateRange(row);
  return Boolean(range.start && range.end && range.start <= start && range.end >= end);
}

function weeklyApplies(row: CollaboratorAvailability, dateKey: string, dayOfWeek: number) {
  if (row.dayOfWeek !== dayOfWeek) return false;
  const from = storedDateKey(row.recurrenceStart);
  const until = storedDateKey(row.recurrenceUntil);
  return (!from || from <= dateKey) && (!until || until >= dateKey);
}

function storedDateKey(date?: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function localDateTimeParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const dayByName: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: dayByName[parts.weekday] ?? 0,
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
  };
}

function validTimezone(timezone?: string | null) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function combineUtcDateAndTime(date: Date | null | undefined, time: string) {
  if (!date) return null;
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setUTCHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return minutes(startA) < minutes(endB) && minutes(endA) > minutes(startB);
}

function timeRangeCovers(start: string, end: string, targetStart: number, targetEnd: number) {
  return minutes(start) <= targetStart && minutes(end) >= targetEnd;
}

function minutes(value: string) {
  const [hours = "0", mins = "0"] = value.split(":");
  return Number(hours) * 60 + Number(mins);
}

function dateRangesOverlap(startA: Date | null, endA: Date | null, startB: Date | null, endB: Date | null) {
  const aStart = startA?.getTime() ?? Number.NEGATIVE_INFINITY;
  const aEnd = endA?.getTime() ?? Number.POSITIVE_INFINITY;
  const bStart = startB?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bEnd = endB?.getTime() ?? Number.POSITIVE_INFINITY;
  return aStart <= bEnd && bStart <= aEnd;
}
