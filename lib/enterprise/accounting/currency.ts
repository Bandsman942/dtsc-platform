import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money } from "@/lib/enterprise/accounting/helpers";

export type EnterpriseExchangeRateResolution = {
  rate: Prisma.Decimal;
  rateId: string | null;
  rateDate: Date;
  source: string;
  direction: "IDENTITY" | "DIRECT" | "INVERSE";
  sourceCurrencyCode: string;
  targetCurrencyCode: string;
};

export async function getFinanceConfiguration(tx: Prisma.TransactionClient, organizationId: string) {
  const configuration = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
  return configuration;
}

export async function resolveExchangeRateDetails(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceCurrencyCode: string;
    targetCurrencyCode: string;
    rateDate: Date;
  },
): Promise<EnterpriseExchangeRateResolution> {
  const sourceCurrencyCode = input.sourceCurrencyCode.trim().toUpperCase();
  const targetCurrencyCode = input.targetCurrencyCode.trim().toUpperCase();
  if (sourceCurrencyCode === targetCurrencyCode) {
    return {
      rate: new Prisma.Decimal(1),
      rateId: null,
      rateDate: input.rateDate,
      source: "IDENTITY",
      direction: "IDENTITY",
      sourceCurrencyCode,
      targetCurrencyCode,
    };
  }

  const direct = await tx.enterpriseExchangeRate.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceCurrencyCode,
      targetCurrencyCode,
      rateDate: { lte: input.rateDate },
      status: "ACTIVE",
    },
    orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
  });
  if (direct) {
    if (direct.rate.lte(0)) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_INVALID", 409, { rateId: direct.id });
    return {
      rate: direct.rate,
      rateId: direct.id,
      rateDate: direct.rateDate,
      source: direct.source,
      direction: "DIRECT",
      sourceCurrencyCode,
      targetCurrencyCode,
    };
  }

  const inverse = await tx.enterpriseExchangeRate.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceCurrencyCode: targetCurrencyCode,
      targetCurrencyCode: sourceCurrencyCode,
      rateDate: { lte: input.rateDate },
      status: "ACTIVE",
    },
    orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
  });
  if (!inverse) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_REQUIRED", 409, { ...input, sourceCurrencyCode, targetCurrencyCode });
  if (inverse.rate.lte(0)) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_INVALID", 409, { rateId: inverse.id });

  return {
    rate: new Prisma.Decimal(1).div(inverse.rate),
    rateId: inverse.id,
    rateDate: inverse.rateDate,
    source: inverse.source,
    direction: "INVERSE",
    sourceCurrencyCode,
    targetCurrencyCode,
  };
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
  return (await resolveExchangeRateDetails(tx, input)).rate;
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
  const resolution = await resolveExchangeRateDetails(tx, {
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
    rateDate: resolution.rateDate,
    rate: resolution.rate,
    source: resolution.direction === "IDENTITY" ? "FUNCTIONAL" : `ENTERPRISE_RATE:${resolution.direction}:${resolution.rateId || "NONE"}:${resolution.source}`,
  });
  return {
    functionalCurrencyCode: configuration.functionalCurrencyCode,
    exchangeRate: resolution.rate,
    functionalAmount: money(new Prisma.Decimal(input.amount).times(resolution.rate)),
  };
}

export async function assertFunctionalCurrencyMutable(tx: Prisma.TransactionClient, organizationId: string) {
  const postedCount = await tx.enterpriseJournalEntry.count({ where: { organizationId, status: "POSTED" } });
  if (postedCount > 0) throw new EnterpriseAccountingError("FINANCE_FUNCTIONAL_CURRENCY_LOCKED", 409);
}
