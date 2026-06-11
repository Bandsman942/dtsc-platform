import { z } from "zod";

const optionalId = z.string().trim().max(160).optional().or(z.literal(""));
const optionalText = z.string().trim().max(5000).optional().or(z.literal(""));

export const pharmacyActivityTypes = ["REPLENISHMENT_REQUEST", "STOCKOUT_SIGNAL", "NEAR_EXPIRY_SIGNAL", "INVENTORY_SUBMISSION", "STOCK_ADJUSTMENT_REQUEST", "CASH_REPORT", "SALE_ANOMALY", "QUALITY_INCIDENT_SIGNAL", "PHARMACIST_ADVICE_REQUEST", "DOCUMENT_REQUEST", "ALERT_ACTION", "WORKFLOW_ACTION", "TASK_ACTION", "OTHER"] as const;

export const pharmacyActivityCreateSchema = z.object({
  activityType: z.enum(pharmacyActivityTypes),
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().min(3).max(10000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assignedToId: optionalId, departmentId: optionalId, dueAt: optionalText,
  productId: optionalId, batchId: optionalId, supplierId: optionalId, saleId: optionalId, saleLineId: optionalId,
  prescriptionId: optionalId, inventorySessionId: optionalId, inventoryLineId: optionalId, cashSessionId: optionalId, alertId: optionalId,
  locationId: optionalId, pharmacistId: optionalId,
  quantity: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)]).optional(),
  countedQuantity: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)]).optional(),
  unit: optionalText, source: optionalText, urgency: optionalText, observedStatus: optionalText,
  adjustmentType: optionalText, direction: optionalText, reason: optionalText, desiredDate: optionalText,
  anomalyType: optionalText, actionRequested: optionalText, requestType: optionalText, immediateAction: optionalText,
  countedCashAmount: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)]).optional(),
  mobileMoneyAmount: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)]).optional(),
  cardAmount: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)]).optional(),
});

export const pharmacyActivityActionSchema = z.object({
  action: z.enum(["start", "complete", "cancel", "validate", "reject", "assign", "comment", "attach-document", "respond-advice", "close-advice"]),
  comment: optionalText,
  assignedToId: optionalId,
  documentId: optionalId,
  response: optionalText,
});
