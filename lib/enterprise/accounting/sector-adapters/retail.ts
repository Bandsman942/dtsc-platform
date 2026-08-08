import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

async function loadRetailSaleForPosting(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityId: string },
  allowedStatuses: string[],
) {
  const sale = await tx.enterpriseRetailSale.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: { in: allowedStatuses } },
    include: { tenders: true },
  });
  if (!sale) throw new EnterpriseAccountingError("RETAIL_POS_SALE_NOT_POSTABLE", 409);
  if (!sale.tenders.length || sale.tenders.some((tender) => !["CONFIRMED", "REVERSED"].includes(tender.status))) {
    throw new EnterpriseAccountingError("RETAIL_POS_TENDER_NOT_POSTABLE", 409);
  }
  const financialAccountIds = Array.from(new Set(sale.tenders.map((tender) => tender.financialAccountId)));
  const financialAccounts = await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId: input.organizationId, id: { in: financialAccountIds }, archivedAt: null },
    select: { id: true, ledgerAccountId: true, currencyCode: true },
  });
  if (financialAccounts.length !== financialAccountIds.length) {
    throw new EnterpriseAccountingError("RETAIL_POS_FINANCIAL_ACCOUNT_NOT_POSTABLE", 409);
  }
  const accountById = new Map(financialAccounts.map((account) => [account.id, account]));
  const tenderTotal = sale.tenders.reduce((total, tender) => total.plus(tender.amount), new Prisma.Decimal(0));
  if (!tenderTotal.equals(sale.grandTotal)) {
    throw new EnterpriseAccountingError("RETAIL_POS_POSTING_TENDER_MISMATCH", 409, {
      tenderTotal: tenderTotal.toFixed(),
      grandTotal: sale.grandTotal.toFixed(),
    });
  }
  for (const tender of sale.tenders) {
    const account = accountById.get(tender.financialAccountId);
    if (!account || account.currencyCode !== sale.currencyCode) {
      throw new EnterpriseAccountingError("RETAIL_POS_FINANCIAL_ACCOUNT_NOT_POSTABLE", 409, { financialAccountId: tender.financialAccountId });
    }
  }
  return { sale, accountById };
}

function retailTenderLines(
  sale: Awaited<ReturnType<typeof loadRetailSaleForPosting>>["sale"],
  accountById: Awaited<ReturnType<typeof loadRetailSaleForPosting>>["accountById"],
  side: "DEBIT" | "CREDIT",
) {
  return sale.tenders.map<PostingLineDraft>((tender) => {
    const account = accountById.get(tender.financialAccountId);
    if (!account) throw new EnterpriseAccountingError("RETAIL_POS_FINANCIAL_ACCOUNT_NOT_POSTABLE", 409);
    return {
      accountMappingKey: `ACCOUNT_ID:${account.ledgerAccountId}`,
      description: `${tender.methodType} ${sale.number}`,
      ...(side === "DEBIT" ? { debit: tender.amount } : { credit: tender.amount }),
      transactionCurrencyCode: sale.currencyCode,
      transactionAmount: tender.amount,
      businessPartyId: sale.customerBusinessPartyId,
      siteId: sale.siteId,
    };
  });
}

export const buildRetailPosSalePosting: PostingBuilder = async (tx, input) => {
  const { sale, accountById } = await loadRetailSaleForPosting(tx, input, ["COMPLETED", "REVERSED"]);
  const revenue = sale.subtotal.minus(sale.discountTotal);
  if (revenue.isNegative()) throw new EnterpriseAccountingError("RETAIL_POS_REVENUE_INVALID", 409);
  const lines: PostingLineDraft[] = retailTenderLines(sale, accountById, "DEBIT");
  if (revenue.isPositive()) {
    lines.push({
      accountMappingKey: "SALES_REVENUE",
      description: `Retail revenue ${sale.number}`,
      credit: revenue,
      transactionCurrencyCode: sale.currencyCode,
      transactionAmount: revenue,
      businessPartyId: sale.customerBusinessPartyId,
      siteId: sale.siteId,
    });
  }
  if (sale.taxTotal.isPositive()) {
    lines.push({
      accountMappingKey: "TAX_PAYABLE",
      description: `Retail output tax ${sale.number}`,
      credit: sale.taxTotal,
      transactionCurrencyCode: sale.currencyCode,
      transactionAmount: sale.taxTotal,
      businessPartyId: sale.customerBusinessPartyId,
      siteId: sale.siteId,
    });
  }
  return {
    organizationId: input.organizationId,
    journalType: "SALES",
    accountingDate: sale.soldAt,
    documentDate: sale.soldAt,
    reference: sale.number,
    description: `Retail POS sale ${sale.number}`,
    sourceModule: "RETAIL_POS",
    sourceEntityType: "EnterpriseRetailSale",
    sourceEntityId: sale.id,
    currencyCode: sale.currencyCode,
    lines,
  };
};

export const buildRetailPosSaleReversalPosting: PostingBuilder = async (tx, input) => {
  const { sale, accountById } = await loadRetailSaleForPosting(tx, input, ["REVERSED"]);
  const revenue = sale.subtotal.minus(sale.discountTotal);
  const lines: PostingLineDraft[] = [];
  if (revenue.isPositive()) {
    lines.push({
      accountMappingKey: "SALES_REVENUE",
      description: `Retail revenue reversal ${sale.number}`,
      debit: revenue,
      transactionCurrencyCode: sale.currencyCode,
      transactionAmount: revenue,
      businessPartyId: sale.customerBusinessPartyId,
      siteId: sale.siteId,
    });
  }
  if (sale.taxTotal.isPositive()) {
    lines.push({
      accountMappingKey: "TAX_PAYABLE",
      description: `Retail output tax reversal ${sale.number}`,
      debit: sale.taxTotal,
      transactionCurrencyCode: sale.currencyCode,
      transactionAmount: sale.taxTotal,
      businessPartyId: sale.customerBusinessPartyId,
      siteId: sale.siteId,
    });
  }
  lines.push(...retailTenderLines(sale, accountById, "CREDIT"));
  const reversalDate = sale.reversedAt || sale.updatedAt;
  return {
    organizationId: input.organizationId,
    journalType: "SALES",
    accountingDate: reversalDate,
    documentDate: reversalDate,
    reference: sale.number,
    description: `Retail POS reversal ${sale.number}`,
    sourceModule: "RETAIL_POS",
    sourceEntityType: "EnterpriseRetailSale",
    sourceEntityId: sale.id,
    currencyCode: sale.currencyCode,
    lines,
  };
};

export const buildRetailInventoryReturnPosting: PostingBuilder = async (tx, input) => {
  const event = await tx.enterpriseInventoryAccountingEvent.findFirst({
    where: {
      id: input.sourceEntityId,
      organizationId: input.organizationId,
      eventType: "RETAIL_RETURN",
      status: { in: ["APPROVED", "POSTED"] },
    },
  });
  if (!event || !event.totalCost.isPositive()) throw new EnterpriseAccountingError("RETAIL_INVENTORY_RETURN_NOT_POSTABLE", 409);
  return {
    organizationId: input.organizationId,
    journalType: "INVENTORY",
    accountingDate: event.createdAt,
    documentDate: event.createdAt,
    reference: event.stockMovementId,
    description: `Retail inventory return ${event.stockMovementId}`,
    sourceModule: "FINANCE_INVENTORY",
    sourceEntityType: "EnterpriseInventoryAccountingEvent",
    sourceEntityId: event.id,
    currencyCode: event.currencyCode,
    lines: [
      {
        accountMappingKey: "INVENTORY",
        description: `Retail stock return ${event.inventoryItemId}`,
        debit: event.totalCost,
        transactionCurrencyCode: event.currencyCode,
        transactionAmount: event.totalCost,
        inventoryItemId: event.inventoryItemId,
      },
      {
        accountMappingKey: "COST_OF_SALES",
        description: `Retail COGS reversal ${event.inventoryItemId}`,
        credit: event.totalCost,
        transactionCurrencyCode: event.currencyCode,
        transactionAmount: event.totalCost,
        inventoryItemId: event.inventoryItemId,
      },
    ],
  };
};