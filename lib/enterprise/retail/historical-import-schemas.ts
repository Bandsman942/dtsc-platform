import { z } from "zod";

const id = z.string().trim().min(1).max(240);
const moneyString = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).refine(
  (value) => /^-?\d+(?:\.\d{1,6})?$/.test(value),
  "Montant invalide.",
);
const nonNegativeMoneyString = moneyString.refine((value) => !value.startsWith("-"), "Le montant ne peut pas être négatif.");
const positiveMoneyString = nonNegativeMoneyString.refine((value) => Number(value) > 0, "Le montant doit être strictement positif.");
const occurredAt = z.string().datetime({ offset: true });
const providerCode = z.string().trim().min(2).max(40).transform((value) => value.toUpperCase());
const phone = z.string().trim().min(5).max(40);
const externalReference = z.string().trim().max(160).optional().nullable();

export const historicalImportBaselineSchema = z.object({
  financialAccountId: id,
  openingBalance: nonNegativeMoneyString,
  expectedClosingBalance: nonNegativeMoneyString.optional().nullable(),
});

export const historicalMobileMoneyLineSchema = z.object({
  kind: z.literal("MOBILE_MONEY"),
  occurredAt,
  providerCode,
  transactionType: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  customerPhone: phone,
  principalAmount: positiveMoneyString,
  customerFeeAmount: nonNegativeMoneyString.default("0"),
  providerCommissionAmount: nonNegativeMoneyString.default("0"),
  feeCollectionMode: z.enum(["NONE", "CASH", "PROVIDER"]).default("NONE"),
  cashAccountId: id,
  externalReference,
  sourceLine: z.string().trim().max(120).optional().nullable(),
});

export const historicalTelcoLineSchema = z.object({
  kind: z.literal("TELCO_TOPUP"),
  occurredAt,
  providerCode,
  destinationPhone: phone,
  offerLabel: z.string().trim().min(2).max(200),
  saleAmount: positiveMoneyString,
  operatorCost: nonNegativeMoneyString,
  tenderFinancialAccountId: id,
  externalReference,
  sourceLine: z.string().trim().max(120).optional().nullable(),
});

export const historicalImportLineSchema = z.discriminatedUnion("kind", [
  historicalMobileMoneyLineSchema,
  historicalTelcoLineSchema,
]);

export const historicalImportDraftSchema = z.object({
  sourceLabel: z.string().trim().min(3).max(200),
  periodStart: occurredAt,
  periodEnd: occurredAt,
  baselines: z.array(historicalImportBaselineSchema).min(1).max(100),
  lines: z.array(historicalImportLineSchema).min(1).max(500),
}).superRefine((input, ctx) => {
  const start = new Date(input.periodStart).getTime();
  const end = new Date(input.periodEnd).getTime();
  if (start > end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La période historique est invalide.", path: ["periodEnd"] });
  }
  const seenAccounts = new Set<string>();
  input.baselines.forEach((baseline, index) => {
    if (seenAccounts.has(baseline.financialAccountId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Chaque compte ne doit avoir qu'un seul solde de départ.", path: ["baselines", index, "financialAccountId"] });
    }
    seenAccounts.add(baseline.financialAccountId);
  });
  input.lines.forEach((line, index) => {
    const timestamp = new Date(line.occurredAt).getTime();
    if (timestamp < start || timestamp > end) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La date de l'opération doit rester dans la période de reprise.", path: ["lines", index, "occurredAt"] });
    }
    if (line.kind === "TELCO_TOPUP" && Number(line.operatorCost) > Number(line.saleAmount)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le coût opérateur ne peut pas dépasser le prix de vente.", path: ["lines", index, "operatorCost"] });
    }
  });
});

export const historicalImportApplySchema = z.object({
  revision: z.coerce.number().int().positive(),
});

export type HistoricalImportDraftInput = z.infer<typeof historicalImportDraftSchema>;
export type HistoricalImportLineInput = z.infer<typeof historicalImportLineSchema>;
