import { type CollaboratorAvailability, type Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizePositionCode } from "@/lib/business-roles";
import { notifyUsers } from "@/lib/notifications";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export const DTSC_WEEKLY_AVAILABILITY_STATUS = "Disponible" as const;
export const DTSC_WEEKLY_RECURRENCE_TYPE = "Hebdomadaire" as const;

export const scheduleExceptionTypes = [
  "ABSENCE",
  "LEAVE",
  "SICKNESS",
  "MISSION",
  "TRAINING",
  "REMOTE_WORK",
  "EXTRA_AVAILABILITY",
  "UNAVAILABLE",
  "OTHER",
] as const;

export type ScheduleExceptionType = (typeof scheduleExceptionTypes)[number];

type WorkScheduleContext = {
  userId: string;
  activeOrganizationId: string | null;
  dtscInternal: boolean;
  calendarCollaboratorId: string | null;
  positionCode?: string | null;
  role?: string | null;
  canViewGlobal?: boolean;
};

const locationModeSchema = z.enum(["Site DTSC", "Télétravail", "Hybride", "Externe", "Mission", "Non défini"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dtscWeeklyAvailabilitySchema = z.object({
  collaboratorId: z.string().max(160).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  locationMode: locationModeSchema.default("Non défini"),
  notes: z.string().trim().max(800).optional().or(z.literal("")),
  effectiveFrom: dateOnlySchema.optional().or(z.literal("")),
  effectiveUntil: dateOnlySchema.optional().or(z.literal("")),
}).strict().refine((data) => data.endTime > data.startTime, {
  message: "L'heure de fin doit être après l'heure de début.",
  path: ["endTime"],
}).refine((data) => !data.effectiveFrom || !data.effectiveUntil || data.effectiveUntil >= data.effectiveFrom, {
  message: "La fin de validité doit être postérieure au début.",
  path: ["effectiveUntil"],
});

export const dtscWeeklyAvailabilityUpdateSchema = z.object({
  collaboratorId: z.string().max(160).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  locationMode: locationModeSchema.optional(),
  notes: z.string().trim().max(800).optional().or(z.literal("")),
  effectiveFrom: dateOnlySchema.optional().or(z.literal("")),
  effectiveUntil: dateOnlySchema.optional().or(z.literal("")),
}).strict();

export const dtscScheduleExceptionSchema = z.object({
  collaboratorId: z.string().max(160).optional(),
  type: z.enum(scheduleExceptionTypes),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  startTime: timeSchema.default("00:00"),
  endTime: timeSchema.default("23:59"),
  allDay: z.boolean().default(false),
  locationMode: locationModeSchema.default("Non défini"),
  reason: z.string().trim().max(800).optional().or(z.literal("")),
}).strict().refine((data) => data.endDate >= data.startDate, {
  message: "La date de fin doit être postérieure à la date de début.",
  path: ["endDate"],
}).refine((data) => data.endDate > data.startDate || data.allDay || data.endTime > data.startTime, {
  message: "L'heure de fin doit être après l'heure de début pour une exception sur une seule journée.",
  path: ["endTime"],
});

export const dtscScheduleExceptionUpdateSchema = z.object({
  collaboratorId: z.string().max(160).optional(),
  type: z.enum(scheduleExceptionTypes).optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  allDay: z.boolean().optional(),
  locationMode: locationModeSchema.optional(),
  reason: z.string().trim().max(800).optional().or(z.literal("")),
}).strict();

const exceptionStatusByType: Record<ScheduleExceptionType, string> = {
  ABSENCE: "Absent",
  LEAVE: "Congé",
  SICKNESS: "Maladie",
  MISSION: "Mission",
  TRAINING: "Formation",
  REMOTE_WORK: "Télétravail",
  EXTRA_AVAILABILITY: "Disponible",
  UNAVAILABLE: "Indisponible",
  OTHER: "Autre",
};

const exceptionTypeByStatus: Record<string, ScheduleExceptionType> = {
  Absent: "ABSENCE",
  "Absence personnelle": "ABSENCE",
  "Absence administrative": "ABSENCE",
  Congé: "LEAVE",
  Maladie: "SICKNESS",
  Mission: "MISSION",
  Formation: "TRAINING",
  Télétravail: "REMOTE_WORK",
  Disponible: "EXTRA_AVAILABILITY",
  Indisponible: "UNAVAILABLE",
  Occupé: "UNAVAILABLE",
  Autre: "OTHER",
};

export function canViewOrganizationAvailability(context: WorkScheduleContext) {
  if (!context.dtscInternal) return Boolean(context.canViewGlobal);
  const positionCode = normalizePositionCode(context.positionCode || "");
  return context.role === "ADMIN" || positionCode === "CEO" || positionCode === "COO" || positionCode === "HR_CFO";
}

export function canManageOwnAvailability(context: WorkScheduleContext, collaboratorId?: string | null) {
  if (!context.calendarCollaboratorId || !collaboratorId) return false;
  if (context.dtscInternal) return context.calendarCollaboratorId === collaboratorId;
  return context.calendarCollaboratorId === collaboratorId;
}

export function rejectCrossCollaboratorWrite(context: WorkScheduleContext, requestedCollaboratorId?: string | null) {
  return Boolean(requestedCollaboratorId && requestedCollaboratorId !== context.calendarCollaboratorId);
}

export function isDtscWeeklyAvailability(record: Pick<CollaboratorAvailability, "recurrenceType" | "dayOfWeek" | "specificDate" | "availabilityStatus">) {
  return record.recurrenceType === DTSC_WEEKLY_RECURRENCE_TYPE && typeof record.dayOfWeek === "number" && !record.specificDate && record.availabilityStatus === DTSC_WEEKLY_AVAILABILITY_STATUS;
}

export function isDtscScheduleException(record: Pick<CollaboratorAvailability, "recurrenceType" | "specificDate">) {
  return record.recurrenceType === "Aucune" && Boolean(record.specificDate);
}

export function scheduleExceptionTypeForStatus(status: string) {
  return exceptionTypeByStatus[status] || "OTHER";
}

export function scheduleExceptionStatusForType(type: ScheduleExceptionType) {
  return exceptionStatusByType[type];
}

export function dtscWeeklyAvailabilityWhere(
  context: WorkScheduleContext,
  collaboratorId?: string,
): Prisma.CollaboratorAvailabilityWhereInput {
  const targetId = collaboratorId && canViewOrganizationAvailability(context) ? collaboratorId : context.calendarCollaboratorId || "__no_employee__";
  return {
    organizationId: context.activeOrganizationId || DTSC_INTERNAL_ORGANIZATION_ID,
    collaboratorId: targetId,
    deletedAt: null,
    recurrenceType: DTSC_WEEKLY_RECURRENCE_TYPE,
    specificDate: null,
    dayOfWeek: { not: null },
    availabilityStatus: DTSC_WEEKLY_AVAILABILITY_STATUS,
  };
}

export function dtscScheduleExceptionWhere(
  context: WorkScheduleContext,
  collaboratorId?: string,
): Prisma.CollaboratorAvailabilityWhereInput {
  const targetId = collaboratorId && canViewOrganizationAvailability(context) ? collaboratorId : context.calendarCollaboratorId || "__no_employee__";
  return {
    organizationId: context.activeOrganizationId || DTSC_INTERNAL_ORGANIZATION_ID,
    collaboratorId: targetId,
    deletedAt: null,
    recurrenceType: "Aucune",
    specificDate: { not: null },
  };
}

export function serializeWeeklyAvailability(record: CollaboratorAvailability) {
  return {
    id: record.id,
    collaboratorId: record.collaboratorId,
    dayOfWeek: record.dayOfWeek,
    startTime: record.startTime,
    endTime: record.endTime,
    locationMode: record.locationMode,
    notes: record.notes,
    effectiveFrom: record.recurrenceStart ? dateOnly(record.recurrenceStart) : null,
    effectiveUntil: record.recurrenceUntil ? dateOnly(record.recurrenceUntil) : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function serializeScheduleException(record: CollaboratorAvailability, includeReason = false) {
  const startDate = record.specificDate ? dateOnly(record.specificDate) : null;
  const endDate = record.recurrenceUntil ? dateOnly(record.recurrenceUntil) : startDate;
  return {
    id: record.id,
    collaboratorId: record.collaboratorId,
    type: scheduleExceptionTypeForStatus(record.availabilityStatus),
    statusLabel: record.availabilityStatus,
    startDate,
    endDate,
    startTime: record.startTime,
    endTime: record.endTime,
    allDay: record.startTime === "00:00" && record.endTime === "23:59",
    locationMode: record.locationMode,
    reason: includeReason ? record.notes : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function ensureNoWeeklyAvailabilityOverlap({
  organizationId,
  collaboratorId,
  dayOfWeek,
  startTime,
  endTime,
  effectiveFrom,
  effectiveUntil,
  excludeId,
}: {
  organizationId: string;
  collaboratorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  excludeId?: string;
}) {
  const candidates = await prisma.collaboratorAvailability.findMany({
    where: {
      organizationId,
      collaboratorId,
      deletedAt: null,
      recurrenceType: DTSC_WEEKLY_RECURRENCE_TYPE,
      availabilityStatus: DTSC_WEEKLY_AVAILABILITY_STATUS,
      specificDate: null,
      dayOfWeek,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startTime: true, endTime: true, recurrenceStart: true, recurrenceUntil: true },
    take: 100,
  });
  return candidates.find((candidate) => {
    if (!dateRangesOverlap(effectiveFrom, effectiveUntil, candidate.recurrenceStart, candidate.recurrenceUntil)) return false;
    return timeStringValue(candidate.startTime) < timeStringValue(endTime) && timeStringValue(candidate.endTime) > timeStringValue(startTime);
  }) || null;
}

export function dateOnlyToUtcDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function todayDateKey(timezone: string) {
  return dateKeyForInstant(new Date(), timezone);
}

export function yesterdayOfDateKey(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return dateOnly(date);
}

export function isPastDateKey(value: string, timezone: string) {
  return value < todayDateKey(timezone);
}

export async function resolveDtscEffectiveAvailability({
  collaboratorId,
  startDateTime,
  endDateTime,
}: {
  collaboratorId: string;
  startDateTime: Date;
  endDateTime: Date;
}) {
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { id: collaboratorId, status: { not: "EXITED" } },
    select: { id: true, user: { select: { timezone: true } } },
  });
  const timezone = employee?.user?.timezone || "Africa/Kinshasa";
  const records = await prisma.collaboratorAvailability.findMany({
    where: {
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
      collaboratorId,
      deletedAt: null,
    },
    orderBy: [{ dayOfWeek: "asc" }, { specificDate: "asc" }, { startTime: "asc" }],
    take: 500,
  });

  const weekly = records.filter(isDtscWeeklyAvailability);
  const exceptions = records.filter(isDtscScheduleException);
  const legacy = records.filter((record) => !isDtscWeeklyAvailability(record) && !isDtscScheduleException(record));
  const startKey = dateKeyForInstant(startDateTime, timezone);
  const endKey = dateKeyForInstant(endDateTime, timezone);
  const dateKeys = enumerateDateKeys(startKey, endKey);
  const blocking: Array<{ id: string; status: string; startTime: string; endTime: string }> = [];
  const warnings: Array<{ id: string; status: string; startTime: string; endTime: string }> = [];
  let outsideAvailability = false;
  let hasDeclaredAvailability = false;

  for (const dateKey of dateKeys) {
    const eventStart = dateKey === startKey ? localMinutesForInstant(startDateTime, timezone) : 0;
    const eventEnd = dateKey === endKey ? localMinutesForInstant(endDateTime, timezone) : 1440;
    const dayOfWeek = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
    const weeklyForDay = weekly.filter((record) => record.dayOfWeek === dayOfWeek && recordEffectiveOnDate(record, dateKey));
    const exceptionsForDay = exceptions.filter((record) => exceptionAppliesOnDate(record, dateKey));
    const legacyForDay = legacy.filter((record) => legacyAvailabilityAppliesToDateKey(record, dateKey));
    const baseIntervals = weeklyForDay.map((record) => interval(record.startTime, record.endTime, record.id));
    const extraIntervals = exceptionsForDay
      .filter((record) => scheduleExceptionTypeForStatus(record.availabilityStatus) === "EXTRA_AVAILABILITY")
      .map((record) => intervalForExceptionDay(record, dateKey));
    const legacyAvailableIntervals = legacyForDay
      .filter((record) => ["Disponible", "Télétravail", "Sur site"].includes(record.availabilityStatus))
      .map((record) => interval(record.startTime, record.endTime, record.id));
    const availableIntervals = [...baseIntervals, ...extraIntervals, ...legacyAvailableIntervals];
    hasDeclaredAvailability = hasDeclaredAvailability || availableIntervals.length > 0;

    const relevantExceptions = [...exceptionsForDay, ...legacyForDay];
    for (const record of relevantExceptions) {
      const range = isDtscScheduleException(record) ? intervalForExceptionDay(record, dateKey) : interval(record.startTime, record.endTime, record.id);
      if (!intervalsOverlap(range.start, range.end, eventStart, eventEnd)) continue;
      if (isBlockingScheduleStatus(record.availabilityStatus)) {
        blocking.push({ id: record.id, status: record.availabilityStatus, startTime: minutesToTime(range.start), endTime: minutesToTime(range.end) });
      } else if (isWarningScheduleStatus(record.availabilityStatus)) {
        warnings.push({ id: record.id, status: record.availabilityStatus, startTime: minutesToTime(range.start), endTime: minutesToTime(range.end) });
      }
    }

    const blockersForDay = relevantExceptions
      .filter((record) => isBlockingScheduleStatus(record.availabilityStatus))
      .map((record) => isDtscScheduleException(record) ? intervalForExceptionDay(record, dateKey) : interval(record.startTime, record.endTime, record.id));
    const effectiveIntervals = blockersForDay.reduce((current, blocker) => subtractIntervalList(current, blocker), availableIntervals);
    if (availableIntervals.length > 0 && !effectiveIntervals.some((item) => item.start <= eventStart && item.end >= eventEnd)) {
      outsideAvailability = true;
    }
  }

  return { timezone, blocking, warnings, outsideAvailability: hasDeclaredAvailability && outsideAvailability, hasDeclaredAvailability };
}

export async function notifyScheduleExceptionManagers({
  actorEmployeeName,
  exceptionType,
  startDate,
  organizationId = DTSC_INTERNAL_ORGANIZATION_ID,
}: {
  actorEmployeeName: string;
  exceptionType: ScheduleExceptionType;
  startDate: string;
  organizationId?: string;
}) {
  const targetPositions = ["ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"].includes(exceptionType)
    ? ["COO", "HR_CFO"]
    : ["MISSION", "TRAINING"].includes(exceptionType) ? ["COO"] : [];
  if (!targetPositions.length) return;

  const employees = await prisma.hrcfoEmployee.findMany({
    where: { status: { not: "EXITED" }, userId: { not: null } },
    include: { position: true },
    take: 100,
  });
  const userIds = employees
    .filter((employee) => targetPositions.includes(normalizePositionCode(employee.position?.code || employee.positionCode || employee.jobTitle)))
    .map((employee) => employee.userId)
    .filter((userId): userId is string => Boolean(userId));
  if (!userIds.length) return;

  const label = ["ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"].includes(exceptionType) ? "une absence" : "une exception de planning";
  await notifyUsers({
    userIds: [...new Set(userIds)],
    title: "Mise à jour du planning DTSC",
    body: `${actorEmployeeName} a déclaré ${label} à partir du ${startDate}.`,
    type: "CALENDAR",
    targetUrl: "/calendar",
    organizationId,
  });
}

function isBlockingScheduleStatus(status: string) {
  return ["Absent", "Congé", "Maladie", "Absence personnelle", "Absence administrative", "Indisponible"].includes(status);
}

function isWarningScheduleStatus(status: string) {
  return ["Mission", "Formation"].includes(status);
}

function recordEffectiveOnDate(record: Pick<CollaboratorAvailability, "recurrenceStart" | "recurrenceUntil">, dateKey: string) {
  const from = record.recurrenceStart ? dateOnly(record.recurrenceStart) : null;
  const until = record.recurrenceUntil ? dateOnly(record.recurrenceUntil) : null;
  return (!from || dateKey >= from) && (!until || dateKey <= until);
}

function exceptionAppliesOnDate(record: Pick<CollaboratorAvailability, "specificDate" | "recurrenceUntil">, dateKey: string) {
  if (!record.specificDate) return false;
  const start = dateOnly(record.specificDate);
  const end = record.recurrenceUntil ? dateOnly(record.recurrenceUntil) : start;
  return dateKey >= start && dateKey <= end;
}

function intervalForExceptionDay(record: CollaboratorAvailability, dateKey: string) {
  const startDate = record.specificDate ? dateOnly(record.specificDate) : dateKey;
  const endDate = record.recurrenceUntil ? dateOnly(record.recurrenceUntil) : startDate;
  return {
    id: record.id,
    start: dateKey === startDate ? timeStringValue(record.startTime) : 0,
    end: dateKey === endDate ? timeStringValue(record.endTime) : 1440,
  };
}

function legacyAvailabilityAppliesToDateKey(record: CollaboratorAvailability, dateKey: string) {
  if (record.specificDate) return dateOnly(record.specificDate) === dateKey;
  if (!recordEffectiveOnDate(record, dateKey)) return false;
  const day = new Date(`${dateKey}T00:00:00.000Z`);
  const intervalValue = Math.max(1, record.recurrenceInterval || 1);
  const recurrenceStart = record.recurrenceStart ? dateOnly(record.recurrenceStart) : null;
  if (record.recurrenceType === "Hebdomadaire") {
    if (record.dayOfWeek !== day.getUTCDay()) return false;
    if (!recurrenceStart) return true;
    return Math.floor(daysBetweenDateKeys(recurrenceStart, dateKey) / 7) % intervalValue === 0;
  }
  if (record.recurrenceType === "Quotidienne") {
    return !recurrenceStart || daysBetweenDateKeys(recurrenceStart, dateKey) % intervalValue === 0;
  }
  if (record.recurrenceType === "Mensuelle") {
    if (!recurrenceStart) return record.dayOfWeek === null || record.dayOfWeek === day.getUTCDay();
    const start = new Date(`${recurrenceStart}T00:00:00.000Z`);
    return day.getUTCDate() === start.getUTCDate() && monthsBetweenDateKeys(recurrenceStart, dateKey) % intervalValue === 0;
  }
  return typeof record.dayOfWeek === "number" && record.dayOfWeek === day.getUTCDay();
}

function dateRangesOverlap(leftStart: Date | null, leftEnd: Date | null, rightStart: Date | null, rightEnd: Date | null) {
  const min = -8.64e15;
  const max = 8.64e15;
  const leftStartValue = leftStart?.getTime() ?? min;
  const leftEndValue = leftEnd?.getTime() ?? max;
  const rightStartValue = rightStart?.getTime() ?? min;
  const rightEndValue = rightEnd?.getTime() ?? max;
  return leftStartValue <= rightEndValue && rightStartValue <= leftEndValue;
}

function interval(startTime: string, endTime: string, id?: string) {
  return { id, start: timeStringValue(startTime), end: timeStringValue(endTime) };
}

function intervalsOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function subtractIntervalList(
  intervals: Array<{ id?: string; start: number; end: number }>,
  blocker: { start: number; end: number },
) {
  return intervals.flatMap((current) => {
    if (!intervalsOverlap(current.start, current.end, blocker.start, blocker.end)) return [current];
    const next: Array<{ id?: string; start: number; end: number }> = [];
    if (blocker.start > current.start) next.push({ ...current, end: Math.min(blocker.start, current.end) });
    if (blocker.end < current.end) next.push({ ...current, start: Math.max(blocker.end, current.start) });
    return next.filter((item) => item.end > item.start);
  });
}

function dateKeyForInstant(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localMinutesForInstant(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hours = Number(parts.find((item) => item.type === "hour")?.value || 0);
  const minutes = Number(parts.find((item) => item.type === "minute")?.value || 0);
  return hours * 60 + minutes;
}

function enumerateDateKeys(start: string, end: string) {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  for (let guard = 0; cursor <= last && guard < 370; guard += 1) {
    result.push(dateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function timeStringValue(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function minutesToTime(value: number) {
  const safe = Math.max(0, Math.min(1440, value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function daysBetweenDateKeys(start: string, end: string) {
  return Math.floor((new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime()) / 86_400_000);
}

function monthsBetweenDateKeys(start: string, end: string) {
  const left = new Date(`${start}T00:00:00.000Z`);
  const right = new Date(`${end}T00:00:00.000Z`);
  return (right.getUTCFullYear() - left.getUTCFullYear()) * 12 + (right.getUTCMonth() - left.getUTCMonth());
}
