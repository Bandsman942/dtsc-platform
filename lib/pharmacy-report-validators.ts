import { z } from "zod";

export const pharmacyReportTypes = ["PHARMACY_OVERVIEW", "SALES", "STOCK", "BATCH_EXPIRY", "PURCHASES", "RECEIPTS", "CASH_PAYMENTS", "PRESCRIPTIONS", "RETURNS_LOSSES", "QUALITY_INCIDENTS", "ALERTS", "DOCUMENTS_COMPLIANCE", "COLLABORATOR_ACTIVITY", "CUSTOM_SIMPLE"] as const;
export type PharmacyReportType = typeof pharmacyReportTypes[number];
const optionalId = z.string().trim().max(180).optional().or(z.literal(""));
export const pharmacyReportFiltersSchema = z.object({
  start: z.string().trim().max(40).optional().or(z.literal("")), end: z.string().trim().max(40).optional().or(z.literal("")),
  productId: optionalId, batchId: optionalId, supplierId: optionalId, userId: optionalId, departmentId: optionalId,
  status: z.string().trim().max(80).optional().or(z.literal("")), category: z.string().trim().max(120).optional().or(z.literal("")),
  criticality: z.string().trim().max(80).optional().or(z.literal("")), paymentMethod: z.string().trim().max(80).optional().or(z.literal("")),
});
export const pharmacySavedReportSchema = z.object({ name: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).optional().or(z.literal("")), reportType: z.enum(pharmacyReportTypes), filters: pharmacyReportFiltersSchema, visibility: z.enum(["PRIVATE", "ORGANIZATION"]).default("PRIVATE") });
export const pharmacyReportActionSchema = z.object({ action: z.enum(["archive-view", "run-view", "create-snapshot"]), reportType: z.enum(pharmacyReportTypes).optional(), filters: pharmacyReportFiltersSchema.optional(), snapshotName: z.string().trim().max(180).optional(), notes: z.string().trim().max(2000).optional() });
export const pharmacyReportExportSchema = z.object({ reportType: z.enum(pharmacyReportTypes), format: z.literal("CSV"), filters: pharmacyReportFiltersSchema });
