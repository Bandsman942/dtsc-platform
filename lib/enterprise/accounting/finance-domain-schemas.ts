import { z } from "zod";

const id = z.string().cuid();
const date = z.coerce.date();
const amount = z.union([z.string(), z.number()]).transform(String).refine((value) => /^-?\d+(\.\d{1,6})?$/.test(value));
const currency = z.string().trim().regex(/^[A-Z]{3}$/);
export const taxCodeCreateSchema = z.object({ code: z.string().trim().min(1).max(40), nameFr: z.string().trim().min(2).max(160), nameEn: z.string().trim().min(2).max(160), category: z.enum(["SALES_TAX", "VAT", "WITHHOLDING", "EXEMPT", "ZERO_RATED", "OTHER"]), jurisdiction: z.string().trim().max(120).optional(), payableAccountId: id.optional(), recoverableAccountId: id.optional(), roundingRule: z.enum(["HALF_UP", "HALF_EVEN", "UP", "DOWN"]).default("HALF_UP"), rate: amount, effectiveFrom: date });
export const openingBalanceSchema = z.object({ fiscalPeriodId: id, currencyCode: currency, reference: z.string().trim().max(120).optional(), description: z.string().trim().max(500).optional(), privateDocumentId: id.optional(), lines: z.array(z.object({ ledgerAccountId: id, businessPartyId: id.optional(), debit: amount, credit: amount, currencyCode: currency, reference: z.string().trim().max(200).optional() })).min(2).max(10000) });
export const openingBalancePostSchema = z.object({ revision: z.coerce.number().int().positive() });
export const payrollPostSchema = z.object({});
export const inventoryValuationQuerySchema = z.object({ warehouseId: id.optional(), inventoryItemId: id.optional() });
export const assetDepreciationRunSchema = z.object({ throughDate: date });
