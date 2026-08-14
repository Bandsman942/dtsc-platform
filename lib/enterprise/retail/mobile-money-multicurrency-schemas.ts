import { z } from "zod";

const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const id = z.string().trim().min(1).max(240);
const positiveMoney = z.coerce.number().finite().positive().max(1_000_000_000_000);
const idempotencyKey = z.string().trim().min(8).max(180);

export const mobileMoneyProviderAccountUpsertSchema = z.object({
  providerCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  currencyCode: currency,
  financialAccountId: id,
});

export const mobileMoneyFxPreviewSchema = z.object({
  providerCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  sourceCurrencyCode: currency,
  targetCurrencyCode: currency,
  sourceAmount: positiveMoney,
}).superRefine((input, ctx) => {
  if (input.sourceCurrencyCode === input.targetCurrencyCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Les devises source et cible doivent être différentes.", path: ["targetCurrencyCode"] });
  }
});

export const mobileMoneyFxTransferSchema = mobileMoneyFxPreviewSchema.extend({
  idempotencyKey,
});

export const mobileMoneyFxReverseSchema = z.object({
  revision: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
});
