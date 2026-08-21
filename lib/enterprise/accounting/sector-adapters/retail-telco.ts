import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

async function loadTelcoTopup(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityId: string },
  statuses: string[],
) {
  const topup = await tx.enterpriseTelcoTopup.findFirst({
    where: {
      organizationId: input.organizationId,
      id: input.sourceEntityId,
      status: { in: statuses },
    },
  });
  if (!topup) throw new EnterpriseAccountingError("RETAIL_TELCO_TOPUP_NOT_POSTABLE", 409);

  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: [topup.tenderFinancialAccountId, topup.operatorFloatAccountId] },
      status: "ACTIVE",
      archivedAt: null,
    },
    select: {
      id: true,
      ledgerAccountId: true,
      accountType: true,
      currencyCode: true,
    },
  });
  const tender = accounts.find((account) => account.id === topup.tenderFinancialAccountId);
  const operatorFloat = accounts.find((account) => account.id === topup.operatorFloatAccountId);
  if (
    !tender
    || !operatorFloat
    || !["CASH", "MOBILE_MONEY", "BANK", "CLEARING"].includes(tender.accountType)
    || !["MOBILE_MONEY", "CLEARING"].includes(operatorFloat.accountType)
    || tender.currencyCode !== topup.currencyCode
    || operatorFloat.currencyCode !== topup.currencyCode
  ) {
    throw new EnterpriseAccountingError("RETAIL_TELCO_TOPUP_FINANCIAL_ACCOUNTS_INVALID", 409);
  }

  const expectedMargin = topup.saleAmount.minus(topup.operatorCost);
  if (expectedMargin.isNegative() || !expectedMargin.equals(topup.marginAmount)) {
    throw new EnterpriseAccountingError("RETAIL_TELCO_TOPUP_MARGIN_INVALID", 409);
  }
  return { topup, tender, operatorFloat };
}

function journalTypeForTender(accountType: string) {
  if (accountType === "CASH") return "CASH" as const;
  if (accountType === "MOBILE_MONEY") return "MOBILE_MONEY" as const;
  return "BANK" as const;
}

function buildTelcoLines(
  source: Awaited<ReturnType<typeof loadTelcoTopup>>,
  reverse: boolean,
): PostingLineDraft[] {
  const lines: PostingLineDraft[] = reverse
    ? [
        {
          accountMappingKey: `ACCOUNT_ID:${source.operatorFloat.ledgerAccountId}`,
          description: `Telco float reversal ${source.topup.number}`,
          debit: source.topup.operatorCost,
          transactionCurrencyCode: source.topup.currencyCode,
          transactionAmount: source.topup.operatorCost,
        },
        {
          accountMappingKey: `ACCOUNT_ID:${source.tender.ledgerAccountId}`,
          description: `Telco tender reversal ${source.topup.number}`,
          credit: source.topup.saleAmount,
          transactionCurrencyCode: source.topup.currencyCode,
          transactionAmount: source.topup.saleAmount,
        },
      ]
    : [
        {
          accountMappingKey: `ACCOUNT_ID:${source.tender.ledgerAccountId}`,
          description: `Telco tender ${source.topup.number}`,
          debit: source.topup.saleAmount,
          transactionCurrencyCode: source.topup.currencyCode,
          transactionAmount: source.topup.saleAmount,
        },
        {
          accountMappingKey: `ACCOUNT_ID:${source.operatorFloat.ledgerAccountId}`,
          description: `Telco operator float ${source.topup.number}`,
          credit: source.topup.operatorCost,
          transactionCurrencyCode: source.topup.currencyCode,
          transactionAmount: source.topup.operatorCost,
        },
      ];

  if (source.topup.marginAmount.gt(0)) {
    lines.push({
      accountMappingKey: "SERVICE_REVENUE",
      description: `${reverse ? "Telco margin reversal" : "Telco service margin"} ${source.topup.number}`,
      ...(reverse ? { debit: source.topup.marginAmount } : { credit: source.topup.marginAmount }),
      transactionCurrencyCode: source.topup.currencyCode,
      transactionAmount: source.topup.marginAmount,
    });
  }
  return lines;
}

export const buildRetailTelcoTopupPosting: PostingBuilder = async (tx, input) => {
  const source = await loadTelcoTopup(tx, input, ["SUCCESS", "REVERSED"]);
  return {
    organizationId: input.organizationId,
    journalType: journalTypeForTender(source.tender.accountType),
    accountingDate: source.topup.occurredAt,
    documentDate: source.topup.occurredAt,
    reference: source.topup.number,
    description: `Telco top-up ${source.topup.number}`,
    sourceModule: "TELCO_TOPUPS",
    sourceEntityType: "EnterpriseTelcoTopup",
    sourceEntityId: source.topup.id,
    currencyCode: source.topup.currencyCode,
    lines: buildTelcoLines(source, false),
  };
};

export const buildRetailTelcoTopupReversalPosting: PostingBuilder = async (tx, input) => {
  const source = await loadTelcoTopup(tx, input, ["REVERSED"]);
  const reversalDate = source.topup.reversedAt || source.topup.updatedAt;
  return {
    organizationId: input.organizationId,
    journalType: journalTypeForTender(source.tender.accountType),
    accountingDate: reversalDate,
    documentDate: reversalDate,
    reference: `${source.topup.number}-REV`,
    description: `Telco top-up reversal ${source.topup.number}`,
    sourceModule: "TELCO_TOPUPS",
    sourceEntityType: "EnterpriseTelcoTopup",
    sourceEntityId: source.topup.id,
    currencyCode: source.topup.currencyCode,
    lines: buildTelcoLines(source, true),
  };
};
