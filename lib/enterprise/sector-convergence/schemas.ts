import { z } from "zod";
import { SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";

export const sectorSchema = z.enum(["PHARMACY", "HEALTH_CARE"]);
export const syncStatusSchema = z.enum(["PENDING", "SYNCED", "FAILED", "AMBIGUOUS", "LEGACY_UNMAPPED", "CUTOVER_COMPLETE"]);

export const convergenceListSchema = z.object({
  sector: sectorSchema.optional(),
  status: syncStatusSchema.optional(),
  sourceEntityType: z.string().trim().min(1).max(100).optional(),
  requiresManualAction: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const retrySyncSchema = z.object({
  syncStateId: z.string().min(1),
  expectedStatus: z.enum(["FAILED", "PENDING"]),
});

export const resolveSyncSchema = z.object({
  syncStateId: z.string().min(1),
  targetEntityType: z.string().trim().min(1).max(100),
  targetEntityId: z.string().trim().min(1).max(120),
  resolutionReason: z.string().trim().min(12).max(1000),
  expectedStatus: z.enum(["AMBIGUOUS", "LEGACY_UNMAPPED"]),
});

export const cutoverSchema = z.object({
  sector: sectorSchema,
  domainCode: z.string().trim().regex(/^[A-Z0-9_]{3,80}$/),
  featureFlag: z.enum(Object.values(SECTOR_CONVERGENCE_FLAGS) as [string, ...string[]]),
  action: z.enum(["ENABLE", "COMPLETE", "DISABLE"]),
  reason: z.string().trim().min(12).max(1000).optional(),
  revision: z.coerce.number().int().positive().optional(),
});

export const pharmacyInventoryEventSchema = z.object({
  sourceMovementId: z.string().min(1),
  eventType: z.enum([
    "PHARMACY_PURCHASE_RECEIPT_VALUED",
    "PHARMACY_SALE_STOCK_ISSUE",
    "PHARMACY_CUSTOMER_RETURN",
    "PHARMACY_SUPPLIER_RETURN",
    "PHARMACY_LOSS",
    "PHARMACY_EXPIRY_WRITE_OFF",
    "PHARMACY_ADJUSTMENT",
    "PHARMACY_RECALL_WRITE_OFF",
  ]),
  eventVersion: z.coerce.number().int().positive().default(1),
});

export const healthPayerComponentSchema = z.object({
  payerType: z.enum(["PATIENT", "INSURER", "EMPLOYER", "PARTNER", "OTHER_THIRD_PARTY"]),
  businessPartyId: z.string().min(1),
  requestedAmount: z.union([z.string(), z.number()]).transform(String),
});

export const healthBillingConvergenceSchema = z.object({
  healthMedicalInvoiceId: z.string().min(1),
  payerComponents: z.array(healthPayerComponentSchema).min(1).max(10),
  eventVersion: z.coerce.number().int().positive().default(1),
});
