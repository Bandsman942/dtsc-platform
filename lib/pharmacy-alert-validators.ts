import { z } from "zod";

const optionalText = z.string().trim().max(2000).optional().or(z.literal(""));
export const pharmacyAlertActionSchema = z.object({
  action: z.enum(["seen", "assign", "take", "comment", "resolve", "ignore", "cancel", "archive"]),
  assignedToId: z.string().max(160).optional().or(z.literal("")),
  comment: optionalText,
});
export const pharmacyAlertRuleSchema = z.object({ enabled: z.coerce.boolean().optional(), defaultCriticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(), notifyEnabled: z.coerce.boolean().optional() });
export const pharmacyAlertSettingSchema = z.object({
  nearExpiryThresholdDays: z.coerce.number().int().min(1).max(3650),
  criticalCashVarianceThreshold: z.coerce.number().min(0).max(1_000_000_000),
  criticalLossValueThreshold: z.coerce.number().min(0).max(1_000_000_000),
  maxCashSessionHours: z.coerce.number().int().min(1).max(720),
  maxPharmacistValidationHours: z.coerce.number().int().min(1).max(720),
  maxReceiptValidationHours: z.coerce.number().int().min(1).max(720),
  autoResolveAlertsEnabled: z.coerce.boolean(),
  criticalAlertNotificationsEnabled: z.coerce.boolean(),
});
