import { z } from "zod";

const optionalText = z.string().trim().max(1200).optional().or(z.literal(""));
const optionalId = z.string().max(160).optional().or(z.literal(""));
const hasTwoDecimals = (value: number) => Number.isInteger(Math.round(value * 100));
const optionalMoney = z.union([z.coerce.number().min(0).max(1_000_000_000).refine(hasTwoDecimals, "Le montant doit avoir au maximum deux décimales."), z.literal("")]).optional();
const optionalIntegerQuantity = z.union([z.coerce.number().int("La quantité doit être un nombre entier.").min(0).max(1_000_000_000), z.literal("")]).optional();
const positiveIntegerQuantity = z.coerce.number().int("La quantité doit être un nombre entier.").gt(0).max(1_000_000_000);
const optionalDate = z.union([z.coerce.date(), z.literal("")]).optional();

export const receiptBatchInputSchema = z.object({
  batchId: optionalId,
  createNewBatch: z.coerce.boolean().default(true),
  batchNumber: z.string().trim().min(1).max(120),
  manufacturingDate: optionalDate,
  expiryDate: z.coerce.date(),
  barcode: z.string().trim().max(180).optional().or(z.literal("")),
  receivedQuantity: positiveIntegerQuantity,
  locationId: optionalId,
  initialStatus: z.enum(["ACTIVE", "QUARANTINED"]).default("ACTIVE"),
  notes: optionalText,
});

export const receiptLineInputSchema = z.object({
  productId: z.string().min(1).max(160),
  purchaseOrderLineId: optionalId,
  orderedQuantity: optionalIntegerQuantity,
  previouslyReceivedQuantity: optionalIntegerQuantity,
  receivedQuantity: positiveIntegerQuantity,
  unit: z.string().trim().min(1).max(80),
  purchasePrice: optionalMoney,
  supplierDiscount: z.union([z.coerce.number().min(0).max(100), z.literal("")]).optional(),
  notes: optionalText,
  batches: z.array(receiptBatchInputSchema).min(1).max(50),
});

const receiptBaseSchema = z.object({
  receiptNumber: z.string().trim().max(120).optional().or(z.literal("")),
  receiptType: z.enum(["PURCHASE_ORDER", "WITHOUT_ORDER", "PARTIAL", "SUPPLIER_REPLACEMENT", "DONATION", "INITIAL_STOCK", "OTHER"]),
  supplierId: z.string().min(1).max(160),
  purchaseOrderId: optionalId,
  departmentId: optionalId,
  mainLocationId: optionalId,
  receivedById: z.string().min(1).max(160),
  receivedAt: z.coerce.date(),
  supplierInvoiceReference: z.string().trim().max(180).optional().or(z.literal("")),
  deliveryNoteReference: z.string().trim().max(180).optional().or(z.literal("")),
  invoiceDate: optionalDate,
  deliveryNoteDate: optionalDate,
  notes: optionalText,
  lines: z.array(receiptLineInputSchema).min(1).max(200),
});

function validateBatchDistribution(data: z.infer<typeof receiptBaseSchema>, context: z.RefinementCtx) {
  for (const [index, line] of data.lines.entries()) {
    const batchTotal = line.batches.reduce((sum, batch) => sum + batch.receivedQuantity, 0);
    if (Math.abs(batchTotal - line.receivedQuantity) > 0.0001) context.addIssue({ code: "custom", path: ["lines", index, "batches"], message: "La somme des lots doit correspondre à la quantité reçue." });
  }
}

export const pharmacyReceiptSchema = receiptBaseSchema.superRefine(validateBatchDistribution);
export const pharmacyReceiptUpdateSchema = receiptBaseSchema.superRefine(validateBatchDistribution);

export const receiptActionSchema = z.object({
  action: z.enum(["submit", "validate", "reject", "cancel", "archive", "add-discrepancy", "resolve-discrepancy"]),
  reason: z.string().trim().max(1200).optional().or(z.literal("")),
  discrepancyId: optionalId,
  discrepancyType: z.enum(["QUANTITY_LOWER", "QUANTITY_HIGHER", "WRONG_PRODUCT", "NON_COMPLIANT_BATCH", "SHORT_EXPIRY", "DAMAGED_PRODUCT", "MISSING_DOCUMENT", "PRICE_DIFFERENCE", "WRONG_SUPPLIER", "OTHER"]).optional(),
  description: z.string().trim().max(1200).optional(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  responsibleUserId: optionalId,
  proposedAction: optionalText,
});
