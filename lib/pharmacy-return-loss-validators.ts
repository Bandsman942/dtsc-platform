import { z } from "zod";

const optionalText = z.string().trim().max(1500).optional().or(z.literal(""));
const optionalId = z.string().max(160).optional().or(z.literal(""));

export const returnLossEventSchema = z.object({
  eventNumber: z.string().trim().max(120).optional().or(z.literal("")),
  eventType: z.enum(["CUSTOMER_RETURN", "SUPPLIER_RETURN", "STOCK_ADJUSTMENT", "LOSS", "DAMAGE", "EXPIRED_WITHDRAWAL", "RECALL_WITHDRAWAL", "DESTRUCTION", "EXCEPTIONAL_TRANSFER"]),
  saleId: optionalId, saleLineId: optionalId, refundId: optionalId, supplierId: optionalId, purchaseOrderId: optionalId, receiptId: optionalId,
  inventorySessionId: optionalId, inventoryLineId: optionalId, productId: z.string().min(1).max(160), batchId: z.string().min(1).max(160), targetLocationId: optionalId,
  quantity: z.coerce.number().gt(0).max(1_000_000_000), unit: z.string().trim().min(1).max(80),
  direction: z.enum(["IN", "OUT"]), itemCondition: z.enum(["INTACT", "DAMAGED_PACKAGING", "DAMAGED", "OPENED", "EXPIRED", "SUSPECT", "RECALLED", "NON_COMPLIANT", "OTHER"]).optional().or(z.literal("")),
  stockDecision: z.enum(["RESTOCK", "QUARANTINE", "RETURN_SUPPLIER", "DESTROY", "ADJUST_POSITIVE", "ADJUST_NEGATIVE", "WITHDRAW", "RECALL", "TRANSFER"]).optional().or(z.literal("")),
  reason: z.string().trim().min(3).max(1500), estimatedValue: z.union([z.coerce.number().min(0).max(1_000_000_000), z.literal("")]).optional(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), refundRequested: z.coerce.boolean().default(false), responsibleUserId: optionalId, witnessUserId: optionalId,
  destructionMethod: optionalText, destructionDate: z.union([z.coerce.date(), z.literal("")]).optional(), notes: optionalText,
});

export const returnLossActionSchema = z.object({ action: z.enum(["submit", "validate", "reject", "cancel", "resolve-alert"]), reason: optionalText });
