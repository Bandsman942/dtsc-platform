import { z } from "zod";

const currency = z.string().trim().regex(/^[A-Z]{3}$/);
const id = z.string().cuid();
const amount = z.union([z.string(), z.number()]).transform(String).refine((value) => /^-?\d+(\.\d{1,6})?$/.test(value));
const date = z.coerce.date();
const revision = z.coerce.number().int().positive();

export const financialAccountCreateSchema = z.object({
  code: z.string().trim().min(1).max(40), name: z.string().trim().min(2).max(160), accountType: z.enum(["CASH", "BANK", "MOBILE_MONEY", "CLEARING"]), currencyCode: currency,
  maskedReference: z.string().trim().max(120).optional(), openingBalance: amount.default("0"), ledgerAccountId: id, responsibleUserId: id.optional(), siteId: id.optional(), settingsJson: z.record(z.string(), z.unknown()).optional(),
});
export const accountTransferSchema = z.object({ sourceFinancialAccountId: id, targetFinancialAccountId: id, sourceAmount: amount, targetAmount: amount, exchangeRate: amount.optional(), transferDate: date }).refine((v) => v.sourceFinancialAccountId !== v.targetFinancialAccountId);
export const transferTransitionSchema = z.object({ action: z.enum(["APPROVE", "CONFIRM"]), revision });
export const cashSessionOpenSchema = z.object({ financialAccountId: id, openingAmount: amount, siteId: id.optional() });
export const cashCloseSchema = z.object({ countedClosingAmount: amount, closingReason: z.string().trim().min(3).max(1000).optional(), counts: z.array(z.object({ denomination: amount, quantity: z.coerce.number().int().nonnegative().max(1000000) })).max(100), revision });
export const cashValidateSchema = z.object({ approve: z.boolean(), reason: z.string().trim().min(3).max(1000).optional(), revision }).superRefine((v, ctx) => { if (!v.approve && !v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Reason required" }); });
export const bankStatementSchema = z.object({ financialAccountId: id, reference: z.string().trim().min(1).max(120), statementDate: date, periodStart: date, periodEnd: date, currencyCode: currency, openingBalance: amount, closingBalance: amount, privateDocumentId: id.optional(), lines: z.array(z.object({ transactionDate: date, valueDate: date.optional(), description: z.string().trim().min(1).max(500), reference: z.string().trim().max(200).optional(), counterparty: z.string().trim().max(200).optional(), debit: amount.default("0"), credit: amount.default("0"), runningBalance: amount.optional() })).min(1).max(10000) });
export const reconciliationCreateSchema = z.object({ financialAccountId: id, bankStatementId: id.optional(), periodStart: date, periodEnd: date });
export const reconciliationMatchSchema = z.object({ bankStatementLineId: id.optional(), paymentId: id.optional(), treasuryTransactionId: id.optional(), journalEntryId: id.optional(), matchedAmount: amount }).refine((v) => Boolean(v.bankStatementLineId || v.paymentId || v.treasuryTransactionId || v.journalEntryId));
export const reconciliationCompleteSchema = z.object({ revision });
export const closePrepareSchema = z.object({ fiscalPeriodId: id });
export const closeTransitionSchema = z.object({ action: z.enum(["SUBMIT", "APPROVE", "CLOSE", "REOPEN"]), reason: z.string().trim().min(3).max(1000).optional(), revision }).superRefine((v, ctx) => { if (v.action === "REOPEN" && !v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Reason required" }); });
export const statementGenerateSchema = z.object({ statementType: z.enum(["TRIAL_BALANCE", "GENERAL_LEDGER", "JOURNALS", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "AR_AGING", "AP_AGING", "TREASURY", "BUDGET_VS_ACTUAL", "TAX", "ASSET_REGISTER", "INVENTORY_VALUATION"]), periodStart: date, periodEnd: date, currencyCode: currency, publish: z.boolean().optional() });
export const inventoryReceiptValuationSchema = z.object({ unitCost: amount, currencyCode: currency });
export const inventoryIssueValuationSchema = z.object({ currencyCode: currency });
export const expensePostingSchema = z.object({ accountingTreatment: z.enum(["DIRECT_EXPENSE", "EMPLOYEE_REIMBURSEMENT", "PETTY_CASH"]), revision });
export const assetProfileSchema = z.object({ capitalizationSourceType: z.string().trim().min(2).max(80), capitalizationSourceId: id.optional(), currencyCode: currency, originalCost: amount, residualValue: amount, usefulLifeMonths: z.coerce.number().int().min(1).max(1200), inServiceDate: date, assetAccountId: id, accumulatedDepreciationAccountId: id, depreciationExpenseAccountId: id });
export const assetDisposalSchema = z.object({ disposalDate: date, proceedsAmount: amount, proceedsCurrencyCode: currency, reason: z.string().trim().min(3).max(1000) });
