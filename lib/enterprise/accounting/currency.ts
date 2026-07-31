import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money } from "@/lib/enterprise/accounting/helpers";

export async function getFinanceConfiguration(tx: Prisma.TransactionClient, organizationId: string) {
  const configuration = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
  return configuration;
}

export async function resolveExchangeRate(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceCurrencyCode: string;
    targetCurrencyCode: string;
    rateDate: Date;
  },
) {
  if (input.sourceCurrencyCode === input.targetCurrencyCode) return new Prisma.Decimal(1);
  const rate = await tx.enterpriseExchangeRate.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceCurrencyCode: input.sourceCurrencyCode,
      targetCurrencyCode: input.targetCurrencyCode,
      rateDate: { lte: input.rateDate },
      status: "ACTIVE",
    },
    orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
  });
  if (!rate) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_REQUIRED", 409, input);
  return rate.rate;
}

export async function snapshotExchangeRate(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    sourceCurrencyCode: string;
    targetCurrencyCode: string;
    rateDate: Date;
    rate: Prisma.Decimal;
    source: string;
  },
) {
  return tx.enterpriseExchangeRateSnapshot.upsert({
    where: {
      organizationId_sourceEntityType_sourceEntityId_sourceCurrencyCode_targetCurrencyCode: {
        organizationId: input.organizationId,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        sourceCurrencyCode: input.sourceCurrencyCode,
        targetCurrencyCode: input.targetCurrencyCode,
      },
    },
    update: {},
    create: input,
  });
}

export async function convertToFunctionalCurrency(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    currencyCode: string;
    amount: Prisma.Decimal.Value;
    accountingDate: Date;
  },
) {
  const configuration = await getFinanceConfiguration(tx, input.organizationId);
  const rate = await resolveExchangeRate(tx, {
    organizationId: input.organizationId,
    sourceCurrencyCode: input.currencyCode,
    targetCurrencyCode: configuration.functionalCurrencyCode,
    rateDate: input.accountingDate,
  });
  await snapshotExchangeRate(tx, {
    organizationId: input.organizationId,
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    sourceCurrencyCode: input.currencyCode,
    targetCurrencyCode: configuration.functionalCurrencyCode,
    rateDate: input.accountingDate,
    rate,
    source: input.currencyCode === configuration.functionalCurrencyCode ? "FUNCTIONAL" : "ENTERPRISE_RATE",
  });
  return {
    functionalCurrencyCode: configuration.functionalCurrencyCode,
    exchangeRate: rate,
    functionalAmount: money(new Prisma.Decimal(input.amount).times(rate)),
  };
}

export async function assertFunctionalCurrencyMutable(tx: Prisma.TransactionClient, organizationId: string) {
  const postedCount = await tx.enterpriseJournalEntry.count({ where: { organizationId, status: "POSTED" } });
  if (postedCount > 0) throw new EnterpriseAccountingError("FINANCE_FUNCTIONAL_CURRENCY_LOCKED", 409);
}
