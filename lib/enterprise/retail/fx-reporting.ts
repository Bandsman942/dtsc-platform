import { Prisma } from "@prisma/client";
import { resolveExchangeRateDetails } from "@/lib/enterprise/accounting/currency";
import { prisma } from "@/lib/prisma";

type RateRow = {
  id: string;
  sourceCurrencyCode: string;
  targetCurrencyCode: string;
  rateDate: Date;
  rate: Prisma.Decimal;
  source: string;
  createdAt: Date;
};

type MissingRate = { sourceCurrencyCode: string; targetCurrencyCode: string; at: string; count: number };
type RateUsed = { rateId: string; pair: string; rate: string; rateDate: string; source: string; direction: "DIRECT" | "INVERSE" };

function pairKey(source: string, target: string) {
  return `${source.toUpperCase()}->${target.toUpperCase()}`;
}

function makeTimeline(rates: RateRow[]) {
  const timeline = new Map<string, RateRow[]>();
  for (const rate of rates) {
    const key = pairKey(rate.sourceCurrencyCode, rate.targetCurrencyCode);
    const list = timeline.get(key) || [];
    list.push(rate);
    timeline.set(key, list);
  }
  for (const list of timeline.values()) {
    list.sort((a, b) => b.rateDate.getTime() - a.rateDate.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  }
  return timeline;
}

function resolveFromTimeline(timeline: Map<string, RateRow[]>, source: string, target: string, at: Date) {
  const normalizedSource = source.toUpperCase();
  const normalizedTarget = target.toUpperCase();
  if (normalizedSource === normalizedTarget) return { rate: new Prisma.Decimal(1), rateRow: null, direction: "DIRECT" as const };
  const direct = (timeline.get(pairKey(normalizedSource, normalizedTarget)) || []).find((item) => item.rateDate <= at);
  if (direct && direct.rate.gt(0)) return { rate: direct.rate, rateRow: direct, direction: "DIRECT" as const };
  const inverse = (timeline.get(pairKey(normalizedTarget, normalizedSource)) || []).find((item) => item.rateDate <= at);
  if (inverse && inverse.rate.gt(0)) return { rate: new Prisma.Decimal(1).div(inverse.rate), rateRow: inverse, direction: "INVERSE" as const };
  return null;
}

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value || 0);
}

export async function getRetailExchangeRateReadiness(organizationId: string, at = new Date()) {
  const [configuration, accounts] = await Promise.all([
    prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { functionalCurrencyCode: true, presentationCurrencyCode: true } }),
    prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, distinct: ["currencyCode"], select: { currencyCode: true } }),
  ]);
  if (!configuration) return { complete: false, targetCurrencyCode: null, missingCurrencies: accounts.map((item) => item.currencyCode), reason: "FINANCE_CONFIGURATION_REQUIRED" };
  const targetCurrencyCode = configuration.presentationCurrencyCode || configuration.functionalCurrencyCode;
  const sourceCurrencies = Array.from(new Set(accounts.map((item) => item.currencyCode).filter((code) => code !== targetCurrencyCode)));
  const missingCurrencies: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const sourceCurrencyCode of sourceCurrencies) {
      try {
        await resolveExchangeRateDetails(tx, { organizationId, sourceCurrencyCode, targetCurrencyCode, rateDate: at });
      } catch {
        missingCurrencies.push(sourceCurrencyCode);
      }
    }
  });
  return { complete: missingCurrencies.length === 0, targetCurrencyCode, missingCurrencies, reason: missingCurrencies.length ? "FINANCE_EXCHANGE_RATE_REQUIRED" : null };
}

export async function getRetailFunctionalCurrencySummary(organizationId: string, from: Date, to: Date) {
  const configuration = await prisma.enterpriseFinanceConfiguration.findUnique({
    where: { organizationId },
    select: { functionalCurrencyCode: true, presentationCurrencyCode: true },
  });
  if (!configuration) {
    return { available: false, complete: false, targetCurrencyCode: null, reason: "FINANCE_CONFIGURATION_REQUIRED", missingRates: [], ratesUsed: [], metrics: null };
  }
  const targetCurrencyCode = configuration.presentationCurrencyCode || configuration.functionalCurrencyCode;
  const dateFilter = { gte: from, lte: to };
  const [sales, mobileMoney, topups] = await Promise.all([
    prisma.enterpriseRetailSale.findMany({
      where: { organizationId, status: "COMPLETED", soldAt: dateFilter },
      select: { id: true, currencyCode: true, grandTotal: true, soldAt: true },
    }),
    prisma.enterpriseMobileMoneyTransaction.findMany({
      where: { organizationId, status: "CONFIRMED", occurredAt: dateFilter },
      select: { id: true, currencyCode: true, transactionType: true, principalAmount: true, providerCommissionAmount: true, occurredAt: true },
    }),
    prisma.enterpriseTelcoTopup.findMany({
      where: { organizationId, status: "SUCCESS", occurredAt: dateFilter },
      select: { id: true, currencyCode: true, saleAmount: true, marginAmount: true, occurredAt: true },
    }),
  ]);

  const currencies = Array.from(new Set([
    ...sales.map((item) => item.currencyCode),
    ...mobileMoney.map((item) => item.currencyCode),
    ...topups.map((item) => item.currencyCode),
  ].filter((code) => code !== targetCurrencyCode)));
  const pairClauses = currencies.flatMap((currency) => [
    { sourceCurrencyCode: currency, targetCurrencyCode },
    { sourceCurrencyCode: targetCurrencyCode, targetCurrencyCode: currency },
  ]);
  const rates = pairClauses.length ? await prisma.enterpriseExchangeRate.findMany({
    where: { organizationId, status: "ACTIVE", rateDate: { lte: to }, OR: pairClauses },
    orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, sourceCurrencyCode: true, targetCurrencyCode: true, rateDate: true, rate: true, source: true, createdAt: true },
  }) : [];
  const timeline = makeTimeline(rates);
  const missing = new Map<string, MissingRate>();
  const used = new Map<string, RateUsed>();

  function convert(amount: Prisma.Decimal.Value, currencyCode: string, at: Date) {
    const resolved = resolveFromTimeline(timeline, currencyCode, targetCurrencyCode, at);
    if (!resolved) {
      const key = `${pairKey(currencyCode, targetCurrencyCode)}@${at.toISOString().slice(0, 10)}`;
      const current = missing.get(key);
      missing.set(key, current ? { ...current, count: current.count + 1 } : { sourceCurrencyCode: currencyCode, targetCurrencyCode, at: at.toISOString(), count: 1 });
      return null;
    }
    if (resolved.rateRow) {
      const rateKey = `${resolved.rateRow.id}:${resolved.direction}`;
      used.set(rateKey, {
        rateId: resolved.rateRow.id,
        pair: `${currencyCode}/${targetCurrencyCode}`,
        rate: resolved.rate.toFixed(12),
        rateDate: resolved.rateRow.rateDate.toISOString(),
        source: resolved.rateRow.source,
        direction: resolved.direction,
      });
    }
    return decimal(amount).times(resolved.rate);
  }

  let salesAmount = new Prisma.Decimal(0);
  let deposits = new Prisma.Decimal(0);
  let withdrawals = new Prisma.Decimal(0);
  let commission = new Prisma.Decimal(0);
  let telcoRevenue = new Prisma.Decimal(0);
  let telcoMargin = new Prisma.Decimal(0);

  for (const sale of sales) {
    const converted = convert(sale.grandTotal, sale.currencyCode, sale.soldAt);
    if (converted) salesAmount = salesAmount.plus(converted);
  }
  for (const operation of mobileMoney) {
    const principal = convert(operation.principalAmount, operation.currencyCode, operation.occurredAt);
    const convertedCommission = convert(operation.providerCommissionAmount, operation.currencyCode, operation.occurredAt);
    if (principal) {
      if (operation.transactionType === "DEPOSIT") deposits = deposits.plus(principal);
      if (operation.transactionType === "WITHDRAWAL") withdrawals = withdrawals.plus(principal);
    }
    if (convertedCommission) commission = commission.plus(convertedCommission);
  }
  for (const topup of topups) {
    const revenue = convert(topup.saleAmount, topup.currencyCode, topup.occurredAt);
    const margin = convert(topup.marginAmount, topup.currencyCode, topup.occurredAt);
    if (revenue) telcoRevenue = telcoRevenue.plus(revenue);
    if (margin) telcoMargin = telcoMargin.plus(margin);
  }

  const missingRates = Array.from(missing.values());
  const complete = missingRates.length === 0;
  return {
    available: true,
    complete,
    targetCurrencyCode,
    reason: complete ? null : "FINANCE_EXCHANGE_RATE_REQUIRED",
    missingRates,
    ratesUsed: Array.from(used.values()),
    metrics: complete ? {
      sales: { count: sales.length, amount: salesAmount.toFixed(2) },
      mobileMoney: { count: mobileMoney.length, deposits: deposits.toFixed(2), withdrawals: withdrawals.toFixed(2), commission: commission.toFixed(2) },
      telco: { count: topups.length, revenue: telcoRevenue.toFixed(2), margin: telcoMargin.toFixed(2) },
    } : null,
  };
}
