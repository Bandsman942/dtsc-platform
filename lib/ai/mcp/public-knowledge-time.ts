import { z } from "zod";

export const ianaZone = z.string().min(2).max(100).refine((zone) => {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; }
  catch { return false; }
}, "Invalid IANA timezone");

const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}, "Invalid calendar date");

export const currentTimeInput = z.object({ timezone: ianaZone.default("Africa/Kinshasa") }).strict();
export const convertTimeInput = z.object({
  source_timezone: ianaZone,
  target_timezone: ianaZone,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  date: validDate.optional(),
}).strict();

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

function formatLocal(parts: ReturnType<typeof zonedParts>) {
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function getCurrentTime(input: z.infer<typeof currentTimeInput>, now = new Date()) {
  const value = currentTimeInput.parse(input);
  return {
    timezone: value.timezone,
    local_datetime: formatLocal(zonedParts(now, value.timezone)),
    utc_datetime: now.toISOString(),
  };
}

/** A local time can be nonexistent or ambiguous across DST; fail explicitly. */
export function convertTime(input: z.infer<typeof convertTimeInput>, now = new Date()) {
  const value = convertTimeInput.parse(input);
  const sourceDate = value.date || (() => {
    const today = zonedParts(now, value.source_timezone);
    return `${today.year}-${today.month}-${today.day}`;
  })();
  const [year, month, day] = sourceDate.split("-").map(Number);
  const [hour, minute] = value.time.split(":").map(Number);
  const nominalUtc = Date.UTC(year, month - 1, day, hour, minute);
  const candidates: Date[] = [];
  // A real-world IANA UTC offset is within [-12h,+14h] and may be in 15m units.
  for (let step = -56; step <= 56; step++) {
    const instant = new Date(nominalUtc + step * 15 * 60_000);
    const local = zonedParts(instant, value.source_timezone);
    if (`${local.year}-${local.month}-${local.day}` === sourceDate &&
      Number(local.hour) === hour && Number(local.minute) === minute) candidates.push(instant);
  }
  if (!candidates.length) throw new Error("MCP_TIME_NONEXISTENT_LOCAL_TIME");
  if (candidates.length > 1) throw new Error("MCP_TIME_AMBIGUOUS_LOCAL_TIME");
  const instant = candidates[0];
  return {
    source_timezone: value.source_timezone, source_datetime: `${sourceDate}T${value.time}`,
    target_timezone: value.target_timezone, target_datetime: formatLocal(zonedParts(instant, value.target_timezone)),
    utc_datetime: instant.toISOString(),
  };
}
