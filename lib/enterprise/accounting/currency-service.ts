import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization } from "@/lib/enterprise/accounting/helpers";
import { currencyChoices } from "@/lib/forms/reference-catalog";
import { prisma } from "@/lib/prisma";

export type EnterpriseCurrencyScope = "GLOBAL" | "ORGANIZATION";

export type EffectiveEnterpriseCurrency = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  precision: number;
  roundingMode: string;
  isActive: boolean;
  scope: EnterpriseCurrencyScope;
  canManage: boolean;
  isInUse: boolean;
};

type CurrencyWriteInput = {
  code: string;
  name: string;
  symbol?: string | null;
  precision: number;
  roundingMode: string;
};

type CurrencyUpdateInput = Partial<Omit<CurrencyWriteInput, "code">> & { isActive?: boolean };

type BuiltInCurrency = {
  code: string;
  name: string;
};

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function stripCurrencyCode(label: string, code: string) {
  return label.replace(new RegExp(`\\s*\\(${code}\\)\\s*$`, "i"), "").trim() || code;
}

// Reuse the repository's controlled currency catalogue as the immutable DTSC baseline.
// Persisted global rows can override its metadata/status, and organization rows override both.
const BUILT_IN_CURRENCIES: readonly BuiltInCurrency[] = Object.freeze(
  currencyChoices("fr").map((choice) => ({
    code: normalizeCode(choice.id),
    name: stripCurrencyCode(choice.label, normalizeCode(choice.id)),
  })),
);
const BUILT_IN_CURRENCY_CODES = new Set(BUILT_IN_CURRENCIES.map((currency) => currency.code));

function currencyMatchesSearch(currency: EffectiveEnterpriseCurrency, search?: string) {
  const query = search?.trim().toLocaleLowerCase();
  if (!query) return true;
  return [currency.code, currency.name, currency.symbol || ""].some((value) => value.toLocaleLowerCase().includes(query));
}

async function getCurrencyUsage(organizationId: string) {
  const [configuration, accounts, rates] = await Promise.all([
    prisma.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true, presentationCurrencyCode: true },
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      distinct: ["currencyCode"],
      select: { currencyCode: true },
    }),
    prisma.enterpriseExchangeRate.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { sourceCurrencyCode: true, targetCurrencyCode: true },
      take: 1000,
    }),
  ]);
  const used = new Set<string>();
  if (configuration?.functionalCurrencyCode) used.add(normalizeCode(configuration.functionalCurrencyCode));
  if (configuration?.presentationCurrencyCode) used.add(normalizeCode(configuration.presentationCurrencyCode));
  for (const account of accounts) used.add(normalizeCode(account.currencyCode));
  for (const rate of rates) {
    used.add(normalizeCode(rate.sourceCurrencyCode));
    used.add(normalizeCode(rate.targetCurrencyCode));
  }
  return used;
}

export async function listEnterpriseCurrencies(
  organizationId: string,
  options: { includeInactive?: boolean; search?: string } = {},
): Promise<EffectiveEnterpriseCurrency[]> {
  const [rows, usedCodes] = await Promise.all([
    prisma.enterpriseCurrency.findMany({
      where: { OR: [{ organizationId: null }, { organizationId }] },
      orderBy: [{ code: "asc" }, { createdAt: "asc" }],
      take: 500,
      select: {
        id: true,
        organizationId: true,
        code: true,
        name: true,
        symbol: true,
        precision: true,
        roundingMode: true,
        isActive: true,
      },
    }),
    getCurrencyUsage(organizationId),
  ]);

  const resolved = new Map<string, EffectiveEnterpriseCurrency>();
  for (const currency of BUILT_IN_CURRENCIES) {
    resolved.set(currency.code, {
      id: `builtin:${currency.code}`,
      code: currency.code,
      name: currency.name,
      symbol: null,
      precision: 2,
      roundingMode: "HALF_UP",
      isActive: true,
      scope: "GLOBAL",
      canManage: false,
      isInUse: usedCodes.has(currency.code),
    });
  }
  for (const row of rows.filter((item) => item.organizationId === null)) {
    const code = normalizeCode(row.code);
    resolved.set(code, {
      id: row.id,
      code,
      name: row.name,
      symbol: row.symbol,
      precision: row.precision,
      roundingMode: row.roundingMode,
      isActive: row.isActive,
      scope: "GLOBAL",
      canManage: false,
      isInUse: usedCodes.has(code),
    });
  }
  for (const row of rows.filter((item) => item.organizationId === organizationId)) {
    const code = normalizeCode(row.code);
    resolved.set(code, {
      id: row.id,
      code,
      name: row.name,
      symbol: row.symbol,
      precision: row.precision,
      roundingMode: row.roundingMode,
      isActive: row.isActive,
      scope: "ORGANIZATION",
      canManage: true,
      isInUse: usedCodes.has(code),
    });
  }

  return [...resolved.values()]
    .filter((currency) => options.includeInactive || currency.isActive)
    .filter((currency) => currencyMatchesSearch(currency, options.search))
    .sort((left, right) => left.code.localeCompare(right.code));
}

export async function assertEnterpriseCurrencyActiveTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  currencyCode: string,
) {
  const code = normalizeCode(currencyCode);
  const organizationCurrency = await tx.enterpriseCurrency.findFirst({
    where: { organizationId, code },
    select: { id: true, isActive: true },
  });
  if (organizationCurrency) {
    if (!organizationCurrency.isActive) throw new EnterpriseAccountingError("FINANCE_CURRENCY_INACTIVE", 409, { currencyCode: code });
    return;
  }
  const globalCurrency = await tx.enterpriseCurrency.findFirst({
    where: { organizationId: null, code },
    select: { id: true, isActive: true },
  });
  if (globalCurrency) {
    if (!globalCurrency.isActive) throw new EnterpriseAccountingError("FINANCE_CURRENCY_INACTIVE", 409, { currencyCode: code });
    return;
  }
  if (BUILT_IN_CURRENCY_CODES.has(code)) return;
  throw new EnterpriseAccountingError("FINANCE_CURRENCY_NOT_CONFIGURED", 409, { currencyCode: code });
}

export async function createEnterpriseCurrency(
  organizationId: string,
  input: CurrencyWriteInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const code = normalizeCode(input.code);
    const existing = await tx.enterpriseCurrency.findFirst({ where: { organizationId, code }, select: { id: true } });
    if (existing) throw new EnterpriseAccountingError("FINANCE_CURRENCY_DUPLICATE", 409, { currencyCode: code });
    return tx.enterpriseCurrency.create({
      data: {
        organizationId,
        code,
        name: input.name.trim(),
        symbol: input.symbol?.trim() || null,
        precision: input.precision,
        roundingMode: input.roundingMode,
        isActive: true,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function assertCurrencyCanDeactivateTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  code: string,
) {
  const [configuration, accountCount, rateCount] = await Promise.all([
    tx.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true, presentationCurrencyCode: true },
    }),
    tx.enterpriseFinancialAccount.count({
      where: { organizationId, currencyCode: code, status: "ACTIVE", archivedAt: null },
    }),
    tx.enterpriseExchangeRate.count({
      where: {
        organizationId,
        status: "ACTIVE",
        OR: [{ sourceCurrencyCode: code }, { targetCurrencyCode: code }],
      },
    }),
  ]);
  if (
    configuration?.functionalCurrencyCode === code
    || configuration?.presentationCurrencyCode === code
    || accountCount > 0
    || rateCount > 0
  ) {
    throw new EnterpriseAccountingError("FINANCE_CURRENCY_IN_USE", 409, {
      currencyCode: code,
      functional: configuration?.functionalCurrencyCode === code,
      presentation: configuration?.presentationCurrencyCode === code,
      activeFinancialAccounts: accountCount,
      activeExchangeRates: rateCount,
    });
  }
}

export async function updateEnterpriseCurrency(
  organizationId: string,
  currencyId: string,
  input: CurrencyUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const existing = await tx.enterpriseCurrency.findFirst({ where: { id: currencyId, organizationId } });
    if (!existing) throw new EnterpriseAccountingError("FINANCE_CURRENCY_NOT_FOUND", 404);
    if (input.isActive === false && existing.isActive) await assertCurrencyCanDeactivateTx(tx, organizationId, normalizeCode(existing.code));
    return tx.enterpriseCurrency.update({
      where: { id: existing.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.symbol === undefined ? {} : { symbol: input.symbol?.trim() || null }),
        ...(input.precision === undefined ? {} : { precision: input.precision }),
        ...(input.roundingMode === undefined ? {} : { roundingMode: input.roundingMode }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
