import { userLocale, userTimeZone } from "@/lib/user-format";
import { recurrenceLabel } from "./text";
import type { CalendarWorkspaceText, DatePreset, ProfessionalAvailability } from "./types";

export function formatCalendarDate(value: string | Date, locale?: string | null, timezone?: string | null) {
  return new Intl.DateTimeFormat(userLocale({ locale }), { dateStyle: "medium", timeZone: userTimeZone({ timezone }) }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatCalendarDateTime(value: string | Date, locale?: string | null, timezone?: string | null) {
  return new Intl.DateTimeFormat(userLocale({ locale }), { dateStyle: "medium", timeStyle: "short", timeZone: userTimeZone({ timezone }) }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatCalendarTime(value: string | Date, locale?: string | null, timezone?: string | null) {
  return new Intl.DateTimeFormat(userLocale({ locale }), { hour: "2-digit", minute: "2-digit", timeZone: userTimeZone({ timezone }) }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatCalendarRange(start: string, end: string, locale?: string | null, timezone?: string | null) {
  return `${formatCalendarDateTime(start, locale, timezone)} — ${formatCalendarDateTime(end, locale, timezone)}`;
}

export function currentDateKey(timezone?: string | null) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: userTimeZone({ timezone }), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function resolveDateRange(preset: DatePreset, customDate: string) {
  const now = preset === "custom" ? new Date(`${customDate}T00:00:00`) : new Date();
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (preset === "week") {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  }
  if (preset === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  if (preset === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
  return { start, end };
}

export function availabilityIntersectsRange(record: ProfessionalAvailability, start: Date, end: Date) {
  const rangeStart = start.toISOString().slice(0, 10);
  const rangeEnd = end.toISOString().slice(0, 10);
  if (record.specificDate) {
    const date = record.specificDate.slice(0, 10);
    return date >= rangeStart && date <= rangeEnd;
  }
  const recurrenceStart = record.recurrenceStart?.slice(0, 10) || "0000-01-01";
  const recurrenceUntil = record.recurrenceUntil?.slice(0, 10) || "9999-12-31";
  if (recurrenceStart > rangeEnd || recurrenceUntil < rangeStart) return false;
  if (record.recurrenceType !== "Hebdomadaire" || typeof record.dayOfWeek !== "number") return true;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() === record.dayOfWeek) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

export function availabilityDateLabel(record: ProfessionalAvailability, locale: string | null | undefined, timezone: string | null | undefined, text: CalendarWorkspaceText) {
  if (record.specificDate) return formatCalendarDate(record.specificDate, locale, timezone);
  if (record.recurrenceType === "Hebdomadaire" && typeof record.dayOfWeek === "number") {
    const formatter = new Intl.DateTimeFormat(userLocale({ locale }), { weekday: "long", timeZone: "UTC" });
    const weekday = formatter.format(new Date(Date.UTC(2026, 0, 4 + record.dayOfWeek)));
    const start = record.recurrenceStart ? `${text.since} ${formatCalendarDate(record.recurrenceStart, locale, timezone)}` : text.recurring;
    const until = record.recurrenceUntil ? ` ${text.until} ${formatCalendarDate(record.recurrenceUntil, locale, timezone)}` : "";
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${start}${until}`;
  }
  return recurrenceLabel(record.recurrenceType, locale);
}

export function toDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
