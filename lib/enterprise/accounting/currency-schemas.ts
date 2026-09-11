import { z } from "zod";

const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Le code devise doit contenir exactement 3 lettres.");
const currencyName = z.string().trim().min(2).max(120);
const currencySymbol = z.string().trim().max(12).nullish();
const precision = z.coerce.number().int().min(0).max(6);
const roundingMode = z.enum(["HALF_UP", "HALF_EVEN", "UP", "DOWN"]);

export const enterpriseCurrencyCreateSchema = z.object({
  code: currencyCode,
  name: currencyName,
  symbol: currencySymbol,
  precision: precision.default(2),
  roundingMode: roundingMode.default("HALF_UP"),
});

export const enterpriseCurrencyUpdateSchema = z.object({
  name: currencyName.optional(),
  symbol: currencySymbol.optional(),
  precision: precision.optional(),
  roundingMode: roundingMode.optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Aucune modification n’a été fournie.",
});
