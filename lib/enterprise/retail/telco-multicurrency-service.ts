import { Prisma } from "@prisma/client";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { isRetailOperatorCurrencyReady, requiredRetailOperatorCurrencies } from "@/lib/enterprise/retail/operator-currency-policy";
import { prisma } from "@/lib/prisma";

export const TELCO_FLOAT_ACCOUNT_USE = "TELCO_FLOAT";

async function assertTelcoProviderTx(tx: Prisma.TransactionClient, organizationId: string, providerCode: string) {
  const provider = await tx.enterpriseRetailProvider.findFirst({
    where: { organizationId, providerCode, providerType: { in: ["TELCO", "BOTH"] }, isActive: true },
  });
  if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode });
  return provider;
}

async function assertTelcoFloatAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  financialAccountId: string,
  currencyCode?: string,
) {
  const account = await tx.enterpriseFinancialAccount.findFirst({
    where: {
      organizationId,
      id: financialAccountId,
      accountType: { in: ["MOBILE_MONEY", "CLEARING"] },
      status: "ACTIVE",
      archivedAt: null,
      ...(currencyCode ? { currencyCode } : {}),
    },
  });
  if (!account) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { financialAccountId, currencyCode });
  return account;
}

export async function resolveTelcoFloatAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  provider: { id: string; providerCode: string; telcoFloatAccountId: string | null },
  currencyCode: string,
) {
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  const mapping = await tx.enterpriseRetailProviderAccount.findUnique({
    where: {
      organizationId_providerId_accountUse_currencyCode: {
        organizationId,
        providerId: provider.id,
        accountUse: TELCO_FLOAT_ACCOUNT_USE,
        currencyCode: normalizedCurrency,
      },
    },
  });
  if (mapping?.isActive) {
    const account = await assertTelcoFloatAccountTx(tx, organizationId, mapping.financialAccountId, normalizedCurrency);
    return { mapping, account, legacyFallback: false };
  }

  // Compatibility window only. New Telco operations never choose this field when a canonical mapping exists.
  if (provider.telcoFloatAccountId) {
    const legacy = await tx.enterpriseFinancialAccount.findFirst({
      where: {
        organizationId,
        id: provider.telcoFloatAccountId,
        accountType: { in: ["MOBILE_MONEY", "CLEARING"] },
        currencyCode: normalizedCurrency,
        status: "ACTIVE",
        archivedAt: null,
      },
    });
    if (legacy) return { mapping: null, account: legacy, legacyFallback: true };
  }

  throw new EnterpriseRetailError("RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED", 409, {
    providerCode: provider.providerCode,
    currencyCode: normalizedCurrency,
  });
}

export async function getTelcoProviderAccountConfiguration(organizationId: string) {
  const [organization, providers, mappings, financialAccounts, financeConfiguration] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { country: true } }),
    prisma.enterpriseRetailProvider.findMany({
      where: { organizationId, providerType: { in: ["TELCO", "BOTH"] }, isActive: true },
      orderBy: { label: "asc" },
    }),
    prisma.enterpriseRetailProviderAccount.findMany({
      where: { organizationId, accountUse: TELCO_FLOAT_ACCOUNT_USE, isActive: true },
      orderBy: [{ providerCode: "asc" }, { currencyCode: "asc" }],
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, accountType: { in: ["MOBILE_MONEY", "CLEARING"] }, status: "ACTIVE", archivedAt: null },
      orderBy: [{ currencyCode: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true, ledgerAccountId: true },
    }),
    prisma.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true, presentationCurrencyCode: true },
    }),
  ]);
  if (!organization) throw new EnterpriseRetailError("RETAIL_ORGANIZATION_NOT_FOUND", 404);

  const accountById = new Map(financialAccounts.map((account) => [account.id, account]));
  const requiredCurrencies = requiredRetailOperatorCurrencies(organization.country);
  const availableCurrencies = Array.from(new Set([
    ...requiredCurrencies,
    ...financialAccounts.map((account) => account.currencyCode),
    ...(financeConfiguration?.functionalCurrencyCode ? [financeConfiguration.functionalCurrencyCode] : []),
    ...(financeConfiguration?.presentationCurrencyCode ? [financeConfiguration.presentationCurrencyCode] : []),
  ])).sort();

  const mappedProviders = providers.map((provider) => {
    const providerMappings = mappings
      .filter((mapping) => mapping.providerId === provider.id)
      .map((mapping) => ({ ...mapping, financialAccount: accountById.get(mapping.financialAccountId) || null }))
      .filter((mapping) => Boolean(mapping.financialAccount));
    const mappedCurrencies = new Set(providerMappings.map((mapping) => mapping.currencyCode));
    return {
      id: provider.id,
      providerCode: provider.providerCode,
      label: provider.label,
      providerType: provider.providerType,
      accounts: providerMappings,
      mappedCurrencyCount: mappedCurrencies.size,
      ready: isRetailOperatorCurrencyReady(organization.country, mappedCurrencies),
    };
  });

  return {
    country: organization.country,
    requiredCurrencies,
    minimumCurrencyCount: 2,
    availableCurrencies,
    financialAccounts,
    providers: mappedProviders,
  };
}

export async function upsertTelcoProviderAccount(
  organizationId: string,
  actorUserId: string,
  input: { providerCode: string; currencyCode: string; financialAccountId: string },
) {
  const currencyCode = input.currencyCode.trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    const provider = await assertTelcoProviderTx(tx, organizationId, input.providerCode);
    const account = await assertTelcoFloatAccountTx(tx, organizationId, input.financialAccountId, currencyCode);
    const mapping = await tx.enterpriseRetailProviderAccount.upsert({
      where: {
        organizationId_providerId_accountUse_currencyCode: {
          organizationId,
          providerId: provider.id,
          accountUse: TELCO_FLOAT_ACCOUNT_USE,
          currencyCode,
        },
      },
      update: {
        providerCode: provider.providerCode,
        financialAccountId: account.id,
        isActive: true,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
      create: {
        organizationId,
        providerId: provider.id,
        providerCode: provider.providerCode,
        accountUse: TELCO_FLOAT_ACCOUNT_USE,
        currencyCode,
        financialAccountId: account.id,
        createdByUserId: actorUserId,
      },
    });

    const financeConfiguration = await tx.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true },
    });
    if (!provider.telcoFloatAccountId || financeConfiguration?.functionalCurrencyCode === currencyCode) {
      await tx.enterpriseRetailProvider.update({
        where: { id: provider.id },
        data: { telcoFloatAccountId: account.id, revision: { increment: 1 } },
      });
    }

    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailProviderAccount",
      entityId: mapping.id,
      eventType: "TELCO_PROVIDER_ACCOUNT_MAPPED",
      summary: provider.label + " " + currencyCode + " mapped to " + account.code,
      actorUserId,
      toStatus: "ACTIVE",
      metadataJson: { providerCode: provider.providerCode, currencyCode, financialAccountId: account.id, accountUse: TELCO_FLOAT_ACCOUNT_USE },
    });
    return mapping;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
