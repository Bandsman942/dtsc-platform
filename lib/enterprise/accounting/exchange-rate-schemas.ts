import { z } from "zod";
import { currencyCodeSchema, dateInputSchema, positiveMoneyInputSchema } from "@/lib/enterprise/accounting/schemas";

export const ENTERPRISE_EXCHANGE_RATE_SOURCES = ["MANUAL", "CENTRAL_BANK", "COMMERCIAL_BANK", "PROVIDER", "CONTRACTUAL", "IMPORTED"] as const;

export const exchangeRateCreateSchema = z.object({
  sourceCurrencyCode: currencyCodeSchema,
  targetCurrencyCode: currencyCodeSchema,
  rateDate: dateInputSchema,
  source: z.enum(ENTERPRISE_EXCHANGE_RATE_SOURCES),
  rate: positiveMoneyInputSchema,
  precision: z.coerce.number().int().min(2).max(12).default(12),
}).superRefine((value, ctx) => {
  if (value.sourceCurrencyCode === value.targetCurrencyCode) {
    ctx.addIssue({ code: "custom", message: "Source and target currencies must differ." });
  }
});

export const exchangeRateDeactivateSchema = z.object({
  reason: z.string().trim().min(4).max(1000),
});
