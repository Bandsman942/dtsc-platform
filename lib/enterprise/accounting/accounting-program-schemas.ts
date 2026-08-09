import { z } from "zod";
import { dateInputSchema, revisionSchema } from "@/lib/enterprise/accounting/schemas";

const templateReferenceSchema = z.string().trim().min(3).max(120);
const idSchema = z.string().trim().min(1).max(120);

export const accountingSetupMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ADOPT_TEMPLATE"),
    chartId: idSchema,
    templateReference: templateReferenceSchema,
  }),
  z.object({
    action: z.literal("ACTIVATE_CHART"),
    chartId: idSchema,
    revision: revisionSchema,
  }),
  z.object({
    action: z.literal("CREATE_CUSTOM_CHILD_ACCOUNT"),
    chartId: idSchema,
    parentId: idSchema,
    code: z.string().trim().min(1).max(40),
    nameFr: z.string().trim().min(2).max(180),
    nameEn: z.string().trim().min(2).max(180),
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  }),
  z.object({
    action: z.literal("DEACTIVATE_CUSTOM_ACCOUNT"),
    accountId: idSchema,
    revision: revisionSchema,
  }),
  z.object({
    action: z.literal("APPLY_RECOMMENDED_JOURNALS"),
  }),
  z.object({
    action: z.literal("APPLY_SAFE_TEMPLATE_UPGRADE"),
    chartId: idSchema,
    targetTemplateReference: templateReferenceSchema,
    revision: revisionSchema,
  }),
]);

export const regulatoryStatementRequestSchema = z.object({
  statementType: z.string().trim().min(2).max(80),
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
}).refine((value) => value.periodEnd >= value.periodStart, { message: "Statement end must be on or after start" });
