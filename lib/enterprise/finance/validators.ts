import { z } from "zod";
import {
  ENTERPRISE_BUDGET_ACTIONS,
  ENTERPRISE_EXPENSE_ACTIONS,
  ENTERPRISE_REPORT_ACTIONS,
  ENTERPRISE_REPORT_TYPES,
} from "@/lib/enterprise/finance/constants";

const optionalText = (max = 5000) => z.string().trim().max(max).optional().or(z.literal(""));
const optionalId = z.string().trim().max(180).optional().or(z.literal(""));
const optionalDate = z.string().trim().max(40).optional().or(z.literal(""));
const revision = z.coerce.number().int().min(1);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const amount = z.coerce.number().min(0).max(1_000_000_000_000);

export const enterpriseBudgetLineSchema = z.object({
  id: optionalId,
  code: optionalText(80),
  name: z.string().trim().min(2).max(240),
  description: optionalText(3000),
  category: optionalText(120),
  departmentId: optionalId,
  plannedAmount: amount,
});

const budgetBase = z.object({
  title: z.string().trim().min(2).max(240),
  description: optionalText(8000),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  currency: currency.default("USD"),
  departmentId: optionalId,
  lines: z.array(enterpriseBudgetLineSchema).min(1).max(300),
});

export const enterpriseBudgetCreateSchema = budgetBase.superRefine((data, ctx) => {
  if (data.periodEnd < data.periodStart) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "La fin de période doit être postérieure au début." });
});

export const enterpriseBudgetUpdateSchema = z.object({
  revision,
  title: z.string().trim().min(2).max(240).optional(),
  description: optionalText(8000),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  currency: currency.optional(),
  departmentId: optionalId,
  lines: z.array(enterpriseBudgetLineSchema).min(1).max(300).optional(),
}).superRefine((data, ctx) => {
  if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "La fin de période doit être postérieure au début." });
});

export const enterpriseBudgetActionSchema = z.object({
  revision,
  action: z.enum(ENTERPRISE_BUDGET_ACTIONS),
  approverUserId: optionalId,
  comment: optionalText(3000),
}).superRefine((data, ctx) => {
  if (data.action === "SUBMIT" && !data.approverUserId) ctx.addIssue({ code: "custom", path: ["approverUserId"], message: "Un approbateur doit être désigné." });
});

const expenseBase = z.object({
  title: z.string().trim().min(2).max(240),
  description: optionalText(8000),
  expenseDate: z.coerce.date(),
  category: optionalText(120),
  currency: currency.optional(),
  amount: amount.optional(),
  supplierId: optionalId,
  purchaseId: optionalId,
  budgetLineId: optionalId,
  departmentId: optionalId,
  amountVarianceReason: optionalText(3000),
  sourceModule: optionalText(120),
  sourceEntityType: optionalText(120),
  sourceEntityId: optionalId,
  documentIds: z.array(z.string().trim().min(1).max(180)).max(40).optional().default([]),
});

export const enterpriseExpenseCreateSchema = expenseBase.superRefine((data, ctx) => {
  const sourceCount = [data.sourceModule, data.sourceEntityType, data.sourceEntityId].filter(Boolean).length;
  if (sourceCount !== 0 && sourceCount !== 3) ctx.addIssue({ code: "custom", path: ["sourceEntityId"], message: "La source liée doit être complète." });
  if (!data.purchaseId && data.amount === undefined) ctx.addIssue({ code: "custom", path: ["amount"], message: "Le montant est obligatoire sans achat source." });
});

export const enterpriseExpenseUpdateSchema = z.object({
  revision,
  title: z.string().trim().min(2).max(240).optional(),
  description: optionalText(8000),
  expenseDate: z.coerce.date().optional(),
  category: optionalText(120),
  currency: currency.optional(),
  amount: amount.optional(),
  supplierId: optionalId,
  purchaseId: optionalId,
  budgetLineId: optionalId,
  departmentId: optionalId,
  amountVarianceReason: optionalText(3000),
  documentIds: z.array(z.string().trim().min(1).max(180)).max(40).optional(),
});

export const enterpriseExpenseActionSchema = z.object({
  revision,
  action: z.enum(ENTERPRISE_EXPENSE_ACTIONS),
  approverUserId: optionalId,
  comment: optionalText(3000),
}).superRefine((data, ctx) => {
  if (data.action === "SUBMIT" && !data.approverUserId) ctx.addIssue({ code: "custom", path: ["approverUserId"], message: "Un approbateur doit être désigné." });
});

export const enterpriseReportGenerateSchema = z.object({
  reportType: z.enum(ENTERPRISE_REPORT_TYPES),
  title: z.string().trim().min(2).max(240),
  description: optionalText(5000),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  currency: currency.optional().or(z.literal("")),
  departmentId: optionalId,
  supplierId: optionalId,
  budgetId: optionalId,
  category: optionalText(120),
  sourceModule: optionalText(120),
  sourceEntityType: optionalText(120),
  sourceEntityId: optionalId,
}).superRefine((data, ctx) => {
  if (data.periodStart && data.periodEnd && new Date(data.periodEnd) < new Date(data.periodStart)) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "La fin de période doit être postérieure au début." });
  const sourceCount = [data.sourceModule, data.sourceEntityType, data.sourceEntityId].filter(Boolean).length;
  if (sourceCount !== 0 && sourceCount !== 3) ctx.addIssue({ code: "custom", path: ["sourceEntityId"], message: "La source liée doit être complète." });
});

export const enterpriseReportActionSchema = z.object({
  revision,
  action: z.enum(ENTERPRISE_REPORT_ACTIONS),
});

export const enterpriseSprint8OperationalCommentSchema = z.object({
  entityType: z.enum(["EnterpriseBudget", "EnterpriseExpense", "EnterpriseReport"]),
  entityId: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(3000),
});
