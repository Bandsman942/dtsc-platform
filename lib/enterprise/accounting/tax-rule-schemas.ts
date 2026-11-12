import { z } from "zod";

export const compoundTaxRuleDraftSchema = z.object({
  taxCodeId: z.string().min(1),
  sourceType: z.enum(["SALES_INVOICE", "SUPPLIER_INVOICE"]),
  calculationMode: z.literal("SEQUENTIAL"),
  legalReference: z.string().trim().min(6).max(220),
  evidenceReference: z.string().trim().min(6).max(180),
  priority: z.number().int().min(0).max(1000).default(10),
}).strict();

export const compoundTaxRuleApprovalSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(6).max(500),
  revision: z.string().min(1),
}).strict();
