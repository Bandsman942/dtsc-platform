import { z } from "zod";

export const periodicAccountingOperationTypes = ["RECURRING", "ACCRUAL", "DEFERRAL", "ALLOCATION"] as const;
export const periodicAccountingCadences = ["MONTHLY", "QUARTERLY", "YEARLY", "MANUAL"] as const;
export const periodicAccountingSides = ["DEBIT", "CREDIT"] as const;

const optionalReference = z.string().trim().min(1).max(191).optional().nullable();

export const periodicAccountingTemplateLineSchema = z.object({
  ledgerAccountId: z.string().trim().min(1).max(191),
  side: z.enum(periodicAccountingSides),
  allocationPercent: z.coerce.number().gt(0).lte(100),
  description: z.string().trim().max(500).optional().nullable(),
  businessPartyId: optionalReference,
  projectId: optionalReference,
  departmentId: optionalReference,
  siteId: optionalReference,
  assetId: optionalReference,
  inventoryItemId: optionalReference,
  analyticReference: z.string().trim().max(191).optional().nullable(),
});

const templateFields = {
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  operationType: z.enum(periodicAccountingOperationTypes),
  journalId: z.string().trim().min(1).max(191),
  cadence: z.enum(periodicAccountingCadences),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  defaultAmount: z.coerce.number().positive(),
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  autoReverse: z.boolean().default(false),
  lines: z.array(periodicAccountingTemplateLineSchema).min(2).max(50),
};

function validateTemplate(value: { startDate: Date; endDate?: Date | null; lines: Array<{ side: "DEBIT" | "CREDIT"; allocationPercent: number }> }, ctx: z.RefinementCtx) {
  if (value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "PERIODIC_TEMPLATE_DATE_RANGE_INVALID" });
  }
  for (const side of periodicAccountingSides) {
    const total = value.lines.filter((line) => line.side === side).reduce((sum, line) => sum + line.allocationPercent, 0);
    if (Math.abs(total - 100) > 0.000001) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: `PERIODIC_TEMPLATE_${side}_ALLOCATION_MUST_TOTAL_100` });
    }
  }
}

export const periodicAccountingTemplateCreateSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  ...templateFields,
}).superRefine(validateTemplate);

export const periodicAccountingTemplateVersionSchema = z.object(templateFields).superRefine(validateTemplate);

export const periodicAccountingTransitionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "DEACTIVATE"]),
  revision: z.coerce.number().int().positive(),
});

export const periodicAccountingExecutionSchema = z.object({
  accountingDate: z.coerce.date(),
});
