import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingDocument } from "@/lib/enterprise/accounting/posting-registry";

export async function buildSupplierCreditNotePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }): Promise<PostingDocument> {
  const credit = await tx.enterpriseSupplierCreditNote.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED"] } }, include: { supplierInvoice: true } });
  if (!credit) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_POSTABLE", 409);
  const lines: PostingDocument["lines"] = [
    { accountMappingKey: "ACCOUNTS_PAYABLE", description: `Payable credit ${credit.number}`, debit: credit.grandTotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.grandTotal, businessPartyId: credit.supplierInvoice.businessPartyId, projectId: credit.supplierInvoice.projectId },
    { accountMappingKey: credit.supplierInvoice.purchaseReceiptId ? "GOODS_RECEIVED_CLEARING" : credit.supplierInvoice.assetId ? "FIXED_ASSET" : "OPERATING_EXPENSE", description: `Supplier credit ${credit.number}`, credit: credit.subtotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.subtotal, businessPartyId: credit.supplierInvoice.businessPartyId, projectId: credit.supplierInvoice.projectId, assetId: credit.supplierInvoice.assetId },
  ];
  if (credit.taxTotal.gt(0)) lines.push({ accountMappingKey: "TAX_RECEIVABLE", description: `Recoverable tax credit ${credit.number}`, credit: credit.taxTotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.taxTotal, businessPartyId: credit.supplierInvoice.businessPartyId });
  return { organizationId: input.organizationId, journalType: "PURCHASES", accountingDate: credit.creditDate, documentDate: credit.creditDate, reference: credit.number, description: `Supplier credit note ${credit.number}`, sourceModule: "FINANCE_PAYABLES", sourceEntityType: "EnterpriseSupplierCreditNote", sourceEntityId: credit.id, currencyCode: credit.currencyCode, lines };
}

export async function buildExpensePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }): Promise<PostingDocument> {
  const expense = await tx.enterpriseExpense.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED", accountedAt: null } });
  if (!expense || ["SUPPLIER_INVOICE_PROJECTION", "ALREADY_ACCOUNTED"].includes(expense.accountingTreatment)) throw new EnterpriseAccountingError("EXPENSE_NOT_DIRECTLY_POSTABLE", 409);
  const counterpart = expense.accountingTreatment === "EMPLOYEE_REIMBURSEMENT" ? "EMPLOYEE_PAYABLE" : "EXPENSE_CLEARING";
  return {
    organizationId: input.organizationId,
    journalType: "GENERAL",
    accountingDate: expense.expenseDate,
    documentDate: expense.expenseDate,
    reference: expense.reference,
    description: `Expense ${expense.reference}`,
    sourceModule: "BUDGETS_EXPENSES",
    sourceEntityType: "EnterpriseExpense",
    sourceEntityId: expense.id,
    currencyCode: expense.currency,
    lines: [
      { accountMappingKey: "OPERATING_EXPENSE", description: expense.title, debit: expense.amount, transactionCurrencyCode: expense.currency, transactionAmount: expense.amount, departmentId: expense.departmentId },
      { accountMappingKey: counterpart, description: expense.title, credit: expense.amount, transactionCurrencyCode: expense.currency, transactionAmount: expense.amount, departmentId: expense.departmentId },
    ],
  };
}

export async function buildPayrollPosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }): Promise<PostingDocument> {
  const run = await tx.enterprisePayrollRun.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED" }, include: { payrollPeriod: true } });
  if (!run) throw new EnterpriseAccountingError("PAYROLL_RUN_NOT_POSTABLE", 409);
  const lines: PostingDocument["lines"] = [
    { accountMappingKey: "PAYROLL_EXPENSE", description: `Payroll ${run.reference}`, debit: run.grossAmount, transactionCurrencyCode: run.currency, transactionAmount: run.grossAmount },
    { accountMappingKey: "PAYROLL_PAYABLE", description: `Payroll net liability ${run.reference}`, credit: run.netAmount, transactionCurrencyCode: run.currency, transactionAmount: run.netAmount },
  ];
  const retained = run.grossAmount.minus(run.netAmount);
  if (retained.gt(0)) lines.push({ accountMappingKey: "PAYROLL_WITHHOLDING_PAYABLE", description: `Payroll withholding ${run.reference}`, credit: retained, transactionCurrencyCode: run.currency, transactionAmount: retained });
  return { organizationId: input.organizationId, journalType: "PAYROLL", accountingDate: run.payrollPeriod.payDate || run.payrollPeriod.periodEnd, documentDate: run.payrollPeriod.periodEnd, reference: run.reference, description: `Payroll ${run.reference}`, sourceModule: "HR_PAYROLL", sourceEntityType: "EnterprisePayrollRun", sourceEntityId: run.id, currencyCode: run.currency, lines };
}

export async function buildInventoryAccountingPosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }, kind: "RECEIPT" | "ISSUE"): Promise<PostingDocument> {
  const event = await tx.enterpriseInventoryAccountingEvent.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["PENDING", "APPROVED", "POSTED"] }, eventType: kind } });
  if (!event) throw new EnterpriseAccountingError("INVENTORY_ACCOUNTING_EVENT_NOT_POSTABLE", 409);
  const receipt = kind === "RECEIPT";
  return {
    organizationId: input.organizationId,
    journalType: "INVENTORY",
    accountingDate: event.createdAt,
    documentDate: event.createdAt,
    reference: event.stockMovementId,
    description: `${kind} valuation ${event.stockMovementId}`,
    sourceModule: "FINANCE_INVENTORY",
    sourceEntityType: "EnterpriseInventoryAccountingEvent",
    sourceEntityId: event.id,
    currencyCode: event.currencyCode,
    lines: [
      { accountMappingKey: receipt ? "INVENTORY" : "COST_OF_SALES", description: `${kind} ${event.inventoryItemId}`, debit: event.totalCost, transactionCurrencyCode: event.currencyCode, transactionAmount: event.totalCost, inventoryItemId: event.inventoryItemId },
      { accountMappingKey: receipt ? "GOODS_RECEIVED_CLEARING" : "INVENTORY", description: `${kind} ${event.inventoryItemId}`, credit: event.totalCost, transactionCurrencyCode: event.currencyCode, transactionAmount: event.totalCost, inventoryItemId: event.inventoryItemId },
    ],
  };
}

export async function buildAssetCapitalizationPosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }): Promise<PostingDocument> {
  const profile = await tx.enterpriseAssetAccountingProfile.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "ACTIVE" } });
  if (!profile) throw new EnterpriseAccountingError("ASSET_PROFILE_NOT_POSTABLE", 409);
  return {
    organizationId: input.organizationId,
    journalType: "ASSETS",
    accountingDate: profile.inServiceDate,
    documentDate: profile.inServiceDate,
    reference: profile.assetId,
    description: `Asset capitalization ${profile.assetId}`,
    sourceModule: "FINANCE_ASSETS",
    sourceEntityType: "EnterpriseAssetAccountingProfile",
    sourceEntityId: profile.id,
    currencyCode: profile.currencyCode,
    lines: [
      { accountMappingKey: `ACCOUNT_ID:${profile.assetAccountId}`, description: `Capitalized asset ${profile.assetId}`, debit: profile.originalCost, transactionCurrencyCode: profile.currencyCode, transactionAmount: profile.originalCost, assetId: profile.assetId },
      { accountMappingKey: "ASSET_CLEARING", description: `Asset capitalization clearing ${profile.assetId}`, credit: profile.originalCost, transactionCurrencyCode: profile.currencyCode, transactionAmount: profile.originalCost, assetId: profile.assetId },
    ],
  };
}

export async function buildBankChargePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }): Promise<PostingDocument> {
  const transaction = await tx.enterpriseTreasuryTransaction.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, transactionType: "BANK_CHARGE", direction: "OUTBOUND", status: "CONFIRMED" }, include: { financialAccount: true } });
  if (!transaction) throw new EnterpriseAccountingError("BANK_CHARGE_NOT_POSTABLE", 409);
  return { organizationId: input.organizationId, journalType: "BANK", accountingDate: transaction.transactionDate, documentDate: transaction.transactionDate, reference: transaction.reference, description: `Bank charge ${transaction.reference || transaction.id}`, sourceModule: "FINANCE_BANK", sourceEntityType: "EnterpriseTreasuryTransaction", sourceEntityId: transaction.id, currencyCode: transaction.currencyCode, lines: [
    { accountMappingKey: "BANK_CHARGES", description: "Bank charge", debit: transaction.amount, transactionCurrencyCode: transaction.currencyCode, transactionAmount: transaction.amount },
    { accountMappingKey: `ACCOUNT_ID:${transaction.financialAccount.ledgerAccountId}`, description: "Bank charge", credit: transaction.amount, transactionCurrencyCode: transaction.currencyCode, transactionAmount: transaction.amount },
  ] };
}
