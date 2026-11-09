/** Calendar dates in Retail are business-day labels, not UTC timestamps. */
export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function followingCivilDate(value: string): string {
  if (!isCivilDate(value)) throw new Error("INVALID_CIVIL_DATE");
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** Finds the UTC instant of midnight in the named IANA timezone. Each day's
 * boundary is calculated independently, so DST days are not assumed to be 24h. */
export function civilMidnightUtc(value: string, timezone: string): Date {
  if (!isCivilDate(value)) throw new Error("INVALID_CIVIL_DATE");
  const [year, month, day] = value.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let instant = targetUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(instant));
    const field = (key: string) => Number(parts.find((part) => part.type === key)?.value || 0);
    const localClockAsUtc = Date.UTC(field("year"), field("month") - 1, field("day"), field("hour"), field("minute"), field("second"));
    const correction = targetUtc - localClockAsUtc;
    if (correction === 0) break;
    instant += correction;
  }
  return new Date(instant);
}

/** Use the browser's actual calendar day for date-picker shortcuts, never
 * new Date().toISOString(), which can jump to tomorrow before local midnight. */
export function browserCivilDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
