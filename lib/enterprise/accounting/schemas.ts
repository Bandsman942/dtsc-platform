import { z } from "zod";
import {
  ACCOUNT_SUBTYPES,
  ACCOUNT_TYPES,
  FINANCIAL_ACCOUNT_TYPES,
  FISCAL_PERIOD_STATUSES,
  JOURNAL_TYPES,
  PAYMENT_DIRECTIONS,
  PAYMENT_METHOD_TYPES,
  PAYMENT_TYPES,
  POSTING_EVENTS,
  TAX_CATEGORIES,
} from "@/lib/enterprise/accounting/constants";

export const moneyInputSchema = z.union([z.string(), z.number()]).transform((value) => String(value)).refine((value) => /^-?\d+(\.\d{1,12})?$/.test(value), "Invalid monetary value");
export const positiveMoneyInputSchema = moneyInputSchema.refine((value) => Number(value) > 0, "Amount must be positive");
export const currencyCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
export const dateInputSchema = z.coerce.date();
export const revisionSchema = z.coerce.number().int().positive();

export const financeConfigurationSchema = z.object({
  functionalCurrencyCode: currencyCodeSchema,
  presentationCurrencyCode: currencyCodeSchema.nullish(),
  inventoryValuationMethod: z.enum(["WEIGHTED_AVERAGE", "FIFO"]).default("WEIGHTED_AVERAGE"),
  reconciliationTolerance: moneyInputSchema.default("0.01"),
  numberingPolicyJson: z.record(z.string(), z.unknown()).optional(),
  taxPolicyJson: z.record(z.string(), z.unknown()).optional(),
  defaultAccountsJson: z.record(z.string(), z.string()).optional(),
  closePolicyJson: z.record(z.string(), z.unknown()).optional(),
  approvalThresholdsJson: z.record(z.string(), z.unknown()).optional(),
  automaticPostingEnabled: z.boolean().default(false),
  revision: revisionSchema.optional(),
});

export const fiscalYearCreateSchema = z.object({
  code: z.string().trim().min(2).max(30),
  startDate: dateInputSchema,
  endDate: dateInputSchema,
}).refine((data) => data.endDate > data.startDate, { message: "Fiscal year end must be after start" });

export const fiscalPeriodCreateSchema = z.object({
  fiscalYearId: z.string().min(1),
  code: z.string().trim().min(2).max(30),
  startDate: dateInputSchema,
  endDate: dateInputSchema,
}).refine((data) => data.endDate > data.startDate, { message: "Period end must be after start" });

export const fiscalPeriodTransitionSchema = z.object({
  status: z.enum(FISCAL_PERIOD_STATUSES),
  reason: z.string().trim().min(8).max(1000).optional(),
  revision: revisionSchema,
});

export const chartCreateSchema = z.object({
  code: z.string().trim().min(2).max(30),
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  templateCode: z.string().trim().max(80).optional(),
});

export const ledgerAccountCreateSchema = z.object({
  chartId: z.string().min(1),
  accountGroupId: z.string().min(1).optional(),
  code: z.string().trim().min(1).max(40),
  nameFr: z.string().trim().min(2).max(180),
  nameEn: z.string().trim().min(2).max(180),
  accountType: z.enum(ACCOUNT_TYPES),
  accountSubtype: z.enum(ACCOUNT_SUBTYPES).optional(),
  parentId: z.string().min(1).optional(),
  currencyCode: currencyCodeSchema.optional(),
  isControlAccount: z.boolean().default(false),
  isSystemAccount: z.boolean().default(false),
  allowDirectPosting: z.boolean().default(true),
});

export const journalCreateSchema = z.object({
  code: z.string().trim().min(2).max(30),
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  journalType: z.enum(JOURNAL_TYPES),
  sequencePrefix: z.string().trim().max(20).optional(),
  requiresApproval: z.boolean().default(false),
});

export const journalLineSchema = z.object({
  ledgerAccountId: z.string().min(1),
  businessPartyId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  inventoryItemId: z.string().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  debit: moneyInputSchema.default("0"),
  credit: moneyInputSchema.default("0"),
  transactionCurrencyCode: currencyCodeSchema.optional(),
  transactionAmount: moneyInputSchema.optional(),
  exchangeRate: moneyInputSchema.optional(),
  analyticReference: z.string().trim().max(160).optional(),
}).superRefine((line, ctx) => {
  const debit = Number(line.debit);
  const credit = Number(line.credit);
  if (debit < 0 || credit < 0 || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
    ctx.addIssue({ code: "custom", message: "A line must contain exactly one positive debit or credit" });
  }
});

export const journalEntryCreateSchema = z.object({
  journalId: z.string().min(1),
  fiscalPeriodId: z.string().min(1),
  accountingDate: dateInputSchema,
  documentDate: dateInputSchema.optional(),
  reference: z.string().trim().max(120).optional(),
  description: z.string().trim().min(2).max(500),
  sourceModule: z.string().trim().max(80).optional(),
  sourceEntityType: z.string().trim().max(100).optional(),
  sourceEntityId: z.string().trim().max(120).optional(),
  postingEvent: z.enum(POSTING_EVENTS).optional(),
  postingVersion: z.coerce.number().int().positive().default(1),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
  lines: z.array(journalLineSchema).min(2).max(500),
});

export const journalEntryTransitionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "REJECT", "POST", "CANCEL"]),
  reason: z.string().trim().min(4).max(1000).optional(),
  revision: revisionSchema,
});

export const reversalSchema = z.object({
  reason: z.string().trim().min(8).max(1000),
  accountingDate: dateInputSchema,
});

export const postingRequestSchema = z.object({
  postingEvent: z.enum(POSTING_EVENTS),
  sourceEntityType: z.string().trim().min(2).max(100),
  sourceEntityId: z.string().trim().min(1).max(120),
  postingVersion: z.coerce.number().int().positive().default(1),
});

export const invoiceItemSchema = z.object({
  catalogItemId: z.string().min(1).optional(),
  description: z.string().trim().min(2).max(500),
  quantity: positiveMoneyInputSchema,
  unitPrice: moneyInputSchema,
  discountAmount: moneyInputSchema.default("0"),
  taxCodeId: z.string().min(1).optional(),
  revenueAccountId: z.string().min(1).optional(),
  expenseAccountId: z.string().min(1).optional(),
  inventoryAccountId: z.string().min(1).optional(),
  assetAccountId: z.string().min(1).optional(),
  clearingAccountId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

export const salesInvoiceCreateSchema = z.object({
  businessPartyId: z.string().min(1),
  salesOrderId: z.string().min(1).optional(),
  fulfillmentId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  invoiceDate: dateInputSchema,
  dueDate: dateInputSchema.optional(),
  currencyCode: currencyCodeSchema,
  paymentTerms: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(invoiceItemSchema).min(1).max(500),
});

export const supplierInvoiceCreateSchema = z.object({
  supplierId: z.string().min(1),
  businessPartyId: z.string().min(1).optional(),
  purchaseId: z.string().min(1).optional(),
  purchaseReceiptId: z.string().min(1).optional(),
  expenseId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
  invoiceDate: dateInputSchema,
  dueDate: dateInputSchema.optional(),
  currencyCode: currencyCodeSchema,
  items: z.array(invoiceItemSchema).min(1).max(500),
});

export const invoiceTransitionSchema = z.object({
  action: z.enum(["SUBMIT", "REVIEW", "APPROVE", "ISSUE", "POST", "REJECT", "CANCEL", "VOID"]),
  reason: z.string().trim().min(4).max(1000).optional(),
  revision: revisionSchema,
});

export const creditNoteCreateSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().trim().min(8).max(1000),
  creditDate: dateInputSchema,
  items: z.array(invoiceItemSchema).min(1).max(500),
});

export const paymentCreateSchema = z.object({
  direction: z.enum(PAYMENT_DIRECTIONS),
  paymentType: z.enum(PAYMENT_TYPES),
  methodType: z.enum(PAYMENT_METHOD_TYPES),
  paymentMethodId: z.string().min(1).optional(),
  financialAccountId: z.string().min(1).optional(),
  businessPartyId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  payrollRunId: z.string().min(1).optional(),
  currencyCode: currencyCodeSchema,
  amount: positiveMoneyInputSchema,
  paymentDate: dateInputSchema,
  reference: z.string().trim().max(160).optional(),
  maskedExternalReference: z.string().trim().max(160).optional(),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
});

export const paymentTransitionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "CONFIRM", "RECONCILE", "CANCEL", "REVERSE"]),
  reason: z.string().trim().min(4).max(1000).optional(),
  revision: revisionSchema,
});

export const paymentAllocationSchema = z.object({
  receivableId: z.string().min(1).optional(),
  payableId: z.string().min(1).optional(),
  amount: positiveMoneyInputSchema,
}).refine((value) => Boolean(value.receivableId) !== Boolean(value.payableId), { message: "Choose exactly one receivable or payable" });

export const financialAccountCreateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(180),
  accountType: z.enum(FINANCIAL_ACCOUNT_TYPES),
  currencyCode: currencyCodeSchema,
  maskedReference: z.string().trim().max(160).optional(),
  openingBalance: moneyInputSchema.default("0"),
  ledgerAccountId: z.string().min(1),
  responsibleUserId: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  settingsJson: z.record(z.string(), z.unknown()).optional(),
});

export const accountTransferCreateSchema = z.object({
  sourceFinancialAccountId: z.string().min(1),
  targetFinancialAccountId: z.string().min(1),
  sourceAmount: positiveMoneyInputSchema,
  targetAmount: positiveMoneyInputSchema,
  exchangeRate: positiveMoneyInputSchema.optional(),
  transferDate: dateInputSchema,
}).refine((value) => value.sourceFinancialAccountId !== value.targetFinancialAccountId, { message: "Transfer accounts must differ" });

export const cashSessionOpenSchema = z.object({
  financialAccountId: z.string().min(1),
  siteId: z.string().min(1).optional(),
  openingAmount: moneyInputSchema,
});

export const cashSessionCloseSchema = z.object({
  countedClosingAmount: moneyInputSchema,
  closingReason: z.string().trim().min(4).max(1000).optional(),
  counts: z.array(z.object({ denomination: positiveMoneyInputSchema, quantity: z.coerce.number().int().nonnegative() })).max(100),
  revision: revisionSchema,
});

export const bankStatementImportSchema = z.object({
  financialAccountId: z.string().min(1),
  reference: z.string().trim().min(2).max(120),
  statementDate: dateInputSchema,
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
  currencyCode: currencyCodeSchema,
  openingBalance: moneyInputSchema,
  closingBalance: moneyInputSchema,
  privateDocumentId: z.string().min(1).optional(),
  lines: z.array(z.object({
    transactionDate: dateInputSchema,
    valueDate: dateInputSchema.optional(),
    description: z.string().trim().min(1).max(1000),
    reference: z.string().trim().max(160).optional(),
    counterparty: z.string().trim().max(200).optional(),
    debit: moneyInputSchema.default("0"),
    credit: moneyInputSchema.default("0"),
    runningBalance: moneyInputSchema.optional(),
  })).min(1).max(10000),
}).refine((value) => value.periodEnd >= value.periodStart, { message: "Invalid statement period" });

export const reconciliationCreateSchema = z.object({
  financialAccountId: z.string().min(1),
  bankStatementId: z.string().min(1).optional(),
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
});

export const reconciliationMatchSchema = z.object({
  bankStatementLineId: z.string().min(1).optional(),
  paymentId: z.string().min(1).optional(),
  treasuryTransactionId: z.string().min(1).optional(),
  journalEntryId: z.string().min(1).optional(),
  matchedAmount: positiveMoneyInputSchema,
  revision: revisionSchema.optional(),
});

export const taxCodeCreateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  nameFr: z.string().trim().min(2).max(160),
  nameEn: z.string().trim().min(2).max(160),
  category: z.enum(TAX_CATEGORIES),
  jurisdiction: z.string().trim().max(160).optional(),
  payableAccountId: z.string().min(1).optional(),
  recoverableAccountId: z.string().min(1).optional(),
  roundingRule: z.enum(["HALF_UP", "HALF_EVEN", "UP", "DOWN"]).default("HALF_UP"),
  rate: moneyInputSchema,
  effectiveFrom: dateInputSchema,
});

export const financialStatementQuerySchema = z.object({
  statementType: z.enum(["TRIAL_BALANCE", "GENERAL_LEDGER", "JOURNALS", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "AR_AGING", "AP_AGING", "TREASURY", "BUDGET_VS_ACTUAL", "TAX", "ASSET_REGISTER", "INVENTORY_VALUATION"]),
  periodStart: dateInputSchema,
  periodEnd: dateInputSchema,
  currencyCode: currencyCodeSchema,
  publish: z.boolean().default(false),
});

export const financialCloseTransitionSchema = z.object({
  action: z.enum(["PREPARE", "SUBMIT", "APPROVE", "CLOSE", "REOPEN"]),
  reason: z.string().trim().min(8).max(1000).optional(),
  revision: revisionSchema,
});
