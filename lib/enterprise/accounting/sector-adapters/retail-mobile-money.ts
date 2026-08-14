import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { PostingBuilder, PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

function accountEffectLine(input: {
  ledgerAccountId: string;
  description: string;
  effect: Prisma.Decimal;
  currencyCode: string;
}): PostingLineDraft | null {
  if (input.effect.isZero()) return null;
  const amount = input.effect.abs();
  return {
    accountMappingKey: `ACCOUNT_ID:${input.ledgerAccountId}`,
    description: input.description,
    ...(input.effect.gt(0) ? { debit: amount } : { credit: amount }),
    transactionCurrencyCode: input.currencyCode,
    transactionAmount: amount,
  };
}

async function loadMobileMoneyTransaction(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityId: string },
  statuses: string[],
) {
  const transaction = await tx.enterpriseMobileMoneyTransaction.findFirst({
    where: { organizationId: input.organizationId, id: input.sourceEntityId, status: { in: statuses } },
  });
  if (!transaction) throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_NOT_POSTABLE", 409);
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: [transaction.cashAccountId, transaction.floatAccountId] },
      status: "ACTIVE",
      archivedAt: null,
    },
    select: { id: true, ledgerAccountId: true, currencyCode: true, accountType: true },
  });
  const cash = accounts.find((account) => account.id === transaction.cashAccountId);
  const float = accounts.find((account) => account.id === transaction.floatAccountId);
  if (!cash || !float || cash.accountType !== "CASH" || float.accountType !== "MOBILE_MONEY") {
    throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FINANCIAL_ACCOUNTS_INVALID", 409);
  }
  if (cash.currencyCode !== transaction.currencyCode || float.currencyCode !== transaction.currencyCode) {
    throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FINANCIAL_ACCOUNTS_INVALID", 409);
  }
  return { transaction, cash, float };
}

function buildMobileMoneyLines(
  source: Awaited<ReturnType<typeof loadMobileMoneyTransaction>>,
  multiplier: 1 | -1,
) {
  const cashEffect = source.transaction.cashEffectAmount.times(multiplier);
  const floatEffect = source.transaction.floatEffectAmount.times(multiplier);
  const lines = [
    accountEffectLine({
      ledgerAccountId: source.cash.ledgerAccountId,
      description: `${source.transaction.transactionType} cash ${source.transaction.number}`,
      effect: cashEffect,
      currencyCode: source.transaction.currencyCode,
    }),
    accountEffectLine({
      ledgerAccountId: source.float.ledgerAccountId,
      description: `${source.transaction.transactionType} operator float ${source.transaction.number}`,
      effect: floatEffect,
      currencyCode: source.transaction.currencyCode,
    }),
  ].filter((line): line is PostingLineDraft => Boolean(line));

  // The only intentional difference between cash and float effects in the current
  // Mobile Money contract is a customer fee collected in cash. Provider commission
  // remains a reported operational amount until the operator actually credits it.
  const netAssetEffect = cashEffect.plus(floatEffect);
  if (!netAssetEffect.isZero()) {
    const amount = netAssetEffect.abs();
    lines.push({
      accountMappingKey: "SERVICE_REVENUE",
      description: `${multiplier === 1 ? "Mobile Money service fee" : "Mobile Money service fee reversal"} ${source.transaction.number}`,
      ...(netAssetEffect.gt(0) ? { credit: amount } : { debit: amount }),
      transactionCurrencyCode: source.transaction.currencyCode,
      transactionAmount: amount,
    });
  }
  return lines;
}

export const buildRetailMobileMoneyPosting: PostingBuilder = async (tx, input) => {
  const source = await loadMobileMoneyTransaction(tx, input, ["CONFIRMED", "REVERSED"]);
  return {
    organizationId: input.organizationId,
    journalType: "MOBILE_MONEY",
    accountingDate: source.transaction.occurredAt,
    documentDate: source.transaction.occurredAt,
    reference: source.transaction.number,
    description: `Mobile Money ${source.transaction.transactionType.toLowerCase()} ${source.transaction.number}`,
    sourceModule: "MOBILE_MONEY_AGENCY",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: source.transaction.id,
    currencyCode: source.transaction.currencyCode,
    lines: buildMobileMoneyLines(source, 1),
  };
};

export const buildRetailMobileMoneyReversalPosting: PostingBuilder = async (tx, input) => {
  const source = await loadMobileMoneyTransaction(tx, input, ["REVERSED"]);
  const date = source.transaction.reversedAt || source.transaction.updatedAt;
  return {
    organizationId: input.organizationId,
    journalType: "MOBILE_MONEY",
    accountingDate: date,
    documentDate: date,
    reference: `${source.transaction.number}-REV`,
    description: `Mobile Money reversal ${source.transaction.number}`,
    sourceModule: "MOBILE_MONEY_AGENCY",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: source.transaction.id,
    currencyCode: source.transaction.currencyCode,
    lines: buildMobileMoneyLines(source, -1),
  };
};

async function loadFxTransfer(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sourceEntityId: string },
  statuses: string[],
) {
  const transfer = await tx.enterpriseMobileMoneyFxTransfer.findFirst({
    where: { organizationId: input.organizationId, id: input.sourceEntityId, status: { in: statuses } },
  });
  if (!transfer) throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FX_NOT_POSTABLE", 409);
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: [transfer.sourceFloatAccountId, transfer.targetFloatAccountId] },
      accountType: "MOBILE_MONEY",
      status: "ACTIVE",
      archivedAt: null,
    },
    select: { id: true, ledgerAccountId: true, currencyCode: true },
  });
  const source = accounts.find((account) => account.id === transfer.sourceFloatAccountId);
  const target = accounts.find((account) => account.id === transfer.targetFloatAccountId);
  if (!source || !target || source.currencyCode !== transfer.sourceCurrencyCode || target.currencyCode !== transfer.targetCurrencyCode) {
    throw new EnterpriseAccountingError("RETAIL_MOBILE_MONEY_FX_ACCOUNTS_INVALID", 409);
  }
  return { transfer, source, target };
}

function buildFxLines(source: Awaited<ReturnType<typeof loadFxTransfer>>, reverse: boolean): PostingLineDraft[] {
  const sourceAmount = source.transfer.sourceAmount;
  const targetAmount = source.transfer.targetAmount;
  return reverse
    ? [
        {
          accountMappingKey: `ACCOUNT_ID:${source.source.ledgerAccountId}`,
          description: `FX reversal in ${source.transfer.number}`,
          debit: sourceAmount,
          transactionCurrencyCode: source.transfer.sourceCurrencyCode,
          transactionAmount: sourceAmount,
        },
        {
          accountMappingKey: `ACCOUNT_ID:${source.target.ledgerAccountId}`,
          description: `FX reversal out ${source.transfer.number}`,
          credit: targetAmount,
          transactionCurrencyCode: source.transfer.targetCurrencyCode,
          transactionAmount: targetAmount,
        },
      ]
    : [
        {
          accountMappingKey: `ACCOUNT_ID:${source.target.ledgerAccountId}`,
          description: `Operator FX in ${source.transfer.number}`,
          debit: targetAmount,
          transactionCurrencyCode: source.transfer.targetCurrencyCode,
          transactionAmount: targetAmount,
        },
        {
          accountMappingKey: `ACCOUNT_ID:${source.source.ledgerAccountId}`,
          description: `Operator FX out ${source.transfer.number}`,
          credit: sourceAmount,
          transactionCurrencyCode: source.transfer.sourceCurrencyCode,
          transactionAmount: sourceAmount,
        },
      ];
}

export const buildRetailMobileMoneyFxPosting: PostingBuilder = async (tx, input) => {
  const source = await loadFxTransfer(tx, input, ["CONFIRMED", "REVERSED"]);
  return {
    organizationId: input.organizationId,
    journalType: "MOBILE_MONEY",
    accountingDate: source.transfer.occurredAt,
    documentDate: source.transfer.occurredAt,
    reference: source.transfer.number,
    description: `Mobile Money operator FX ${source.transfer.number}`,
    sourceModule: "MOBILE_MONEY_AGENCY",
    sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
    sourceEntityId: source.transfer.id,
    currencyCode: source.transfer.sourceCurrencyCode,
    lines: buildFxLines(source, false),
  };
};

export const buildRetailMobileMoneyFxReversalPosting: PostingBuilder = async (tx, input) => {
  const source = await loadFxTransfer(tx, input, ["REVERSED"]);
  const date = source.transfer.reversedAt || source.transfer.updatedAt;
  return {
    organizationId: input.organizationId,
    journalType: "MOBILE_MONEY",
    accountingDate: date,
    documentDate: date,
    reference: `${source.transfer.number}-REV`,
    description: `Mobile Money operator FX reversal ${source.transfer.number}`,
    sourceModule: "MOBILE_MONEY_AGENCY",
    sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
    sourceEntityId: source.transfer.id,
    currencyCode: source.transfer.sourceCurrencyCode,
    lines: buildFxLines(source, true),
  };
};
