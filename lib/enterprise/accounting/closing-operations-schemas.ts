import { z } from "zod";

export const closingFxRevaluationSchema = z.object({
  fiscalPeriodId: z.string().cuid(),
  currencyCode: z.string().trim().min(3).max(8).transform((value) => value.toUpperCase()),
});

export const yearEndCloseSchema = z.object({
  fiscalYearId: z.string().cuid(),
});

export const assetDisposalPostingSchema = z.object({
  revision: z.coerce.number().int().nonnegative(),
});
