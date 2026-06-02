import { UserRole } from "@prisma/client";
import type { VisitPoint } from "@/components/admin/site-visits-chart";

export type RawMetricRow = { date: Date | string; count: number | bigint };

export function isUserRole(value: string | undefined): value is UserRole {
  return value === UserRole.ADMIN || value === UserRole.MANAGER || value === UserRole.CLIENT || value === UserRole.SUPPORT;
}

export function classifyAuditSeverity(action: string) {
  if (/delete|access_denied|forbidden|security|secret|unauthorized/i.test(action)) {
    return "CRITICAL";
  }
  if (/error|failed|reject|cancel/i.test(action)) {
    return "ERROR";
  }
  if (/update|change|role|permission|position|download|archive/i.test(action)) {
    return "WARNING";
  }
  if (/validate|paid|success|accept/i.test(action)) {
    return "SUCCESS";
  }
  return "INFO";
}

export function buildMetricPoints({ rows, selectedDate, selectedPeriod }: { rows: RawMetricRow[]; selectedDate?: string; selectedPeriod: number }): VisitPoint[] {
  const chartLength = selectedDate ? 1 : Math.min(selectedPeriod, 60);
  const countsByDate = new Map(
    rows.map((row) => {
      const key = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
      return [key, Number(row.count)];
    })
  );

  return [...Array(chartLength).keys()].map((index) => {
    const day = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
    if (!selectedDate) {
      day.setDate(day.getDate() - (chartLength - 1 - index));
    }
    const dateKey = day.toISOString().slice(0, 10);
    const count = countsByDate.get(dateKey) || 0;
    return {
      date: dateKey,
      label: day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      count,
    };
  });
}

export function toJsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
