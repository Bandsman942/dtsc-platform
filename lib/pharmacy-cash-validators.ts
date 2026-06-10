import { z } from "zod";

const optionalText = z.string().trim().max(1500).optional().or(z.literal(""));
const optionalId = z.string().max(160).optional().or(z.literal(""));

export const cashSessionInputSchema = z.object({
  entityType: z.literal("session"),
  cashSessionNumber: z.string().trim().max(120).optional().or(z.literal("")),
  cashPointName: optionalText,
  cashPointType: z.enum(["MAIN_COUNTER", "SECONDARY_COUNTER", "INTERNAL_PHARMACY", "MOBILE_CASH", "EMERGENCY_CASH", "OTHER"]),
  cashierId: z.string().min(1).max(160),
  departmentId: optionalId,
  financialAccountId: optionalId,
  openedAt: z.coerce.date(),
  openingAmount: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.enum(["USD", "CDF", "EUR"]),
  notes: optionalText,
});

export const cashPaymentInputSchema = z.object({
  entityType: z.literal("payment"),
  saleId: optionalId,
  invoiceId: optionalId,
  cashSessionId: optionalId,
  cashierId: z.string().min(1).max(160),
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "CARD", "TRANSFER", "CREDIT", "INSURANCE", "VOUCHER", "OTHER"]),
  amount: z.coerce.number().gt(0).max(1_000_000_000),
  currency: z.enum(["USD", "CDF", "EUR"]),
  paymentReference: optionalText,
  payerName: optionalText,
  payerPhone: optionalText,
  paymentDate: z.coerce.date(),
  notes: optionalText,
});

export const cashRefundInputSchema = z.object({
  entityType: z.literal("refund"),
  saleId: z.string().min(1).max(160),
  paymentId: optionalId,
  cashSessionId: optionalId,
  refundType: z.enum(["TOTAL", "PARTIAL", "CASH_ERROR", "RETURN_RESTOCK", "RETURN_NO_RESTOCK", "SALE_CANCELLATION", "COMMERCIAL_GESTURE", "OTHER"]),
  amount: z.coerce.number().gt(0).max(1_000_000_000),
  currency: z.enum(["USD", "CDF", "EUR"]),
  reason: z.string().trim().min(3).max(1500),
  restockItems: z.coerce.boolean().default(false),
  notes: optionalText,
});

export const cashCreateSchema = z.discriminatedUnion("entityType", [cashSessionInputSchema, cashPaymentInputSchema, cashRefundInputSchema]);

export const cashActionSchema = z.object({
  action: z.enum(["close", "submit-validation", "validate", "reject", "cancel-payment", "generate-invoice", "generate-receipt", "validate-refund", "reject-refund", "mark-refund-paid", "resolve-discrepancy"]),
  countedCashAmount: z.coerce.number().min(0).optional(),
  varianceJustification: optionalText,
  reason: optionalText,
});
