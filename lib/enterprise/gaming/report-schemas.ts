import { z } from "zod";

export const GAMING_REPORT_TYPES = [
  "GAMING_STATION_UTILIZATION",
  "GAMING_REVENUE",
  "GAMING_OFF_PEAK",
  "GAMING_INCIDENTS_MAINTENANCE",
  "GAMING_BOOKINGS_NO_SHOW",
] as const;

export type GamingReportType = (typeof GAMING_REPORT_TYPES)[number];

export const gamingReportGenerateSchema = z.object({
  reportType: z.enum(GAMING_REPORT_TYPES),
  periodDays: z.coerce.number().int().min(1).max(366).default(30),
  idempotencyKey: z.string().trim().min(8).max(240),
}).strict();
