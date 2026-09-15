import type { PostingBuilder, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export const buildCustomerRefundPosting: PostingBuilder = async (tx, input) => {
  const payment = await tx.enterprisePayment.findFirst({
    where: {
      id: input.sourceEntityId,
      organizationId: input.organizationId,
      paymentType: "REFUND",
      direction: "OUTBOUND",
      status: { in: ["CONFIRMED", "RECONCILED"] },
    },
  });
  if (!payment?.financialAccountId) throw new EnterpriseAccountingError("REFUND_PAYMENT_NOT_POSTABLE", 409);
  const financialAccount = await tx.enterpriseFinancialAccount.findFirst({
    where: { id: payment.financialAccountId, organizationId: input.organizationId, status: "ACTIVE", archivedAt: null },
  });
  if (!financialAccount || financialAccount.currencyCode !== payment.currencyCode) {
    throw new EnterpriseAccountingError("REFUND_FINANCIAL_ACCOUNT_INVALID", 409);
  }
  const lines: PostingLineDraft[] = [
    {
      accountMappingKey: "CUSTOMER_ADVANCES",
      description: `Customer refund ${payment.number}`,
      debit: payment.amount,
      transactionCurrencyCode: payment.currencyCode,
      transactionAmount: payment.amount,
      businessPartyId: payment.businessPartyId,
    },
    {
      accountMappingKey: `ACCOUNT_ID:${financialAccount.ledgerAccountId}`,
      description: `Customer refund ${payment.number}`,
      credit: payment.amount,
      transactionCurrencyCode: payment.currencyCode,
      transactionAmount: payment.amount,
      businessPartyId: payment.businessPartyId,
    },
  ];
  return {
    organizationId: input.organizationId,
    journalType: financialAccount.accountType === "CASH" ? "CASH" : financialAccount.accountType === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK",
    accountingDate: payment.paymentDate,
    documentDate: payment.paymentDate,
    reference: payment.number,
    description: `Customer refund ${payment.number}`,
    sourceModule: "FINANCE_PAYMENTS",
    sourceEntityType: "EnterprisePayment",
    sourceEntityId: payment.id,
    currencyCode: payment.currencyCode,
    lines,
  };
};
