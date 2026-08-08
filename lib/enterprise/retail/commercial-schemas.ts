import { z } from "zod";

const id = z.string().trim().min(1).max(240);
const code = z.string().trim().min(1).max(80).transform((value) => value.toUpperCase().replace(/[^A-Z0-9_-]/g, "_"));
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const money = z.coerce.number().finite().nonnegative().max(1_000_000_000_000);
const positiveMoney = z.coerce.number().finite().positive().max(1_000_000_000_000);
const positiveQuantity = z.coerce.number().finite().positive().max(1_000_000);
const idempotencyKey = z.string().trim().min(8).max(180);

export const retailPromotionTypes = ["PERCENTAGE", "FIXED_AMOUNT", "QUANTITY_BREAK", "BUY_X_GET_Y", "BUNDLE"] as const;
export const retailPromotionStackModes = ["EXCLUSIVE", "STACKABLE"] as const;
export const retailReturnTypes = ["RETURN", "EXCHANGE"] as const;
export const retailReturnStockDispositions = ["RESTOCK", "SCRAP", "NO_STOCK"] as const;
export const retailRefundMethods = ["ORIGINAL_TENDER", "CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "STORE_CREDIT"] as const;

export const retailPriceConditionUpsertSchema = z.object({
  catalogPriceId: id,
  siteId: id.optional().nullable(),
  customerBusinessPartyId: id.optional().nullable(),
  customerSegmentCode: code.optional().nullable(),
  minQuantity: positiveQuantity.optional().nullable(),
  maxQuantity: positiveQuantity.optional().nullable(),
  channelCode: code.default("POS"),
  priority: z.coerce.number().int().min(-1000).max(1000).default(0),
  isActive: z.boolean().default(true),
}).superRefine((input, ctx) => {
  if (input.minQuantity && input.maxQuantity && input.minQuantity > input.maxQuantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La quantité minimale ne peut pas dépasser la quantité maximale.", path: ["maxQuantity"] });
  }
});

export const retailPromotionUpsertSchema = z.object({
  code,
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  promotionType: z.enum(retailPromotionTypes),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"]).default("DRAFT"),
  priority: z.coerce.number().int().min(-1000).max(1000).default(0),
  stackMode: z.enum(retailPromotionStackModes).default("EXCLUSIVE"),
  couponCode: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()).optional().nullable(),
  siteId: id.optional().nullable(),
  customerSegmentCode: code.optional().nullable(),
  currencyCode: currency.optional().nullable(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  conditionsJson: z.record(z.string(), z.unknown()).optional().nullable(),
  actionJson: z.record(z.string(), z.unknown()),
  usageLimit: z.coerce.number().int().positive().max(10_000_000).optional().nullable(),
  perCustomerLimit: z.coerce.number().int().positive().max(100_000).optional().nullable(),
}).superRefine((input, ctx) => {
  if (input.endsAt && input.endsAt <= input.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fin de la promotion doit être postérieure à son début.", path: ["endsAt"] });
  const action = input.actionJson;
  if (input.promotionType === "PERCENTAGE") {
    const percent = Number(action.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le pourcentage doit être compris entre 0 et 100.", path: ["actionJson", "percent"] });
  }
  if (input.promotionType === "FIXED_AMOUNT") {
    const amount = Number(action.amount);
    if (!Number.isFinite(amount) || amount <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le montant de remise doit être positif.", path: ["actionJson", "amount"] });
  }
  if (input.promotionType === "BUY_X_GET_Y") {
    const buyQuantity = Number(action.buyQuantity);
    const getQuantity = Number(action.getQuantity);
    if (!Number.isInteger(buyQuantity) || buyQuantity <= 0 || !Number.isInteger(getQuantity) || getQuantity <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Buy X Get Y exige des quantités entières positives.", path: ["actionJson"] });
  }
  if (input.promotionType === "BUNDLE") {
    if (!Array.isArray(action.productIds) || action.productIds.length < 2 || !Number.isFinite(Number(action.bundlePrice)) || Number(action.bundlePrice) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un bundle exige au moins deux produits et un prix bundle positif.", path: ["actionJson"] });
    }
  }
});

export const retailCommercialContextSchema = z.object({
  couponCode: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()).optional().nullable(),
  customerSegmentCode: code.optional().nullable(),
  channelCode: code.default("POS"),
  overrideReason: z.string().trim().min(3).max(1000).optional().nullable(),
});

export const retailPricingPreviewSchema = retailCommercialContextSchema.extend({
  siteId: id.optional().nullable(),
  customerBusinessPartyId: id.optional().nullable(),
  currencyCode: currency,
  soldAt: z.coerce.date().optional(),
  lines: z.array(z.object({ catalogItemId: id, quantity: positiveQuantity })).min(1).max(200),
});

export const retailReturnCreateSchema = z.object({
  returnType: z.enum(retailReturnTypes).default("RETURN"),
  reason: z.string().trim().min(3).max(1200),
  refundMethod: z.enum(retailRefundMethods),
  refundFinancialAccountId: id.optional().nullable(),
  refundReference: z.string().trim().max(160).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    saleLineId: id,
    quantity: positiveQuantity,
    stockDisposition: z.enum(retailReturnStockDispositions).default("RESTOCK"),
  })).min(1).max(200),
}).superRefine((input, ctx) => {
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    if (seen.has(line.saleLineId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Une ligne du ticket ne peut être retournée qu’une fois par demande.", path: ["lines", index, "saleLineId"] });
    seen.add(line.saleLineId);
  });
  if (!["ORIGINAL_TENDER", "STORE_CREDIT"].includes(input.refundMethod) && !input.refundFinancialAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sélectionnez le compte financier utilisé pour le remboursement.", path: ["refundFinancialAccountId"] });
  }
});

export const retailCommercialManualLineSchema = z.object({
  unitPrice: money.optional(),
  discountAmount: money.optional(),
  taxAmount: money.optional(),
});

export const retailCommercialRefundAmountSchema = positiveMoney;
