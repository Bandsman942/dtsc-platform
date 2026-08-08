import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

export const buildRetailPosReturnPosting: PostingBuilder = async (tx, input) => {
  const retailReturn = await tx.enterpriseRetailReturn.findFirst({
    where: { id: input.sourceEntityId, organizationId: input.organizationId, status: "COMPLETED" },
    include: { refunds: { where: { status: "CONFIRMED" } }, sale: true },
  });
  if (!retailReturn || !retailReturn.refunds.length) throw new EnterpriseAccountingError("RETAIL_POS_RETURN_NOT_POSTABLE", 409);
  const refundTotal = retailReturn.refunds.reduce((sum, refund) => sum.plus(refund.amount), new Prisma.Decimal(0));
  if (!refundTotal.equals(retailReturn.grandTotal)) {
    throw new EnterpriseAccountingError("RETAIL_POS_RETURN_REFUND_MISMATCH", 409, { refundTotal: refundTotal.toFixed(), grandTotal: retailReturn.grandTotal.toFixed() });
  }
  const financialAccountIds = Array.from(new Set(retailReturn.refunds.map((refund) => refund.financialAccountId).filter((value): value is string => Boolean(value))));
  if (financialAccountIds.length !== retailReturn.refunds.length) throw new EnterpriseAccountingError("RETAIL_POS_RETURN_ACCOUNT_REQUIRED", 409);
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId: input.organizationId, id: { in: financialAccountIds }, archivedAt: null },
    select: { id: true, ledgerAccountId: true, currencyCode: true },
  });
  if (accounts.length !== financialAccountIds.length) throw new EnterpriseAccountingError("RETAIL_POS_RETURN_ACCOUNT_REQUIRED", 409);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const revenue = retailReturn.subtotal.minus(retailReturn.discountTotal);
  if (revenue.lt(0)) throw new EnterpriseAccountingError("RETAIL_POS_RETURN_REVENUE_INVALID", 409);
  const lines: PostingLineDraft[] = [];
  if (revenue.gt(0)) {
    lines.push({
      accountMappingKey: "SALES_REVENUE",
      description: `Retail return revenue ${retailReturn.number}`,
      debit: revenue,
      transactionCurrencyCode: retailReturn.currencyCode,
      transactionAmount: revenue,
      businessPartyId: retailReturn.sale.customerBusinessPartyId,
      siteId: retailReturn.sale.siteId,
    });
  }
  if (retailReturn.taxTotal.gt(0)) {
    lines.push({
      accountMappingKey: "TAX_PAYABLE",
      description: `Retail return output tax ${retailReturn.number}`,
      debit: retailReturn.taxTotal,
      transactionCurrencyCode: retailReturn.currencyCode,
      transactionAmount: retailReturn.taxTotal,
      businessPartyId: retailReturn.sale.customerBusinessPartyId,
      siteId: retailReturn.sale.siteId,
    });
  }
  for (const refund of retailReturn.refunds) {
    if (!refund.financialAccountId) throw new EnterpriseAccountingError("RETAIL_POS_RETURN_ACCOUNT_REQUIRED", 409);
    const account = accountById.get(refund.financialAccountId);
    if (!account || account.currencyCode !== retailReturn.currencyCode) throw new EnterpriseAccountingError("RETAIL_POS_RETURN_ACCOUNT_REQUIRED", 409);
    lines.push({
      accountMappingKey: `ACCOUNT_ID:${account.ledgerAccountId}`,
      description: `${refund.methodType} refund ${retailReturn.number}`,
      credit: refund.amount,
      transactionCurrencyCode: retailReturn.currencyCode,
      transactionAmount: refund.amount,
      businessPartyId: retailReturn.sale.customerBusinessPartyId,
      siteId: retailReturn.sale.siteId,
    });
  }
  return {
    organizationId: input.organizationId,
    journalType: "SALES",
    accountingDate: retailReturn.completedAt || retailReturn.updatedAt,
    documentDate: retailReturn.completedAt || retailReturn.updatedAt,
    reference: retailReturn.number,
    description: `Retail POS return ${retailReturn.number}`,
    sourceModule: "RETAIL_POS",
    sourceEntityType: "EnterpriseRetailReturn",
    sourceEntityId: retailReturn.id,
    currencyCode: retailReturn.currencyCode,
    lines,
  };
};
