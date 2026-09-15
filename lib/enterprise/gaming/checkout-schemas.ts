import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const idempotencyKey = z.string().trim().min(8).max(160);
const money = z.coerce.number().finite().positive().max(1_000_000_000);
const nonNegativeMoney = z.coerce.number().finite().min(0).max(1_000_000_000);
const paymentMethod = z.enum(["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "CHEQUE", "OTHER"]);

export const gamingCheckoutPrepareSchema = z.object({
  sessionId: id,
  invoiceApproverUserId: id,
  warehouseId: id.optional().nullable(),
  storageLocationId: id.optional().nullable(),
  idempotencyKey,
  extraItems: z.array(z.object({
    catalogItemId: id,
    quantity: z.coerce.number().finite().positive().max(100000),
  })).max(100).default([]),
});

export const gamingCheckoutInvoiceDecisionSchema = z.object({
  action: z.literal("APPROVE_INVOICE"),
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});

export const gamingCheckoutPaymentCreateSchema = z.object({
  action: z.literal("ADD_PAYMENT"),
  paymentApproverUserId: id,
  methodType: paymentMethod,
  financialAccountId: id,
  amount: money,
  reference: z.string().trim().max(160).optional().nullable(),
  maskedExternalReference: z.string().trim().max(160).optional().nullable(),
  idempotencyKey,
});

export const gamingCheckoutPaymentDecisionSchema = z.object({
  action: z.literal("APPROVE_PAYMENT"),
  paymentId: id,
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});

export const gamingCheckoutCancelSchema = z.object({
  action: z.literal("CANCEL"),
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(8).max(1000),
});

export const gamingCheckoutRefundRequestSchema = z.object({
  action: z.literal("REQUEST_REFUND"),
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(8).max(1000),
  methodType: paymentMethod,
  financialAccountId: id,
  refundApproverUserId: id,
  reference: z.string().trim().max(160).optional().nullable(),
  maskedExternalReference: z.string().trim().max(160).optional().nullable(),
  idempotencyKey,
});

export const gamingCheckoutRefundDecisionSchema = z.object({
  action: z.literal("APPROVE_REFUND"),
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(8).max(1000),
});

export const gamingCheckoutCommandSchema = z.discriminatedUnion("action", [
  gamingCheckoutInvoiceDecisionSchema,
  gamingCheckoutPaymentCreateSchema,
  gamingCheckoutPaymentDecisionSchema,
  gamingCheckoutCancelSchema,
  gamingCheckoutRefundRequestSchema,
  gamingCheckoutRefundDecisionSchema,
]);

export const gamingDailyCloseCreateSchema = z.object({
  businessDate: z.coerce.date(),
  siteId: id.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  idempotencyKey,
  declarations: z.array(z.object({
    financialAccountId: id,
    methodType: paymentMethod,
    declaredAmount: nonNegativeMoney,
    varianceReason: z.string().trim().max(1000).optional().nullable(),
  })).min(1).max(100),
});

export const gamingDailyCloseDecisionSchema = z.object({
  action: z.enum(["VALIDATE", "REJECT"]),
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(8).max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.action === "REJECT" && !value.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Un motif est obligatoire pour rejeter la clôture." });
  }
});
