import type { Prisma } from "@prisma/client";
import { z } from "zod";

/** Owner-controlled display preferences; never affect ledger values or access. */
export const retailDashboardPreferencesSchema = z.object({
  defaultDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]),
  defaultMetric: z.enum(["financeCollections", "invoices", "posSales", "posCollections", "expenses", "postedRevenue", "mobileMoneyCommission", "telcoMargin"]),
  warnOutstandingAbove: z.number().min(0).max(1_000_000_000_000),
  warnOutstandingByCurrency: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().min(0).max(1_000_000_000_000)).default({}),
  warnStockDays: z.number().int().min(1).max(365),
  showLegacyPos: z.boolean(),
}).strict();
export type RetailDashboardPreferences = z.infer<typeof retailDashboardPreferencesSchema>;
export const DEFAULT_RETAIL_DASHBOARD_PREFERENCES: RetailDashboardPreferences = {
  defaultDays: 7, defaultMetric: "financeCollections", warnOutstandingAbove: 100_000, warnOutstandingByCurrency: {},
  warnStockDays: 30, showLegacyPos: true,
};

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function readRetailDashboardPreferences(settings: unknown): RetailDashboardPreferences {
  const preferences = record(settings).executiveDashboard;
  const parsed = retailDashboardPreferencesSchema.safeParse(preferences);
  return parsed.success ? parsed.data : { ...DEFAULT_RETAIL_DASHBOARD_PREFERENCES };
}

export function mergeRetailDashboardPreferences(settings: unknown, preferences: RetailDashboardPreferences): Prisma.InputJsonValue {
  return { ...record(settings), executiveDashboard: retailDashboardPreferencesSchema.parse(preferences) } as Prisma.InputJsonValue;
}
