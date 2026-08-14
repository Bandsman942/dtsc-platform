import { z } from "zod";

const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const id = z.string().trim().min(1).max(240);

export const telcoProviderAccountUpsertSchema = z.object({
  providerCode: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  currencyCode: currency,
  financialAccountId: id,
});
