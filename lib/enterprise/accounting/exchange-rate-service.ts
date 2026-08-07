import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { prisma } from "@/lib/prisma";
import type { exchangeRateCreateSchema } from "@/lib/enterprise/accounting/exchange-rate-schemas";
import type { z } from "zod";

type ExchangeRateCreateInput = z.infer<typeof exchangeRateCreateSchema>;

export async function getEnterpriseExchangeRateConfiguration(organizationId: string) {
  const [configuration, rates, currencies, accountCurrencies] = await Promise.all([
    prisma.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true, presentationCurrencyCode: true, readinessStatus: true },
    }),
    prisma.enterpriseExchangeRate.findMany({
      where: { organizationId },
      orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
      take: 250,
      select: {
        id: true,
        sourceCurrencyCode: true,
        targetCurrencyCode: true,
        rateDate: true,
        source: true,
        rate: true,
        precision: true,
        status: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.enterpriseCurrency.findMany({
      where: { isActive: true, OR: [{ organizationId }, { organizationId: null }] },
      orderBy: { code: "asc" },
      select: { code: true, name: true, symbol: true, precision: true },
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      distinct: ["currencyCode"],
      select: { currencyCode: true },
    }),
  ]);

  const knownCodes = new Set<string>();
  for (const currency of currencies) knownCodes.add(currency.code);
  for (const account of accountCurrencies) knownCodes.add(account.currencyCode);
  if (configuration?.functionalCurrencyCode) knownCodes.add(configuration.functionalCurrencyCode);
  if (configuration?.presentationCurrencyCode) knownCodes.add(configuration.presentationCurrencyCode);
  for (const rate of rates) {
    knownCodes.add(rate.sourceCurrencyCode);
    knownCodes.add(rate.targetCurrencyCode);
  }

  const currencyMeta = new Map(currencies.map((currency) => [currency.code, currency]));
  return {
    configuration,
    currencies: Array.from(knownCodes).sort().map((code) => ({
      code,
      name: currencyMeta.get(code)?.name || code,
      symbol: currencyMeta.get(code)?.symbol || null,
      precision: currencyMeta.get(code)?.precision ?? 2,
    })),
    rates,
  };
}

export async function createEnterpriseExchangeRate(organizationId: string, userId: string, input: ExchangeRateCreateInput) {
  return prisma.$transaction(async (tx) => {
    const sourceCurrencyCode = input.sourceCurrencyCode.toUpperCase();
    const targetCurrencyCode = input.targetCurrencyCode.toUpperCase();
    if (sourceCurrencyCode === targetCurrencyCode) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_PAIR_INVALID", 400);
    const rate = new Prisma.Decimal(input.rate);
    if (rate.lte(0)) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_INVALID", 400);

    const conflicting = await tx.enterpriseExchangeRate.findFirst({
      where: {
        organizationId,
        sourceCurrencyCode,
        targetCurrencyCode,
        rateDate: input.rateDate,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (conflicting) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_ACTIVE_VERSION_EXISTS", 409, { rateId: conflicting.id });

    return tx.enterpriseExchangeRate.create({
      data: {
        organizationId,
        sourceCurrencyCode,
        targetCurrencyCode,
        rateDate: input.rateDate,
        source: input.source,
        rate,
        precision: input.precision,
        status: "ACTIVE",
        createdByUserId: userId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deactivateEnterpriseExchangeRate(organizationId: string, rateId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseExchangeRate.findFirst({
      where: { organizationId, id: rateId },
    });
    if (!existing) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_NOT_FOUND", 404);
    if (existing.status === "INACTIVE") return { rate: existing, idempotent: true };

    const updated = await tx.enterpriseExchangeRate.updateMany({
      where: { organizationId, id: rateId, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
    if (updated.count !== 1) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_CONFLICT", 409);
    const rate = await tx.enterpriseExchangeRate.findUnique({ where: { id: rateId } });
    if (!rate) throw new EnterpriseAccountingError("FINANCE_EXCHANGE_RATE_NOT_FOUND", 404);
    return { rate, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
