import { z } from "zod";
import { MOBILE_MONEY_FEE_COLLECTION_MODES, MOBILE_MONEY_TRANSACTION_TYPES, RETAIL_CLOSE_ACCOUNT_TYPES, RETAIL_TENDER_METHODS, TELCO_TOPUP_STATUSES } from "@/lib/enterprise/retail/constants";

const money = z.coerce.number().finite().nonnegative().max(1_000_000_000_000);
const positiveMoney = z.coerce.number().finite().positive().max(1_000_000_000_000);
const currency = z.string().trim().min(3).max(3).transform((value) => value.toUpperCase());
const phone = z.string().trim().min(5).max(40);
const id = z.string().trim().min(1).max(240);
const idempotencyKey = z.string().trim().min(8).max(180);

export const retailProviderUpsertSchema = z.object({
  providerCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase().replace(/[^A-Z0-9_]/g, "_")),
  label: z.string().trim().min(2).max(120),
  providerType: z.enum(["MOBILE_MONEY", "TELCO", "BOTH"]),
  mobileMoneyFloatAccountId: id.optional().nullable(),
  telcoFloatAccountId: id.optional().nullable(),
  settingsJson: z.record(z.string(), z.unknown()).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const retailSaleCreateSchema = z.object({
  warehouseId: id,
  storageLocationId: id.optional().nullable(),
  siteId: id.optional().nullable(),
  customerBusinessPartyId: id.optional().nullable(),
  currencyCode: currency,
  soldAt: z.coerce.date().optional(),
  idempotencyKey,
  lines: z.array(z.object({
    catalogItemId: id,
    inventoryItemId: id.optional().nullable(),
    stockLotId: id.optional().nullable(),
    quantity: z.coerce.number().finite().positive().max(1_000_000),
    unitPrice: money,
    discountAmount: money.default(0),
    taxAmount: money.default(0),
  })).min(1).max(200),
  tenders: z.array(z.object({
    methodType: z.enum(RETAIL_TENDER_METHODS),
    financialAccountId: id,
    amount: positiveMoney,
    reference: z.string().trim().max(160).optional().nullable(),
  })).min(1).max(8),
});

export const retailSaleReverseSchema = z.object({
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
});

export const mobileMoneyCreateSchema = z.object({
  providerCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  transactionType: z.enum(MOBILE_MONEY_TRANSACTION_TYPES),
  customerPhone: phone,
  currencyCode: currency,
  principalAmount: positiveMoney,
  customerFeeAmount: money.default(0),
  providerCommissionAmount: money.default(0),
  feeCollectionMode: z.enum(MOBILE_MONEY_FEE_COLLECTION_MODES).default("NONE"),
  cashAccountId: id,
  floatAccountId: id.optional().nullable(),
  externalReference: z.string().trim().max(160).optional().nullable(),
  occurredAt: z.coerce.date().optional(),
  idempotencyKey,
});

export const mobileMoneyReverseSchema = retailSaleReverseSchema;

export const telcoTopupCreateSchema = z.object({
  providerCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  destinationPhone: phone,
  catalogItemId: id.optional().nullable(),
  offerLabel: z.string().trim().min(2).max(200),
  currencyCode: currency,
  saleAmount: positiveMoney,
  operatorCost: money,
  tenderFinancialAccountId: id,
  operatorFloatAccountId: id.optional().nullable(),
  externalReference: z.string().trim().max(160).optional().nullable(),
  status: z.enum(TELCO_TOPUP_STATUSES).default("SUCCESS"),
  failureReason: z.string().trim().max(500).optional().nullable(),
  occurredAt: z.coerce.date().optional(),
  idempotencyKey,
}).superRefine((input, ctx) => {
  if (input.operatorCost > input.saleAmount) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le coût opérateur ne peut pas dépasser le prix de vente.", path: ["operatorCost"] });
  if (input.status === "FAILED" && !input.failureReason) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Précisez la raison de l’échec.", path: ["failureReason"] });
});

export const telcoTopupReverseSchema = retailSaleReverseSchema;

export const retailDailyCloseCreateSchema = z.object({
  businessDate: z.coerce.date(),
  siteId: id.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    financialAccountId: id,
    accountType: z.enum(RETAIL_CLOSE_ACCOUNT_TYPES),
    declaredBalance: money,
    varianceReason: z.string().trim().max(1000).optional().nullable(),
    denominations: z.array(z.object({ denomination: positiveMoney, quantity: z.coerce.number().int().nonnegative().max(1_000_000) })).max(40).optional().default([]),
  })).min(1).max(30),
});

export const retailDailyCloseDecisionSchema = z.object({
  revision: z.coerce.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(1000).optional().nullable(),
}).superRefine((input, ctx) => {
  if (input.decision === "REJECT" && !input.reason) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Précisez le motif du refus.", path: ["reason"] });
});
