import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * WF-06A is a pure schedule calculator, NOT a workflow trigger or scheduler.
 * Do not expose this contract as a runnable trigger until a transactional,
 * tenant-scoped occurrence store, quotas and a worker are certified.
 */
const MINUTES_IN_DAY = 24 * 60;
const MAX_LOOKAHEAD_DAYS = 35;
const MINUTE_MS = 60_000;
const DAY_MS = MINUTES_IN_DAY * MINUTE_MS;

function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date("2026-01-01T00:00:00Z"));
    return true;
  } catch { return false; }
}

export const workflowDailyWeeklyScheduleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY"]),
  timeZone: z.string().trim().min(1).max(100).refine(validTimeZone, "Invalid IANA time zone"),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
}).strict().superRefine((value, context) => {
  if (value.frequency === "WEEKLY" && value.dayOfWeek === undefined) {
    context.addIssue({ code: "custom", path: ["dayOfWeek"], message: "WEEKLY requires dayOfWeek (Sunday = 0)" });
  }
  if (value.frequency === "DAILY" && value.dayOfWeek !== undefined) {
    context.addIssue({ code: "custom", path: ["dayOfWeek"], message: "DAILY must not include dayOfWeek" });
  }
});

export type WorkflowDailyWeeklySchedule = z.infer<typeof workflowDailyWeeklyScheduleSchema>;
export type WorkflowScheduledOccurrence = {
  scheduledAt: Date;
  localDate: string;
  localTime: string;
  timeZone: string;
  occurrenceKey: string;
};

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function partsInTimeZone(date: Date, formatter: Intl.DateTimeFormat): Parts {
  const fields = formatter.formatToParts(date);
  const field = (name: Intl.DateTimeFormatPartTypes) =>
    Number(fields.find((part) => part.type === name)?.value ?? "NaN");
  return { year: field("year"), month: field("month"), day: field("day"), hour: field("hour"), minute: field("minute") };
}

function sameLocalTime(parts: Parts, desired: Parts) {
  return parts.year === desired.year && parts.month === desired.month
    && parts.day === desired.day && parts.hour === desired.hour && parts.minute === desired.minute;
}

function candidateInstants(local: Parts, formatter: Intl.DateTimeFormat): Date[] {
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  // Offset discovery around the target catches both DST sides, half-hour transitions
  // and non-hour time zones, without relying on host timezone or Date.parse(local).
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = naive + hours * 60 * MINUTE_MS;
    const sample = partsInTimeZone(new Date(probe), formatter);
    const localProbeMs = Date.UTC(sample.year, sample.month - 1, sample.day, sample.hour, sample.minute);
    offsets.add(localProbeMs - probe);
  }
  return [...offsets].map((offset) => new Date(naive - offset))
    .filter((instant) => sameLocalTime(partsInTimeZone(instant, formatter), local))
    .sort((a, b) => a.getTime() - b.getTime());
}

export function getNextWorkflowOccurrence(
  rawSchedule: unknown,
  afterExclusive: Date,
  scope: { organizationId: string; scheduleId: string; versionId: string },
): WorkflowScheduledOccurrence | null {
  const schedule = workflowDailyWeeklyScheduleSchema.parse(rawSchedule);
  if (!(afterExclusive instanceof Date) || !Number.isFinite(afterExclusive.getTime())) {
    throw new Error("Invalid instant for workflow schedule");
  }
  if (!scope.organizationId || !scope.scheduleId || !scope.versionId
    || [scope.organizationId, scope.scheduleId, scope.versionId].some((part) => part.length > 191)) {
    throw new Error("Workflow occurrence requires bounded tenant, schedule and version identifiers");
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timeZone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const today = partsInTimeZone(afterExclusive, formatter);
  const firstDay = Date.UTC(today.year, today.month - 1, today.day);
  for (let dayOffset = 0; dayOffset <= MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const day = new Date(firstDay + dayOffset * DAY_MS);
    if (schedule.frequency === "WEEKLY" && day.getUTCDay() !== schedule.dayOfWeek) continue;
    const local = {
      year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(),
      hour: schedule.hour, minute: schedule.minute,
    };
    // Policy: non-existent spring-forward wall times are SKIPPED; fall-back
    // repeated times run at the FIRST instant only, never twice.
    const first = candidateInstants(local, formatter)[0];
    if (!first || first.getTime() <= afterExclusive.getTime()) continue;
    const localDate = `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
    const localTime = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
    // A persisted unique key will be mandatory before any runtime activation.
    // Do not use an instant as the uniqueness key: fall-back may repeat locally.
    const occurrenceKey = createHash("sha256").update(JSON.stringify([
      scope.organizationId, scope.scheduleId, scope.versionId, localDate, localTime,
    ])).digest("hex");
    return { scheduledAt: first, localDate, localTime, timeZone: schedule.timeZone, occurrenceKey };
  }
  return null;
}
