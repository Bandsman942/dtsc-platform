import { z } from "zod";

export const hirmsTransportStatuses = [
  "SENDING", "UPLOADING", "QUEUED", "RECEIVED", "REJECTED", "UNKNOWN_OUTCOME", "REFERENCE_UNCONFIRMED",
] as const;

const historyQuerySchema = z.object({
  status: z.enum(hirmsTransportStatuses).optional(),
  search: z.string().trim().max(80).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(["json","csv"]).default("json"),
});
export type HirmsHistoryFilters = Pick<z.infer<typeof historyQuerySchema>, "status"|"search"|"from"|"to">;

function validDay(value: string) {
  // Validate civil dates without synthesizing UTC instants or shifting business dates.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= monthDays[month - 1];
}
export function parseHirmsHistoryQuery(url: URL) {
  const raw = Object.fromEntries(["status","search","from","to","format"]
    .map(key => [key, url.searchParams.get(key) || undefined]));
  const result = historyQuerySchema.safeParse(raw);
  if (!result.success) return null;
  const {from,to} = result.data;
  if ((from && !validDay(from)) || (to && !validDay(to)) || (from && to && from>to)) return null;
  return result.data;
}

/** Query submission instants using explicit UTC civil dates, never ERP business dates. */
export function utcSubmittedAtRange({from,to}:HirmsHistoryFilters) {
  return from||to ? {
    ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
    ...(to ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
  } : undefined;
}

/** Neutralize spreadsheet formulas even when cells are quoted CSV fields. */
export function hirmsCsvCell(value: unknown): string {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  const protectedValue = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + protectedValue.replace(/"/g, '""') + '"';
}
export function hirmsCsv(headers:string[],rows:unknown[][]) {
  return "\uFEFF" + [headers,...rows.map(row=>row.map(value=>value==null?"":value) as string[])].map(row=>row.map(hirmsCsvCell).join(",")).join("\r\n");
}
