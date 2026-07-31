import { Prisma } from "@prisma/client";
import type { PostingEvent } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder, PostingDocument, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";
import {
  buildAssetCapitalizationPosting,
  buildBankChargePosting,
  buildExpensePosting,
  buildInventoryAccountingPosting,
  buildPayrollPosting,
  buildSupplierCreditNotePosting,
} from "@/lib/enterprise/accounting/domain-posting-builders";

async function salesInvoice(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1]): Promise<PostingDocument> {
  const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } } });
  if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_POSTABLE", 409);
  const revenue = invoice.subtotal.minus(invoice.discountTotal);
  const lines: PostingLineDraft[] = [
    { accountMappingKey: "ACCOUNTS_RECEIVABLE", description: `Receivable ${invoice.number}`, debit: invoice.grandTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.grandTotal, businessPartyId: invoice.businessPartyId, projectId: invoice.projectId },
    { accountMappingKey: "SALES_REVENUE", description: `Revenue ${invoice.number}`, credit: revenue, transactionCurrencyCode: invoice.currencyCode, transactionAmount: revenue, businessPartyId: invoice.businessPartyId, projectId: invoice.projectId },
  ];
  if (invoice.taxTotal.isPositive()) lines.push({ accountMappingKey: "TAX_PAYABLE", description: `Output tax ${invoice.number}`, credit: invoice.taxTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.taxTotal, businessPartyId: invoice.businessPartyId });
  return { organizationId: input.organizationId, journalType: "SALES", accountingDate: invoice.invoiceDate, documentDate: invoice.invoiceDate, reference: invoice.number, description: `Customer invoice ${invoice.number}`, sourceModule: "FINANCE_RECEIVABLES", sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoice.id, currencyCode: invoice.currencyCode, lines };
}

async function salesCredit(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1]): Promise<PostingDocument> {
  const credit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED"] } }, include: { salesInvoice: true } });
  if (!credit) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_POSTABLE", 409);
  const lines: PostingLineDraft[] = [
    { accountMappingKey: "SALES_REVENUE", description: `Revenue reversal ${credit.number}`, debit: credit.subtotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.subtotal, businessPartyId: credit.salesInvoice.businessPartyId },
    { accountMappingKey: "ACCOUNTS_RECEIVABLE", description: `Receivable credit ${credit.number}`, credit: credit.grandTotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.grandTotal, businessPartyId: credit.salesInvoice.businessPartyId },
  ];
  if (credit.taxTotal.isPositive()) lines.splice(1, 0, { accountMappingKey: "TAX_PAYABLE", description: `Output tax reversal ${credit.number}`, debit: credit.taxTotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.taxTotal, businessPartyId: credit.salesInvoice.businessPartyId });
  return { organizationId: input.organizationId, journalType: "SALES", accountingDate: credit.creditDate, documentDate: credit.creditDate, reference: credit.number, description: `Customer credit note ${credit.number}`, sourceModule: "FINANCE_RECEIVABLES", sourceEntityType: "EnterpriseSalesCreditNote", sourceEntityId: credit.id, currencyCode: credit.currencyCode, lines };
}

async function supplierInvoice(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1]): Promise<PostingDocument> {
  const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED", "PARTIALLY_PAID", "PAID"] } } });
  if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_POSTABLE", 409);
  const debitKey = invoice.purchaseReceiptId ? "GOODS_RECEIVED_CLEARING" : invoice.assetId ? "FIXED_ASSET" : "OPERATING_EXPENSE";
  const lines: PostingLineDraft[] = [
    { accountMappingKey: debitKey, description: `Supplier invoice ${invoice.number}`, debit: invoice.subtotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.subtotal, businessPartyId: invoice.businessPartyId, projectId: invoice.projectId, assetId: invoice.assetId },
    { accountMappingKey: "ACCOUNTS_PAYABLE", description: `Payable ${invoice.number}`, credit: invoice.grandTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.grandTotal, businessPartyId: invoice.businessPartyId },
  ];
  if (invoice.taxTotal.isPositive()) lines.splice(1, 0, { accountMappingKey: "TAX_RECEIVABLE", description: `Recoverable tax ${invoice.number}`, debit: invoice.taxTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.taxTotal, businessPartyId: invoice.businessPartyId });
  return { organizationId: input.organizationId, journalType: "PURCHASES", accountingDate: invoice.invoiceDate, documentDate: invoice.invoiceDate, reference: invoice.number, description: `Supplier invoice ${invoice.number}`, sourceModule: "FINANCE_PAYABLES", sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id, currencyCode: invoice.currencyCode, lines };
}

async function payment(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1], kind: "CUSTOMER" | "SUPPLIER" | "PAYROLL"): Promise<PostingDocument> {
  const value = await tx.enterprisePayment.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } }, include: { allocations: { where: { status: "CONFIRMED" } } } });
  if (!value?.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_NOT_POSTABLE", 409);
  const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: value.financialAccountId, organizationId: input.organizationId, status: "ACTIVE" } });
  if (!account) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
  const allocated = value.allocations.reduce((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0));
  if (!allocated.plus(value.unallocatedAmount).equals(value.amount)) throw new EnterpriseAccountingError("PAYMENT_POSTING_ALLOCATION_MISMATCH", 409);
  const inbound = value.direction === "INBOUND";
  const counterpart = kind === "CUSTOMER" ? "ACCOUNTS_RECEIVABLE" : kind === "SUPPLIER" ? "ACCOUNTS_PAYABLE" : "PAYROLL_PAYABLE";
  const advance = kind === "CUSTOMER" ? "CUSTOMER_ADVANCES" : kind === "SUPPLIER" ? "SUPPLIER_ADVANCES" : "PAYROLL_PAYABLE";
  const lines: PostingLineDraft[] = [{ accountMappingKey: `ACCOUNT_ID:${account.ledgerAccountId}`, description: value.number, ...(inbound ? { debit: value.amount } : { credit: value.amount }), transactionCurrencyCode: value.currencyCode, transactionAmount: value.amount, businessPartyId: value.businessPartyId }];
  if (allocated.isPositive()) lines.push({ accountMappingKey: counterpart, description: `Allocated ${value.number}`, ...(inbound ? { credit: allocated } : { debit: allocated }), transactionCurrencyCode: value.currencyCode, transactionAmount: allocated, businessPartyId: value.businessPartyId });
  if (value.unallocatedAmount.isPositive()) lines.push({ accountMappingKey: advance, description: `Advance ${value.number}`, ...(inbound ? { credit: value.unallocatedAmount } : { debit: value.unallocatedAmount }), transactionCurrencyCode: value.currencyCode, transactionAmount: value.unallocatedAmount, businessPartyId: value.businessPartyId });
  return { organizationId: input.organizationId, journalType: account.accountType === "CASH" ? "CASH" : account.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK", accountingDate: value.paymentDate, documentDate: value.paymentDate, reference: value.number, description: `${value.paymentType} ${value.number}`, sourceModule: "FINANCE_PAYMENTS", sourceEntityType: "EnterprisePayment", sourceEntityId: value.id, currencyCode: value.currencyCode, lines };
}

async function cashVariance(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1]): Promise<PostingDocument> {
  const value = await tx.enterpriseCashDiscrepancy.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED" }, include: { cashSession: { include: { financialAccount: true } } } });
  if (!value) throw new EnterpriseAccountingError("CASH_DISCREPANCY_NOT_POSTABLE", 409);
  const short = value.amount.isNegative();
  const amount = value.amount.abs();
  const cash = `ACCOUNT_ID:${value.cashSession.financialAccount.ledgerAccountId}`;
  return { organizationId: input.organizationId, journalType: "CASH", accountingDate: value.createdAt, reference: value.cashSession.number, description: `Cash variance ${value.cashSession.number}`, sourceModule: "FINANCE_CASH", sourceEntityType: "EnterpriseCashDiscrepancy", sourceEntityId: value.id, currencyCode: value.cashSession.financialAccount.currencyCode, lines: [
    { accountMappingKey: short ? "CASH_VARIANCE_EXPENSE" : cash, description: value.reason, debit: amount, transactionCurrencyCode: value.cashSession.financialAccount.currencyCode, transactionAmount: amount },
    { accountMappingKey: short ? cash : "CASH_VARIANCE_INCOME", description: value.reason, credit: amount, transactionCurrencyCode: value.cashSession.financialAccount.currencyCode, transactionAmount: amount },
  ] };
}

async function depreciation(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1]): Promise<PostingDocument> {
  const value = await tx.enterpriseAssetDepreciationSchedule.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["PLANNED", "APPROVED"] } }, include: { profile: true } });
  if (!value) throw new EnterpriseAccountingError("ASSET_DEPRECIATION_NOT_POSTABLE", 409);
  return { organizationId: input.organizationId, journalType: "ASSETS", accountingDate: value.scheduledDate, reference: value.periodCode, description: `Asset depreciation ${value.periodCode}`, sourceModule: "FINANCE_ASSETS", sourceEntityType: "EnterpriseAssetDepreciationSchedule", sourceEntityId: value.id, currencyCode: value.profile.currencyCode, lines: [
    { accountMappingKey: `ACCOUNT_ID:${value.profile.depreciationExpenseAccountId}`, description: value.periodCode, debit: value.depreciationAmount, transactionCurrencyCode: value.profile.currencyCode, transactionAmount: value.depreciationAmount, assetId: value.profile.assetId },
    { accountMappingKey: `ACCOUNT_ID:${value.profile.accumulatedDepreciationAccountId}`, description: value.periodCode, credit: value.depreciationAmount, transactionCurrencyCode: value.profile.currencyCode, transactionAmount: value.depreciationAmount, assetId: value.profile.assetId },
  ] };
}

async function openingBalance(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1]): Promise<PostingDocument> {
  const value = await tx.enterpriseOpeningBalanceImport.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED" }, include: { lines: true } });
  if (!value) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_POSTABLE", 409);
  return { organizationId: input.organizationId, journalType: "OPENING", accountingDate: value.createdAt, reference: value.reference, description: value.description || value.reference, sourceModule: "FINANCE_ACCOUNTING", sourceEntityType: "EnterpriseOpeningBalanceImport", sourceEntityId: value.id, currencyCode: value.currencyCode, lines: value.lines.map((line) => ({ accountMappingKey: `ACCOUNT_ID:${line.ledgerAccountId}`, description: line.reference || value.reference, debit: line.debit, credit: line.credit, transactionCurrencyCode: line.currencyCode, transactionAmount: line.debit.isPositive() ? line.debit : line.credit, businessPartyId: line.businessPartyId })) };
}

export const ENTERPRISE_POSTING_REGISTRY_V2: Record<PostingEvent, PostingBuilder> = {
  SALES_INVOICE_POSTED: salesInvoice,
  SALES_CREDIT_NOTE_POSTED: salesCredit,
  CUSTOMER_PAYMENT_CONFIRMED: (tx, input) => payment(tx, input, "CUSTOMER"),
  SUPPLIER_INVOICE_POSTED: supplierInvoice,
  SUPPLIER_CREDIT_NOTE_POSTED: buildSupplierCreditNotePosting,
  SUPPLIER_PAYMENT_CONFIRMED: (tx, input) => payment(tx, input, "SUPPLIER"),
  EXPENSE_APPROVED: buildExpensePosting,
  PAYROLL_APPROVED: buildPayrollPosting,
  PAYROLL_PAYMENT_CONFIRMED: (tx, input) => payment(tx, input, "PAYROLL"),
  INVENTORY_RECEIPT_VALUED: (tx, input) => buildInventoryAccountingPosting(tx, input, "RECEIPT"),
  INVENTORY_ISSUE_VALUED: (tx, input) => buildInventoryAccountingPosting(tx, input, "ISSUE"),
  ASSET_CAPITALIZED: buildAssetCapitalizationPosting,
  ASSET_DEPRECIATION_POSTED: depreciation,
  CASH_VARIANCE_POSTED: cashVariance,
  BANK_CHARGE_POSTED: buildBankChargePosting,
  OPENING_BALANCE_POSTED: openingBalance,
};

export function getPostingBuilderV2(event: PostingEvent) {
  const builder = ENTERPRISE_POSTING_REGISTRY_V2[event];
  if (!builder) throw new EnterpriseAccountingError("POSTING_EVENT_NOT_REGISTERED", 400, { event });
  return builder;
}
