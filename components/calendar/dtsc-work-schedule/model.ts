import { translateCalendarSchedule, type CalendarScheduleKey } from "@/lib/i18n";
import { userLocale } from "@/lib/user-format";

export type DtscWeeklyAvailabilityItem = {
  id: string;
  collaboratorId: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  locationMode: string;
  notes?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type DtscScheduleExceptionItem = {
  id: string;
  collaboratorId: string;
  type: string;
  statusLabel: string;
  startDate?: string | null;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  locationMode: string;
  reason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CollaboratorOption = {
  id: string;
  fullName: string;
  email?: string | null;
  department: string;
  jobTitle: string;
};

export type ScheduleSummary = {
  hoursAvailableThisWeek: number;
  availableDays: number;
  configuredSlots: number;
  overlapConflicts: number;
};

export type ScheduleText = Record<CalendarScheduleKey, string>;
export type DeleteTarget = { kind: "weekly" | "exception"; id: string; label: string } | null;

export const absenceTypes = new Set(["ABSENCE", "ADMINISTRATIVE_ABSENCE", "OTHER_ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE"]);
export const exceptionTypes = ["MISSION", "TRAINING", "REMOTE_WORK", "EXTRA_AVAILABILITY", "OTHER"];
export const absenceTypeOptions = ["ABSENCE", "ADMINISTRATIVE_ABSENCE", "LEAVE", "SICKNESS", "UNAVAILABLE", "OTHER_ABSENCE"];

const locationModeKeys: Record<string, CalendarScheduleKey> = {
  "Non défini": "locationUndefined",
  "Site DTSC": "locationSite",
  "Télétravail": "locationRemote",
  "Hybride": "locationHybrid",
  "Externe": "locationExternal",
  "Mission": "locationMission",
};

export function scheduleText(locale: string): ScheduleText {
  return new Proxy({} as ScheduleText, {
    get: (_target, property) => typeof property === "string"
      ? translateCalendarSchedule(locale, property as CalendarScheduleKey)
      : undefined,
  });
}

export function calendarWeekdays(locale: string) {
  const formatter = new Intl.DateTimeFormat(userLocale({ locale }), { weekday: "long", timeZone: "UTC" });
  const sunday = Date.UTC(2026, 0, 4);
  return Array.from({ length: 7 }, (_, index) => {
    const label = formatter.format(new Date(sunday + index * 86_400_000));
    return label.charAt(0).toUpperCase() + label.slice(1);
  });
}

export function exceptionLabel(type: string, locale: string) {
  const suffix = type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const key = `exception${suffix}` as CalendarScheduleKey;
  return translateCalendarSchedule(locale, key) || type;
}

export function locationModeLabel(value: string, locale: string) {
  const key = locationModeKeys[value];
  return key ? translateCalendarSchedule(locale, key) : value;
}

export function dateRangeLabel(item: DtscScheduleExceptionItem) {
  return item.startDate === item.endDate
    ? item.startDate || "—"
    : `${item.startDate || "—"} → ${item.endDate || "—"}`;
}

export function effectivePeriodLabel(item: DtscWeeklyAvailabilityItem, text: ScheduleText) {
  return `${text.from} ${item.effectiveFrom || text.now} · ${text.until} ${item.effectiveUntil || text.noEnd}`;
}

export function sortWeekly(left: DtscWeeklyAvailabilityItem, right: DtscWeeklyAvailabilityItem) {
  return (left.dayOfWeek ?? 0) - (right.dayOfWeek ?? 0) || left.startTime.localeCompare(right.startTime);
}

export function currentDateKey(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
