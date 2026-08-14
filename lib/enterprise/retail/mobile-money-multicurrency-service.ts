import { Prisma } from "@prisma/client";
import { resolveExchangeRateDetails, snapshotExchangeRate } from "@/lib/enterprise/accounting/currency";
import { financeReference, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";

const MOBILE_MONEY_FLOAT = "MOBILE_MONEY_FLOAT";
const DRC_COUNTRY_MARKERS = new Set(["CD", "COD", "RDC", "DRC", "CONGO RDC", "CONGO-KINSHASA", "DEMOCRATIC REPUBLIC OF THE CONGO"]);

function normalizeCountry(value: string | null | undefined) {
  return (value || "").trim().toUpperCase().replace(/[^A-Z -]/g, "");
}

export function requiredMobileMoneyCurrencies(country: string | null | undefined) {
  return DRC_COUNTRY_MARKERS.has(normalizeCountry(country)) ? ["CDF", "USD"] : [];
}

async function assertProviderTx(tx: Prisma.TransactionClient, organizationId: string, providerCode: string) {
  const provider = await tx.enterpriseRetailProvider.findFirst({
    where: { organizationId, providerCode, providerType: { in: ["MOBILE_MONEY", "BOTH"] }, isActive: true },
  });
  if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode });
  return provider;
}

async function assertMobileMoneyAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  financialAccountId: string,
  currencyCode?: string,
) {
  const account = await tx.enterpriseFinancialAccount.findFirst({
    where: {
      organizationId,
      id: financialAccountId,
      accountType: "MOBILE_MONEY",
      status: "ACTIVE",
      archivedAt: null,
      ...(currencyCode ? { currencyCode } : {}),
    },
  });
  if (!account) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { financialAccountId, currencyCode });
  return account;
}

export async function resolveMobileMoneyFloatAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  provider: { id: string; providerCode: string; mobileMoneyFloatAccountId: string | null },
  currencyCode: string,
) {
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  const mapping = await tx.enterpriseRetailProviderAccount.findUnique({
    where: {
      organizationId_providerId_accountUse_currencyCode: {
        organizationId,
        providerId: provider.id,
        accountUse: MOBILE_MONEY_FLOAT,
        currencyCode: normalizedCurrency,
      },
    },
  });
  if (mapping?.isActive) {
    const account = await assertMobileMoneyAccountTx(tx, organizationId, mapping.financialAccountId, normalizedCurrency);
    return { mapping, account, legacyFallback: false };
  }

  // Compatibility window for tenants that have not yet passed through the additive backfill.
  if (provider.mobileMoneyFloatAccountId) {
    const legacy = await tx.enterpriseFinancialAccount.findFirst({
      where: {
        organizationId,
        id: provider.mobileMoneyFloatAccountId,
        accountType: "MOBILE_MONEY",
        currencyCode: normalizedCurrency,
        status: "ACTIVE",
        archivedAt: null,
      },
    });
    if (legacy) return { mapping: null, account: legacy, legacyFallback: true };
  }

  throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_CURRENCY_ACCOUNT_REQUIRED", 409, {
    providerCode: provider.providerCode,
    currencyCode: normalizedCurrency,
  });
}

export async function getMobileMoneyProviderAccountConfiguration(organizationId: string) {
  const [organization, providers, mappings, financialAccounts, financeConfiguration] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { country: true } }),
    prisma.enterpriseRetailProvider.findMany({
      where: { organizationId, providerType: { in: ["MOBILE_MONEY", "BOTH"] }, isActive: true },
      orderBy: { label: "asc" },
    }),
    prisma.enterpriseRetailProviderAccount.findMany({
      where: { organizationId, accountUse: MOBILE_MONEY_FLOAT, isActive: true },
      orderBy: [{ providerCode: "asc" }, { currencyCode: "asc" }],
    }),
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, accountType: "MOBILE_MONEY", status: "ACTIVE", archivedAt: null },
      orderBy: [{ currencyCode: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, currencyCode: true, operationalBalance: true, ledgerAccountId: true },
    }),
    prisma.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true, presentationCurrencyCode: true },
    }),
  ]);
  if (!organization) throw new EnterpriseRetailError("RETAIL_ORGANIZATION_NOT_FOUND", 404);

  const accountById = new Map(financialAccounts.map((account) => [account.id, account]));
  const requiredCurrencies = requiredMobileMoneyCurrencies(organization.country);
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
    const ready = requiredCurrencies.length
      ? requiredCurrencies.every((currency) => mappedCurrencies.has(currency))
      : mappedCurrencies.size >= 2;
    return {
      id: provider.id,
      providerCode: provider.providerCode,
      label: provider.label,
      providerType: provider.providerType,
      accounts: providerMappings,
      mappedCurrencyCount: mappedCurrencies.size,
      ready,
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

export async function upsertMobileMoneyProviderAccount(
  organizationId: string,
  actorUserId: string,
  input: { providerCode: string; currencyCode: string; financialAccountId: string },
) {
  const currencyCode = input.currencyCode.trim().toUpperCase();
  return prisma.$transaction(async (tx) => {
    const provider = await assertProviderTx(tx, organizationId, input.providerCode);
    const account = await assertMobileMoneyAccountTx(tx, organizationId, input.financialAccountId, currencyCode);
    const mapping = await tx.enterpriseRetailProviderAccount.upsert({
      where: {
        organizationId_providerId_accountUse_currencyCode: {
          organizationId,
          providerId: provider.id,
          accountUse: MOBILE_MONEY_FLOAT,
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
        accountUse: MOBILE_MONEY_FLOAT,
        currencyCode,
        financialAccountId: account.id,
        createdByUserId: actorUserId,
      },
    });

    const financeConfiguration = await tx.enterpriseFinanceConfiguration.findUnique({
      where: { organizationId },
      select: { functionalCurrencyCode: true },
    });
    if (!provider.mobileMoneyFloatAccountId || financeConfiguration?.functionalCurrencyCode === currencyCode) {
      await tx.enterpriseRetailProvider.update({
        where: { id: provider.id },
        data: { mobileMoneyFloatAccountId: account.id, revision: { increment: 1 } },
      });
    }

    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailProviderAccount",
      entityId: mapping.id,
      eventType: "MOBILE_MONEY_PROVIDER_ACCOUNT_MAPPED",
      summary: `${provider.label} ${currencyCode} mapped to ${account.code}`,
      actorUserId,
      toStatus: "ACTIVE",
      metadataJson: { providerCode: provider.providerCode, currencyCode, financialAccountId: account.id },
    });
    return mapping;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function resolveFxPairTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { providerCode: string; sourceCurrencyCode: string; targetCurrencyCode: string; sourceAmount: number; occurredAt: Date },
) {
  const sourceCurrencyCode = input.sourceCurrencyCode.trim().toUpperCase();
  const targetCurrencyCode = input.targetCurrencyCode.trim().toUpperCase();
  if (sourceCurrencyCode === targetCurrencyCode) throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_PAIR_INVALID", 400);
  const provider = await assertProviderTx(tx, organizationId, input.providerCode);
  const [sourceResolved, targetResolved] = await Promise.all([
    resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, sourceCurrencyCode),
    resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, targetCurrencyCode),
  ]);
  if (!sourceResolved.mapping || !targetResolved.mapping) {
    throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_MAPPING_REQUIRED", 409, { providerCode: provider.providerCode });
  }
  const exchange = await resolveExchangeRateDetails(tx, {
    organizationId,
    sourceCurrencyCode,
    targetCurrencyCode,
    rateDate: input.occurredAt,
  });
  const sourceAmount = money(new Prisma.Decimal(input.sourceAmount));
  const targetAmount = money(sourceAmount.times(exchange.rate));
  if (!sourceAmount.gt(0) || !targetAmount.gt(0)) throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_AMOUNT_INVALID", 400);
  return { provider, sourceResolved, targetResolved, exchange, sourceAmount, targetAmount, sourceCurrencyCode, targetCurrencyCode };
}

export async function previewMobileMoneyFxTransfer(
  organizationId: string,
  input: { providerCode: string; sourceCurrencyCode: string; targetCurrencyCode: string; sourceAmount: number },
) {
  const occurredAt = new Date();
  return prisma.$transaction(async (tx) => {
    const resolved = await resolveFxPairTx(tx, organizationId, { ...input, occurredAt });
    return {
      providerCode: resolved.provider.providerCode,
      providerLabel: resolved.provider.label,
      sourceCurrencyCode: resolved.sourceCurrencyCode,
      targetCurrencyCode: resolved.targetCurrencyCode,
      sourceAmount: resolved.sourceAmount.toFixed(),
      targetAmount: resolved.targetAmount.toFixed(),
      rate: resolved.exchange.rate.toFixed(),
      rateDate: resolved.exchange.rateDate.toISOString(),
      rateSource: resolved.exchange.source,
      direction: resolved.exchange.direction,
      sourceAvailableBalance: resolved.sourceResolved.account.operationalBalance.toFixed(),
      sufficientBalance: resolved.sourceResolved.account.operationalBalance.greaterThanOrEqualTo(resolved.sourceAmount),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createMobileMoneyFxTransfer(
  organizationId: string,
  actorUserId: string,
  input: { providerCode: string; sourceCurrencyCode: string; targetCurrencyCode: string; sourceAmount: number; idempotencyKey: string },
) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseMobileMoneyFxTransfer.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return { transfer: existing, idempotent: true };

    const occurredAt = new Date();
    const resolved = await resolveFxPairTx(tx, organizationId, { ...input, occurredAt });
    const lockIds = [resolved.sourceResolved.account.id, resolved.targetResolved.account.id].sort();
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM "EnterpriseFinancialAccount"
      WHERE "organizationId" = ${organizationId} AND id IN (${Prisma.join(lockIds)})
      ORDER BY id FOR UPDATE
    `);
    const sourceAccount = await assertMobileMoneyAccountTx(tx, organizationId, resolved.sourceResolved.account.id, resolved.sourceCurrencyCode);
    if (sourceAccount.operationalBalance.lessThan(resolved.sourceAmount)) {
      throw new EnterpriseRetailError("RETAIL_INSUFFICIENT_BALANCE", 409, {
        financialAccountId: sourceAccount.id,
        currencyCode: sourceAccount.currencyCode,
      });
    }

    const transfer = await tx.enterpriseMobileMoneyFxTransfer.create({
      data: {
        organizationId,
        number: financeReference("MMFX"),
        providerId: resolved.provider.id,
        providerCode: resolved.provider.providerCode,
        sourceProviderAccountId: resolved.sourceResolved.mapping!.id,
        targetProviderAccountId: resolved.targetResolved.mapping!.id,
        sourceFloatAccountId: resolved.sourceResolved.account.id,
        targetFloatAccountId: resolved.targetResolved.account.id,
        sourceCurrencyCode: resolved.sourceCurrencyCode,
        targetCurrencyCode: resolved.targetCurrencyCode,
        sourceAmount: resolved.sourceAmount,
        targetAmount: resolved.targetAmount,
        exchangeRate: resolved.exchange.rate,
        exchangeRateId: resolved.exchange.rateId,
        exchangeRateDate: resolved.exchange.rateDate,
        exchangeRateSource: `${resolved.exchange.direction}:${resolved.exchange.source}`,
        occurredAt,
        agentUserId: actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.enterpriseFinancialAccount.update({
      where: { id: resolved.sourceResolved.account.id },
      data: { operationalBalance: { decrement: resolved.sourceAmount }, revision: { increment: 1 } },
    });
    await tx.enterpriseFinancialAccount.update({
      where: { id: resolved.targetResolved.account.id },
      data: { operationalBalance: { increment: resolved.targetAmount }, revision: { increment: 1 } },
    });
    await tx.enterpriseTreasuryTransaction.createMany({
      data: [
        {
          organizationId,
          financialAccountId: resolved.sourceResolved.account.id,
          transactionType: "MOBILE_MONEY_FX_TRANSFER",
          direction: "OUTBOUND",
          currencyCode: resolved.sourceCurrencyCode,
          amount: resolved.sourceAmount,
          transactionDate: occurredAt,
          reference: transfer.number,
          createdByUserId: actorUserId,
        },
        {
          organizationId,
          financialAccountId: resolved.targetResolved.account.id,
          transactionType: "MOBILE_MONEY_FX_TRANSFER",
          direction: "INBOUND",
          currencyCode: resolved.targetCurrencyCode,
          amount: resolved.targetAmount,
          transactionDate: occurredAt,
          reference: transfer.number,
          createdByUserId: actorUserId,
        },
      ],
    });
    await snapshotExchangeRate(tx, {
      organizationId,
      sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
      sourceEntityId: transfer.id,
      sourceCurrencyCode: resolved.sourceCurrencyCode,
      targetCurrencyCode: resolved.targetCurrencyCode,
      rateDate: resolved.exchange.rateDate,
      rate: resolved.exchange.rate,
      source: `ENTERPRISE_RATE:${resolved.exchange.direction}:${resolved.exchange.rateId || "NONE"}:${resolved.exchange.source}`,
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseMobileMoneyFxTransfer",
      entityId: transfer.id,
      eventType: "MOBILE_MONEY_FX_TRANSFER_CONFIRMED",
      summary: `${resolved.provider.label} ${resolved.sourceCurrencyCode}/${resolved.targetCurrencyCode} ${transfer.number}`,
      actorUserId,
      toStatus: "CONFIRMED",
      metadataJson: {
        providerCode: resolved.provider.providerCode,
        sourceAmount: resolved.sourceAmount.toFixed(),
        sourceCurrencyCode: resolved.sourceCurrencyCode,
        targetAmount: resolved.targetAmount.toFixed(),
        targetCurrencyCode: resolved.targetCurrencyCode,
        exchangeRate: resolved.exchange.rate.toFixed(),
        exchangeRateId: resolved.exchange.rateId,
      },
    });
    return { transfer, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  return result;
}

export async function reverseMobileMoneyFxTransfer(
  organizationId: string,
  transferId: string,
  actorUserId: string,
  input: { revision: number; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseMobileMoneyFxTransfer" WHERE id = ${transferId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const transfer = await tx.enterpriseMobileMoneyFxTransfer.findFirst({ where: { id: transferId, organizationId } });
    if (!transfer) throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_TRANSFER_NOT_FOUND", 404);
    if (transfer.status === "REVERSED") return transfer;
    if (transfer.status !== "CONFIRMED" || transfer.revision !== input.revision) {
      throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_TRANSFER_CONFLICT", 409);
    }

    const lockIds = [transfer.sourceFloatAccountId, transfer.targetFloatAccountId].sort();
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM "EnterpriseFinancialAccount"
      WHERE "organizationId" = ${organizationId} AND id IN (${Prisma.join(lockIds)})
      ORDER BY id FOR UPDATE
    `);
    const [source, target] = await Promise.all([
      assertMobileMoneyAccountTx(tx, organizationId, transfer.sourceFloatAccountId, transfer.sourceCurrencyCode),
      assertMobileMoneyAccountTx(tx, organizationId, transfer.targetFloatAccountId, transfer.targetCurrencyCode),
    ]);
    if (target.operationalBalance.lessThan(transfer.targetAmount)) {
      throw new EnterpriseRetailError("RETAIL_INSUFFICIENT_BALANCE", 409, { financialAccountId: target.id, currencyCode: target.currencyCode });
    }
    await tx.enterpriseFinancialAccount.update({ where: { id: source.id }, data: { operationalBalance: { increment: transfer.sourceAmount }, revision: { increment: 1 } } });
    await tx.enterpriseFinancialAccount.update({ where: { id: target.id }, data: { operationalBalance: { decrement: transfer.targetAmount }, revision: { increment: 1 } } });
    await tx.enterpriseTreasuryTransaction.createMany({
      data: [
        { organizationId, financialAccountId: source.id, transactionType: "MOBILE_MONEY_FX_REVERSAL", direction: "INBOUND", currencyCode: source.currencyCode, amount: transfer.sourceAmount, transactionDate: new Date(), reference: `${transfer.number}-REV`, createdByUserId: actorUserId },
        { organizationId, financialAccountId: target.id, transactionType: "MOBILE_MONEY_FX_REVERSAL", direction: "OUTBOUND", currencyCode: target.currencyCode, amount: transfer.targetAmount, transactionDate: new Date(), reference: `${transfer.number}-REV`, createdByUserId: actorUserId },
      ],
    });
    const reversed = await tx.enterpriseMobileMoneyFxTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "REVERSED",
        reversalReason: input.reason,
        reversedAt: new Date(),
        reversedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseMobileMoneyFxTransfer",
      entityId: transfer.id,
      eventType: "MOBILE_MONEY_FX_TRANSFER_REVERSED",
      summary: `Reversal ${transfer.number}`,
      actorUserId,
      fromStatus: "CONFIRMED",
      toStatus: "REVERSED",
      metadataJson: { reason: input.reason.slice(0, 500) },
    });
    return reversed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
