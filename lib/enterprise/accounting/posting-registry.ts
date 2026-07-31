import { Prisma } from "@prisma/client";
import type { PostingEvent } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export type PostingDimensionInput = {
  businessPartyId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  siteId?: string | null;
  assetId?: string | null;
  inventoryItemId?: string | null;
};

export type PostingLineDraft = PostingDimensionInput & {
  accountMappingKey: string;
  description: string;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
  transactionCurrencyCode: string;
  transactionAmount: Prisma.Decimal.Value;
};

export type PostingDocument = {
  organizationId: string;
  journalType: string;
  accountingDate: Date;
  documentDate?: Date | null;
  reference?: string | null;
  description: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  currencyCode: string;
  lines: PostingLineDraft[];
};

export type PostingBuilder = (
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityType: string; sourceEntityId: string },
) => Promise<PostingDocument>;

async function buildSalesInvoicePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }) {
  const invoice = await tx.enterpriseSalesInvoice.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
    include: { items: true },
  });
  if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_POSTABLE", 409);
  const revenueAmount = invoice.subtotal.minus(invoice.discountTotal);
  const lines: PostingLineDraft[] = [
    {
      accountMappingKey: "ACCOUNTS_RECEIVABLE",
      description: `Receivable ${invoice.number}`,
      debit: invoice.grandTotal,
      transactionCurrencyCode: invoice.currencyCode,
      transactionAmount: invoice.grandTotal,
      businessPartyId: invoice.businessPartyId,
      projectId: invoice.projectId,
    },
    {
      accountMappingKey: "SALES_REVENUE",
      description: `Revenue ${invoice.number}`,
      credit: revenueAmount,
      transactionCurrencyCode: invoice.currencyCode,
      transactionAmount: revenueAmount,
      businessPartyId: invoice.businessPartyId,
      projectId: invoice.projectId,
    },
  ];
  if (invoice.taxTotal.isPositive()) {
    lines.push({
      accountMappingKey: "TAX_PAYABLE",
      description: `Output tax ${invoice.number}`,
      credit: invoice.taxTotal,
      transactionCurrencyCode: invoice.currencyCode,
      transactionAmount: invoice.taxTotal,
      businessPartyId: invoice.businessPartyId,
      projectId: invoice.projectId,
    });
  }
  return {
    organizationId: input.organizationId,
    journalType: "SALES",
    accountingDate: invoice.invoiceDate,
    documentDate: invoice.invoiceDate,
    reference: invoice.number,
    description: `Customer invoice ${invoice.number}`,
    sourceModule: "FINANCE_RECEIVABLES",
    sourceEntityType: "EnterpriseSalesInvoice",
    sourceEntityId: invoice.id,
    currencyCode: invoice.currencyCode,
    lines,
  } satisfies PostingDocument;
}

async function buildSalesCreditNotePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }) {
  const creditNote = await tx.enterpriseSalesCreditNote.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED"] } },
    include: { salesInvoice: true },
  });
  if (!creditNote) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_POSTABLE", 409);
  const revenueAmount = creditNote.subtotal;
  const lines: PostingLineDraft[] = [
    {
      accountMappingKey: "SALES_REVENUE",
      description: `Revenue reversal ${creditNote.number}`,
      debit: revenueAmount,
      transactionCurrencyCode: creditNote.currencyCode,
      transactionAmount: revenueAmount,
      businessPartyId: creditNote.salesInvoice.businessPartyId,
      projectId: creditNote.salesInvoice.projectId,
    },
    {
      accountMappingKey: "ACCOUNTS_RECEIVABLE",
      description: `Receivable credit ${creditNote.number}`,
      credit: creditNote.grandTotal,
      transactionCurrencyCode: creditNote.currencyCode,
      transactionAmount: creditNote.grandTotal,
      businessPartyId: creditNote.salesInvoice.businessPartyId,
      projectId: creditNote.salesInvoice.projectId,
    },
  ];
  if (creditNote.taxTotal.isPositive()) {
    lines.splice(1, 0, {
      accountMappingKey: "TAX_PAYABLE",
      description: `Output tax reversal ${creditNote.number}`,
      debit: creditNote.taxTotal,
      transactionCurrencyCode: creditNote.currencyCode,
      transactionAmount: creditNote.taxTotal,
      businessPartyId: creditNote.salesInvoice.businessPartyId,
      projectId: creditNote.salesInvoice.projectId,
    });
  }
  return {
    organizationId: input.organizationId,
    journalType: "SALES",
    accountingDate: creditNote.creditDate,
    documentDate: creditNote.creditDate,
    reference: creditNote.number,
    description: `Customer credit note ${creditNote.number}`,
    sourceModule: "FINANCE_RECEIVABLES",
    sourceEntityType: "EnterpriseSalesCreditNote",
    sourceEntityId: creditNote.id,
    currencyCode: creditNote.currencyCode,
    lines,
  } satisfies PostingDocument;
}

async function buildSupplierInvoicePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }) {
  const invoice = await tx.enterpriseSupplierInvoice.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["APPROVED", "POSTED", "PARTIALLY_PAID", "PAID"] } },
    include: { items: true },
  });
  if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_POSTABLE", 409);
  const netAmount = invoice.subtotal;
  const debitMapping = invoice.purchaseReceiptId ? "GOODS_RECEIVED_CLEARING" : invoice.assetId ? "FIXED_ASSET" : "OPERATING_EXPENSE";
  const lines: PostingLineDraft[] = [
    {
      accountMappingKey: debitMapping,
      description: `Supplier invoice ${invoice.number}`,
      debit: netAmount,
      transactionCurrencyCode: invoice.currencyCode,
      transactionAmount: netAmount,
      businessPartyId: invoice.businessPartyId,
      projectId: invoice.projectId,
      assetId: invoice.assetId,
    },
    {
      accountMappingKey: "ACCOUNTS_PAYABLE",
      description: `Payable ${invoice.number}`,
      credit: invoice.grandTotal,
      transactionCurrencyCode: invoice.currencyCode,
      transactionAmount: invoice.grandTotal,
      businessPartyId: invoice.businessPartyId,
      projectId: invoice.projectId,
      assetId: invoice.assetId,
    },
  ];
  if (invoice.taxTotal.isPositive()) {
    lines.splice(1, 0, {
      accountMappingKey: "TAX_RECEIVABLE",
      description: `Recoverable tax ${invoice.number}`,
      debit: invoice.taxTotal,
      transactionCurrencyCode: invoice.currencyCode,
      transactionAmount: invoice.taxTotal,
      businessPartyId: invoice.businessPartyId,
      projectId: invoice.projectId,
    });
  }
  return {
    organizationId: input.organizationId,
    journalType: "PURCHASES",
    accountingDate: invoice.invoiceDate,
    documentDate: invoice.invoiceDate,
    reference: invoice.number,
    description: `Supplier invoice ${invoice.number}`,
    sourceModule: "FINANCE_PAYABLES",
    sourceEntityType: "EnterpriseSupplierInvoice",
    sourceEntityId: invoice.id,
    currencyCode: invoice.currencyCode,
    lines,
  } satisfies PostingDocument;
}

async function buildPaymentPosting(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityType: string; sourceEntityId: string },
  direction: "CUSTOMER" | "SUPPLIER" | "PAYROLL",
) {
  const payment = await tx.enterprisePayment.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } },
  });
  if (!payment || !payment.financialAccountId) throw new EnterpriseAccountingError("PAYMENT_NOT_POSTABLE", 409);
  const financialAccount = await tx.enterpriseFinancialAccount.findFirst({ where: { id: payment.financialAccountId, organizationId: input.organizationId, status: "ACTIVE" } });
  if (!financialAccount) throw new EnterpriseAccountingError("PAYMENT_FINANCIAL_ACCOUNT_REQUIRED", 409);
  const treasuryMapping = financialAccount.accountType === "CASH" ? "CASH" : financialAccount.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK";
  const inbound = payment.direction === "INBOUND";
  const counterpart = direction === "CUSTOMER" ? "ACCOUNTS_RECEIVABLE" : direction === "SUPPLIER" ? "ACCOUNTS_PAYABLE" : "PAYROLL_PAYABLE";
  return {
    organizationId: input.organizationId,
    journalType: financialAccount.accountType === "CASH" ? "CASH" : financialAccount.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK",
    accountingDate: payment.paymentDate,
    documentDate: payment.paymentDate,
    reference: payment.number,
    description: `${payment.paymentType} ${payment.number}`,
    sourceModule: "FINANCE_PAYMENTS",
    sourceEntityType: "EnterprisePayment",
    sourceEntityId: payment.id,
    currencyCode: payment.currencyCode,
    lines: [
      {
        accountMappingKey: inbound ? treasuryMapping : counterpart,
        description: `${payment.paymentType} ${payment.number}`,
        debit: payment.amount,
        transactionCurrencyCode: payment.currencyCode,
        transactionAmount: payment.amount,
        businessPartyId: payment.businessPartyId,
      },
      {
        accountMappingKey: inbound ? counterpart : treasuryMapping,
        description: `${payment.paymentType} ${payment.number}`,
        credit: payment.amount,
        transactionCurrencyCode: payment.currencyCode,
        transactionAmount: payment.amount,
        businessPartyId: payment.businessPartyId,
      },
    ],
  } satisfies PostingDocument;
}

async function buildCashVariancePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }) {
  const discrepancy = await tx.enterpriseCashDiscrepancy.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED" },
    include: { cashSession: { include: { financialAccount: true } } },
  });
  if (!discrepancy) throw new EnterpriseAccountingError("CASH_DISCREPANCY_NOT_POSTABLE", 409);
  const isShort = discrepancy.amount.isNegative();
  const amount = discrepancy.amount.abs();
  return {
    organizationId: input.organizationId,
    journalType: "CASH",
    accountingDate: discrepancy.createdAt,
    documentDate: discrepancy.createdAt,
    reference: discrepancy.cashSession.number,
    description: `Cash variance ${discrepancy.cashSession.number}`,
    sourceModule: "FINANCE_CASH",
    sourceEntityType: "EnterpriseCashDiscrepancy",
    sourceEntityId: discrepancy.id,
    currencyCode: discrepancy.cashSession.financialAccount.currencyCode,
    lines: [
      {
        accountMappingKey: isShort ? "CASH_VARIANCE_EXPENSE" : "CASH",
        description: discrepancy.reason,
        debit: amount,
        transactionCurrencyCode: discrepancy.cashSession.financialAccount.currencyCode,
        transactionAmount: amount,
      },
      {
        accountMappingKey: isShort ? "CASH" : "CASH_VARIANCE_INCOME",
        description: discrepancy.reason,
        credit: amount,
        transactionCurrencyCode: discrepancy.cashSession.financialAccount.currencyCode,
        transactionAmount: amount,
      },
    ],
  } satisfies PostingDocument;
}

async function buildAssetDepreciationPosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }) {
  const schedule = await tx.enterpriseAssetDepreciationSchedule.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: ["PLANNED", "APPROVED"] } },
    include: { profile: true },
  });
  if (!schedule) throw new EnterpriseAccountingError("ASSET_DEPRECIATION_NOT_POSTABLE", 409);
  return {
    organizationId: input.organizationId,
    journalType: "ASSETS",
    accountingDate: schedule.scheduledDate,
    documentDate: schedule.scheduledDate,
    reference: schedule.periodCode,
    description: `Asset depreciation ${schedule.periodCode}`,
    sourceModule: "FINANCE_ASSETS",
    sourceEntityType: "EnterpriseAssetDepreciationSchedule",
    sourceEntityId: schedule.id,
    currencyCode: schedule.profile.currencyCode,
    lines: [
      {
        accountMappingKey: `ACCOUNT_ID:${schedule.profile.depreciationExpenseAccountId}`,
        description: `Depreciation ${schedule.periodCode}`,
        debit: schedule.depreciationAmount,
        transactionCurrencyCode: schedule.profile.currencyCode,
        transactionAmount: schedule.depreciationAmount,
        assetId: schedule.profile.assetId,
      },
      {
        accountMappingKey: `ACCOUNT_ID:${schedule.profile.accumulatedDepreciationAccountId}`,
        description: `Accumulated depreciation ${schedule.periodCode}`,
        credit: schedule.depreciationAmount,
        transactionCurrencyCode: schedule.profile.currencyCode,
        transactionAmount: schedule.depreciationAmount,
        assetId: schedule.profile.assetId,
      },
    ],
  } satisfies PostingDocument;
}

async function buildOpeningBalancePosting(tx: Prisma.TransactionClient, input: { organizationId: string; sourceEntityType: string; sourceEntityId: string }) {
  const opening = await tx.enterpriseOpeningBalanceImport.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "APPROVED" },
    include: { lines: true },
  });
  if (!opening) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_POSTABLE", 409);
  return {
    organizationId: input.organizationId,
    journalType: "OPENING",
    accountingDate: opening.createdAt,
    documentDate: opening.createdAt,
    reference: opening.reference,
    description: opening.description || `Opening balance ${opening.reference}`,
    sourceModule: "FINANCE_ACCOUNTING",
    sourceEntityType: "EnterpriseOpeningBalanceImport",
    sourceEntityId: opening.id,
    currencyCode: opening.currencyCode,
    lines: opening.lines.map((line) => ({
      accountMappingKey: `ACCOUNT_ID:${line.ledgerAccountId}`,
      description: line.reference || opening.reference,
      debit: line.debit,
      credit: line.credit,
      transactionCurrencyCode: line.currencyCode,
      transactionAmount: line.debit.isPositive() ? line.debit : line.credit,
      businessPartyId: line.businessPartyId,
    })),
  } satisfies PostingDocument;
}

export const ENTERPRISE_POSTING_REGISTRY: Record<PostingEvent, PostingBuilder> = {
  SALES_INVOICE_POSTED: buildSalesInvoicePosting,
  SALES_CREDIT_NOTE_POSTED: buildSalesCreditNotePosting,
  CUSTOMER_PAYMENT_CONFIRMED: (tx, input) => buildPaymentPosting(tx, input, "CUSTOMER"),
  SUPPLIER_INVOICE_POSTED: buildSupplierInvoicePosting,
  SUPPLIER_CREDIT_NOTE_POSTED: async () => { throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_POSTING_NOT_READY", 409); },
  SUPPLIER_PAYMENT_CONFIRMED: (tx, input) => buildPaymentPosting(tx, input, "SUPPLIER"),
  EXPENSE_APPROVED: async () => { throw new EnterpriseAccountingError("EXPENSE_POSTING_REQUIRES_CLASSIFICATION", 409); },
  PAYROLL_APPROVED: async () => { throw new EnterpriseAccountingError("PAYROLL_POSTING_REQUIRES_AGGREGATE", 409); },
  PAYROLL_PAYMENT_CONFIRMED: (tx, input) => buildPaymentPosting(tx, input, "PAYROLL"),
  INVENTORY_RECEIPT_VALUED: async () => { throw new EnterpriseAccountingError("INVENTORY_RECEIPT_POSTING_REQUIRES_VALUATION", 409); },
  INVENTORY_ISSUE_VALUED: async () => { throw new EnterpriseAccountingError("INVENTORY_ISSUE_POSTING_REQUIRES_VALUATION", 409); },
  ASSET_CAPITALIZED: async () => { throw new EnterpriseAccountingError("ASSET_CAPITALIZATION_REQUIRES_PROFILE", 409); },
  ASSET_DEPRECIATION_POSTED: buildAssetDepreciationPosting,
  CASH_VARIANCE_POSTED: buildCashVariancePosting,
  BANK_CHARGE_POSTED: async () => { throw new EnterpriseAccountingError("BANK_CHARGE_REQUIRES_EXPLICIT_TRANSACTION", 409); },
  OPENING_BALANCE_POSTED: buildOpeningBalancePosting,
};

export function getPostingBuilder(event: PostingEvent) {
  const builder = ENTERPRISE_POSTING_REGISTRY[event];
  if (!builder) throw new EnterpriseAccountingError("POSTING_EVENT_NOT_REGISTERED", 400, { event });
  return builder;
}
