import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder, PostingDocument, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

export const buildSalesInvoicePosting: PostingBuilder = async (tx, input) => {
  const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } } });
  if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_POSTABLE", 409);
  const revenue = invoice.subtotal.minus(invoice.discountTotal);
  const lines: PostingLineDraft[] = [
    { accountMappingKey: "ACCOUNTS_RECEIVABLE", description: `Receivable ${invoice.number}`, debit: invoice.grandTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.grandTotal, businessPartyId: invoice.businessPartyId, projectId: invoice.projectId },
    { accountMappingKey: "SALES_REVENUE", description: `Revenue ${invoice.number}`, credit: revenue, transactionCurrencyCode: invoice.currencyCode, transactionAmount: revenue, businessPartyId: invoice.businessPartyId, projectId: invoice.projectId },
  ];
  if (invoice.taxTotal.gt(0)) lines.push({ accountMappingKey: "TAX_PAYABLE", description: `Output tax ${invoice.number}`, credit: invoice.taxTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.taxTotal, businessPartyId: invoice.businessPartyId });
  return { organizationId: input.organizationId, journalType: "SALES", accountingDate: invoice.invoiceDate, documentDate: invoice.invoiceDate, reference: invoice.number, description: `Customer invoice ${invoice.number}`, sourceModule: "FINANCE_RECEIVABLES", sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoice.id, currencyCode: invoice.currencyCode, lines };
};

export const buildSalesCreditNotePosting: PostingBuilder = async (tx, input) => {
  const credit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED"] } }, include: { salesInvoice: true } });
  if (!credit) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_POSTABLE", 409);
  const lines: PostingLineDraft[] = [
    { accountMappingKey: "SALES_REVENUE", description: `Revenue reversal ${credit.number}`, debit: credit.subtotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.subtotal, businessPartyId: credit.salesInvoice.businessPartyId },
    { accountMappingKey: "ACCOUNTS_RECEIVABLE", description: `Receivable credit ${credit.number}`, credit: credit.grandTotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.grandTotal, businessPartyId: credit.salesInvoice.businessPartyId },
  ];
  if (credit.taxTotal.gt(0)) lines.splice(1, 0, { accountMappingKey: "TAX_PAYABLE", description: `Output tax reversal ${credit.number}`, debit: credit.taxTotal, transactionCurrencyCode: credit.currencyCode, transactionAmount: credit.taxTotal, businessPartyId: credit.salesInvoice.businessPartyId });
  return { organizationId: input.organizationId, journalType: "SALES", accountingDate: credit.creditDate, documentDate: credit.creditDate, reference: credit.number, description: `Customer credit note ${credit.number}`, sourceModule: "FINANCE_RECEIVABLES", sourceEntityType: "EnterpriseSalesCreditNote", sourceEntityId: credit.id, currencyCode: credit.currencyCode, lines };
};

export const buildSupplierInvoicePosting: PostingBuilder = async (tx, input) => {
  const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED", "PARTIALLY_PAID", "PAID"] } } });
  if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_POSTABLE", 409);
  const debitKey = invoice.purchaseReceiptId ? "GOODS_RECEIVED_CLEARING" : invoice.assetId ? "FIXED_ASSET" : "OPERATING_EXPENSE";
  const lines: PostingLineDraft[] = [
    { accountMappingKey: debitKey, description: `Supplier invoice ${invoice.number}`, debit: invoice.subtotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.subtotal, businessPartyId: invoice.businessPartyId, projectId: invoice.projectId, assetId: invoice.assetId },
    { accountMappingKey: "ACCOUNTS_PAYABLE", description: `Payable ${invoice.number}`, credit: invoice.grandTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.grandTotal, businessPartyId: invoice.businessPartyId },
  ];
  if (invoice.taxTotal.gt(0)) lines.splice(1, 0, { accountMappingKey: "TAX_RECEIVABLE", description: `Recoverable tax ${invoice.number}`, debit: invoice.taxTotal, transactionCurrencyCode: invoice.currencyCode, transactionAmount: invoice.taxTotal, businessPartyId: invoice.businessPartyId });
  return { organizationId: input.organizationId, journalType: "PURCHASES", accountingDate: invoice.invoiceDate, documentDate: invoice.invoiceDate, reference: invoice.number, description: `Supplier invoice ${invoice.number}`, sourceModule: "FINANCE_PAYABLES", sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id, currencyCode: invoice.currencyCode, lines };
};

async function buildPaymentPosting(tx: Prisma.TransactionClient, input: Parameters<PostingBuilder>[1], kind: "CUSTOMER" | "SUPPLIER" | "PAYROLL"): Promise<PostingDocument> {
  const payment = await tx.enterprisePayment.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } }, include: { allocations: { where: { status: "CONFIRMED" } } } });
  if (!payment?.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_NOT_POSTABLE", 409);
  const financialAccount = await tx.enterpriseFinancialAccount.findFirst({ where: { id: payment.financialAccountId, organizationId: input.organizationId, status: "ACTIVE" } });
  if (!financialAccount) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
  const allocated = payment.allocations.reduce<Prisma.Decimal>((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0));
  if (!allocated.plus(payment.unallocatedAmount).equals(payment.amount)) throw new EnterpriseAccountingError("PAYMENT_POSTING_ALLOCATION_MISMATCH", 409);
  const inbound = payment.direction === "INBOUND";
  const counterpart = kind === "CUSTOMER" ? "ACCOUNTS_RECEIVABLE" : kind === "SUPPLIER" ? "ACCOUNTS_PAYABLE" : "PAYROLL_PAYABLE";
  const advance = kind === "CUSTOMER" ? "CUSTOMER_ADVANCES" : kind === "SUPPLIER" ? "SUPPLIER_ADVANCES" : "PAYROLL_PAYABLE";
  const lines: PostingLineDraft[] = [{ accountMappingKey: `ACCOUNT_ID:${financialAccount.ledgerAccountId}`, description: payment.number, ...(inbound ? { debit: payment.amount } : { credit: payment.amount }), transactionCurrencyCode: payment.currencyCode, transactionAmount: payment.amount, businessPartyId: payment.businessPartyId }];
  if (allocated.gt(0)) lines.push({ accountMappingKey: counterpart, description: `Allocated ${payment.number}`, ...(inbound ? { credit: allocated } : { debit: allocated }), transactionCurrencyCode: payment.currencyCode, transactionAmount: allocated, businessPartyId: payment.businessPartyId });
  if (payment.unallocatedAmount.gt(0)) lines.push({ accountMappingKey: advance, description: `Advance ${payment.number}`, ...(inbound ? { credit: payment.unallocatedAmount } : { debit: payment.unallocatedAmount }), transactionCurrencyCode: payment.currencyCode, transactionAmount: payment.unallocatedAmount, businessPartyId: payment.businessPartyId });
  return { organizationId: input.organizationId, journalType: financialAccount.accountType === "CASH" ? "CASH" : financialAccount.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK", accountingDate: payment.paymentDate, documentDate: payment.paymentDate, reference: payment.number, description: `${payment.paymentType} ${payment.number}`, sourceModule: "FINANCE_PAYMENTS", sourceEntityType: "EnterprisePayment", sourceEntityId: payment.id, currencyCode: payment.currencyCode, lines };
}

export const buildCustomerPaymentPosting: PostingBuilder = (tx, input) => buildPaymentPosting(tx, input, "CUSTOMER");
export const buildSupplierPaymentPosting: PostingBuilder = (tx, input) => buildPaymentPosting(tx, input, "SUPPLIER");
export const buildPayrollPaymentPosting: PostingBuilder = (tx, input) => buildPaymentPosting(tx, input, "PAYROLL");

export const buildPaymentAllocationPosting: PostingBuilder = async (tx, input) => {
  const allocation = await tx.enterprisePaymentAllocation.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "CONFIRMED" }, include: { payment: true, receivable: true, payable: true } });
  if (!allocation) throw new EnterpriseAccountingError("PAYMENT_ALLOCATION_NOT_POSTABLE", 409);
  const inbound = Boolean(allocation.receivableId);
  const advanceKey = inbound ? "CUSTOMER_ADVANCES" : "SUPPLIER_ADVANCES";
  const targetKey = inbound ? "ACCOUNTS_RECEIVABLE" : "ACCOUNTS_PAYABLE";
  return {
    organizationId: input.organizationId,
    journalType: "ADJUSTMENT",
    accountingDate: allocation.allocatedAt,
    documentDate: allocation.allocatedAt,
    reference: allocation.payment.number,
    description: `Payment allocation ${allocation.payment.number}`,
    sourceModule: "FINANCE_PAYMENTS",
    sourceEntityType: "EnterprisePaymentAllocation",
    sourceEntityId: allocation.id,
    currencyCode: allocation.payment.currencyCode,
    lines: inbound
      ? [
          { accountMappingKey: advanceKey, description: `Apply customer advance ${allocation.payment.number}`, debit: allocation.amount, transactionCurrencyCode: allocation.payment.currencyCode, transactionAmount: allocation.amount, businessPartyId: allocation.payment.businessPartyId },
          { accountMappingKey: targetKey, description: `Settle receivable ${allocation.payment.number}`, credit: allocation.amount, transactionCurrencyCode: allocation.payment.currencyCode, transactionAmount: allocation.amount, businessPartyId: allocation.payment.businessPartyId },
        ]
      : [
          { accountMappingKey: targetKey, description: `Settle payable ${allocation.payment.number}`, debit: allocation.amount, transactionCurrencyCode: allocation.payment.currencyCode, transactionAmount: allocation.amount, businessPartyId: allocation.payment.businessPartyId },
          { accountMappingKey: advanceKey, description: `Apply supplier advance ${allocation.payment.number}`, credit: allocation.amount, transactionCurrencyCode: allocation.payment.currencyCode, transactionAmount: allocation.amount, businessPartyId: allocation.payment.businessPartyId },
        ],
  };
};

export const buildCashVariancePosting: PostingBuilder = async (tx, input) => {
  const discrepancy = await tx.enterpriseCashDiscrepancy.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED" }, include: { cashSession: { include: { financialAccount: true } } } });
  if (!discrepancy) throw new EnterpriseAccountingError("CASH_DISCREPANCY_NOT_POSTABLE", 409);
  const short = discrepancy.amount.isNegative();
  const amount = discrepancy.amount.abs();
  const cashKey = `ACCOUNT_ID:${discrepancy.cashSession.financialAccount.ledgerAccountId}`;
  return { organizationId: input.organizationId, journalType: "CASH", accountingDate: discrepancy.createdAt, documentDate: discrepancy.createdAt, reference: discrepancy.cashSession.number, description: `Cash variance ${discrepancy.cashSession.number}`, sourceModule: "FINANCE_CASH", sourceEntityType: "EnterpriseCashDiscrepancy", sourceEntityId: discrepancy.id, currencyCode: discrepancy.cashSession.financialAccount.currencyCode, lines: [
    { accountMappingKey: short ? "CASH_VARIANCE_EXPENSE" : cashKey, description: discrepancy.reason, debit: amount, transactionCurrencyCode: discrepancy.cashSession.financialAccount.currencyCode, transactionAmount: amount },
    { accountMappingKey: short ? cashKey : "CASH_VARIANCE_INCOME", description: discrepancy.reason, credit: amount, transactionCurrencyCode: discrepancy.cashSession.financialAccount.currencyCode, transactionAmount: amount },
  ] };
};

export const buildDepreciationPosting: PostingBuilder = async (tx, input) => {
  const schedule = await tx.enterpriseAssetDepreciationSchedule.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["PLANNED", "APPROVED"] } }, include: { profile: true } });
  if (!schedule) throw new EnterpriseAccountingError("ASSET_DEPRECIATION_NOT_POSTABLE", 409);
  return { organizationId: input.organizationId, journalType: "ASSETS", accountingDate: schedule.scheduledDate, documentDate: schedule.scheduledDate, reference: schedule.periodCode, description: `Asset depreciation ${schedule.periodCode}`, sourceModule: "FINANCE_ASSETS", sourceEntityType: "EnterpriseAssetDepreciationSchedule", sourceEntityId: schedule.id, currencyCode: schedule.profile.currencyCode, lines: [
    { accountMappingKey: `ACCOUNT_ID:${schedule.profile.depreciationExpenseAccountId}`, description: schedule.periodCode, debit: schedule.depreciationAmount, transactionCurrencyCode: schedule.profile.currencyCode, transactionAmount: schedule.depreciationAmount, assetId: schedule.profile.assetId },
    { accountMappingKey: `ACCOUNT_ID:${schedule.profile.accumulatedDepreciationAccountId}`, description: schedule.periodCode, credit: schedule.depreciationAmount, transactionCurrencyCode: schedule.profile.currencyCode, transactionAmount: schedule.depreciationAmount, assetId: schedule.profile.assetId },
  ] };
};

export const buildOpeningBalancePosting: PostingBuilder = async (tx, input) => {
  const opening = await tx.enterpriseOpeningBalanceImport.findFirst({ where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED" }, include: { lines: true } });
  if (!opening) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_POSTABLE", 409);
  return { organizationId: input.organizationId, journalType: "OPENING", accountingDate: opening.createdAt, documentDate: opening.createdAt, reference: opening.reference, description: opening.description || opening.reference, sourceModule: "FINANCE_ACCOUNTING", sourceEntityType: "EnterpriseOpeningBalanceImport", sourceEntityId: opening.id, currencyCode: opening.currencyCode, lines: opening.lines.map((line) => ({ accountMappingKey: `ACCOUNT_ID:${line.ledgerAccountId}`, description: line.reference || opening.reference, debit: line.debit, credit: line.credit, transactionCurrencyCode: line.currencyCode, transactionAmount: line.debit.gt(0) ? line.debit : line.credit, businessPartyId: line.businessPartyId })) };
};
