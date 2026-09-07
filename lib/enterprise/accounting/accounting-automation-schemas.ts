import { z } from "zod";

const id = z.string().cuid();
const currency = z.string().trim().regex(/^[A-Z]{3}$/).transform((value) => value.toUpperCase());
const date = z.coerce.date();
const amount = z.union([z.string(), z.number()]).transform(String).refine((value) => /^\d+(\.\d{1,6})?$/.test(value) && Number(value) > 0, { message: "Amount must be positive" });
const mappingKey = z.string().trim().min(2).max(120);

const dimensionFields = {
  businessPartyId: id.nullable().optional(),
  projectId: id.nullable().optional(),
  departmentId: id.nullable().optional(),
  siteId: id.nullable().optional(),
  assetId: id.nullable().optional(),
  inventoryItemId: id.nullable().optional(),
};

export const accountingAutomationLineSchema = z.object({
  accountMappingKey: mappingKey,
  description: z.string().trim().min(1).max(500),
  direction: z.enum(["DEBIT", "CREDIT"]),
  amount,
  allocationWeight: z.union([z.string(), z.number()]).transform(String).optional(),
  ...dimensionFields,
});

export const accountingAutomationCreateSchema = z.object({
  code: z.string().trim().min(2).max(60),
  nameFr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  automationType: z.enum(["RECURRING", "ACCRUAL", "DEFERRAL", "ALLOCATION"]),
  journalType: z.string().trim().min(2).max(40).default("ADJUSTMENT"),
  currencyCode: currency,
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  startDate: date,
  endDate: date.nullable().optional(),
  autoReverse: z.boolean().default(false),
  reversalDelayDays: z.coerce.number().int().min(1).max(366).default(1),
  lines: z.array(accountingAutomationLineSchema).min(2).max(500),
});

export const accountingAutomationRunSchema = z.object({ accountingDate: date.optional() });
export const accountingAutomationDueSchema = z.object({ throughDate: date });
export const fxRevaluationSchema = z.object({ asOf: date, reversalDate: date.nullable().optional() });
export const yearEndRunSchema = z.object({ fiscalYearId: id });
export const accountingAllocationSchema = z.object({
  runKey: z.string().trim().min(2).max(160),
  accountingDate: date,
  currencyCode: currency,
  description: z.string().trim().min(2).max(500),
  sourceAccountMappingKey: mappingKey,
  sourceDirection: z.enum(["DEBIT", "CREDIT"]),
  amount,
  targets: z.array(z.object({
    accountMappingKey: mappingKey,
    weight: z.union([z.string(), z.number()]).transform(String),
    description: z.string().trim().min(1).max(500),
    projectId: id.nullable().optional(),
    departmentId: id.nullable().optional(),
    siteId: id.nullable().optional(),
  })).min(1).max(100),
});
