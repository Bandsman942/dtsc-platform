export const CONSOLE_EXPORT_MAX_ROWS = 5000;

export function csvEscape(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function createCsvResponse(input: { filename: string; headers: string[]; rows: unknown[][] }) {
  const csv = [input.headers, ...input.rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${input.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function parseExportPeriod(url: URL, defaultDays = 30) {
  const endRaw = url.searchParams.get("end");
  const startRaw = url.searchParams.get("start");
  const end = endRaw ? new Date(`${endRaw}T23:59:59.999Z`) : new Date();
  const start = startRaw ? new Date(`${startRaw}T00:00:00.000Z`) : new Date(end.getTime() - defaultDays * 86_400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
  const maxRangeMs = 366 * 86_400_000;
  if (end.getTime() - start.getTime() > maxRangeMs) return null;
  return { start, end };
}
