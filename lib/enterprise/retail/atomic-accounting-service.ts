import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { resolveExchangeRateDetails, snapshotExchangeRate } from "@/lib/enterprise/accounting/currency";
import { financeReference, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import {
  ensureMobileMoneyFxLedgerMappingsTx,
  ensureMobileMoneyTransactionLedgerMappingTx,
} from "@/lib/enterprise/accounting/mobile-money-ledger-provisioning";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { resolveMobileMoneyFloatAccountTx } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";
import { resolveTelcoFloatAccountTx } from "@/lib/enterprise/retail/telco-multicurrency-service";
import type { mobileMoneyCreateSchema, telcoTopupCreateSchema } from "@/lib/enterprise/retail/schemas";
import { prisma } from "@/lib/prisma";

type MobileMoneyInput = z.infer<typeof mobileMoneyCreateSchema>;
type TelcoTopupInput = z.infer<typeof telcoTopupCreateSchema>;

type MobileMoneyFxInput = {
  providerCode: string;
  sourceCurrencyCode: string;
  targetCurrencyCode: string;
  sourceAmount: number;
  idempotencyKey: string;
};

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

async function assertRetailOrganizationTx(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, deletedAt: null, status: "ACTIVE", organizationType: "CLIENT" },
    select: { id: true, sectorCode: true },
  });
  if (!organization || organization.sectorCode !== RETAIL_SECTOR_CODE) throw new EnterpriseRetailError("RETAIL_SECTOR_REQUIRED", 409);
}

async function ensureRetailConfigurationTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string) {
  const existing = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId } });
  if (existing) return existing;
  const finance = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { functionalCurrencyCode: true } });
  return tx.enterpriseRetailConfiguration.create({
    data: { organizationId, profileCode: "SHOP_V1", baseCurrencyCode: finance?.functionalCurrencyCode || "CDF", createdByUserId: actorUserId },
  });
}

async function financialAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  id: string,
  currencyCode: string,
  allowedTypes?: string[],
) {
  const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id, organizationId, status: "ACTIVE", archivedAt: null } });
  if (!account || account.currencyCode !== currencyCode || (allowedTypes?.length && !allowedTypes.includes(account.accountType))) {
    throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { id, currencyCode, allowedTypes });
  }
  return account;
}

async function openCashSessionTx(tx: Prisma.TransactionClient, organizationId: string, financialAccountId: string, actorUserId: string) {
  const session = await tx.enterpriseCashSession.findFirst({
    where: { organizationId, financialAccountId, cashierUserId: actorUserId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
  if (!session) throw new EnterpriseRetailError("RETAIL_OPEN_CASH_SESSION_REQUIRED", 409, { financialAccountId });
  return session;
}

async function applyAccountEffectTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    actorUserId: string;
    account: { id: string; accountType: string; currencyCode: string; operationalBalance: Prisma.Decimal };
    effect: Prisma.Decimal;
    transactionType: string;
    reference: string;
    transactionDate: Date;
    cashSessionId?: string | null;
    reason?: string | null;
  },
) {
  if (input.effect.isZero()) return;
  const outbound = input.effect.isNegative();
  const amount = input.effect.abs();
  if (outbound && input.account.operationalBalance.lessThan(amount)) {
    throw new EnterpriseRetailError("RETAIL_INSUFFICIENT_BALANCE", 409, { financialAccountId: input.account.id });
  }
  await tx.enterpriseFinancialAccount.update({
    where: { id: input.account.id },
    data: { operationalBalance: outbound ? { decrement: amount } : { increment: amount }, revision: { increment: 1 } },
  });
  await tx.enterpriseTreasuryTransaction.create({
    data: {
      organizationId: input.organizationId,
      financialAccountId: input.account.id,
      transactionType: input.transactionType,
      direction: outbound ? "OUTBOUND" : "INBOUND",
      currencyCode: input.account.currencyCode,
      amount,
      transactionDate: input.transactionDate,
      reference: input.reference,
      createdByUserId: input.actorUserId,
    },
  });
  if (input.account.accountType === "CASH" && input.cashSessionId) {
    await tx.enterpriseCashMovement.create({
      data: {
        organizationId: input.organizationId,
        cashSessionId: input.cashSessionId,
        movementType: input.transactionType,
        direction: outbound ? "OUTBOUND" : "INBOUND",
        amount,
        currencyCode: input.account.currencyCode,
        reference: input.reference,
        reason: input.reason || null,
        createdByUserId: input.actorUserId,
      },
    });
  }
}

async function postExistingMobileMoneyTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, transactionId: string) {
  await ensureMobileMoneyTransactionLedgerMappingTx(tx, organizationId, actorUserId, transactionId);
  return postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_MOBILE_MONEY_POSTED",
    sourceEntityType: "EnterpriseMobileMoneyTransaction",
    sourceEntityId: transactionId,
  });
}

export async function createAndPostMobileMoneyAtomic(organizationId: string, actorUserId: string, input: MobileMoneyInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganizationTx(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseMobileMoneyTransaction.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const posting = await postExistingMobileMoneyTx(tx, organizationId, actorUserId, existing.id);
      return { transaction: existing, idempotent: true, posting };
    }
    const provider = await tx.enterpriseRetailProvider.findFirst({ where: { organizationId, providerCode: input.providerCode, providerType: { in: ["MOBILE_MONEY", "BOTH"] }, isActive: true } });
    if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode: input.providerCode });
    const cashAccount = await financialAccountTx(tx, organizationId, input.cashAccountId, input.currencyCode, ["CASH"]);
    const floatAccount = (await resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, input.currencyCode)).account;
    if (cashAccount.id === floatAccount.id) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409);
    const cashSession = await openCashSessionTx(tx, organizationId, cashAccount.id, actorUserId);
    const principal = decimal(input.principalAmount);
    const cashFee = input.feeCollectionMode === "CASH" ? decimal(input.customerFeeAmount || 0) : decimal(0);
    const cashEffect = input.transactionType === "DEPOSIT" ? principal.plus(cashFee) : principal.negated().plus(cashFee);
    const floatEffect = input.transactionType === "DEPOSIT" ? principal.negated() : principal;
    const occurredAt = input.occurredAt || new Date();
    const number = financeReference("MM");
    const transaction = await tx.enterpriseMobileMoneyTransaction.create({
      data: {
        organizationId,
        number,
        providerCode: provider.providerCode,
        transactionType: input.transactionType,
        customerPhone: input.customerPhone,
        currencyCode: input.currencyCode,
        principalAmount: principal,
        customerFeeAmount: decimal(input.customerFeeAmount || 0),
        providerCommissionAmount: decimal(input.providerCommissionAmount || 0),
        feeCollectionMode: input.feeCollectionMode,
        cashAccountId: cashAccount.id,
        floatAccountId: floatAccount.id,
        cashEffectAmount: cashEffect,
        floatEffectAmount: floatEffect,
        externalReference: input.externalReference || null,
        occurredAt,
        agentUserId: actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: cashAccount, effect: cashEffect, transactionType: `MOBILE_MONEY_${input.transactionType}_CASH`, reference: number, transactionDate: occurredAt, cashSessionId: cashSession.id, reason: `${provider.label} ${input.transactionType}` });
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: floatAccount, effect: floatEffect, transactionType: `MOBILE_MONEY_${input.transactionType}_FLOAT`, reference: number, transactionDate: occurredAt });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseMobileMoneyTransaction", entityId: transaction.id, eventType: `MOBILE_MONEY_${input.transactionType}_CONFIRMED`, summary: `${provider.label} ${input.transactionType} ${number}`, actorUserId, toStatus: "CONFIRMED", metadataJson: { principal: principal.toFixed(), currency: input.currencyCode } });
    const posting = await postExistingMobileMoneyTx(tx, organizationId, actorUserId, transaction.id);
    return { transaction, idempotent: false, posting };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

async function postExistingTelcoTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, topupId: string) {
  return postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_TELCO_TOPUP_POSTED",
    sourceEntityType: "EnterpriseTelcoTopup",
    sourceEntityId: topupId,
  });
}

export async function createAndPostTelcoTopupAtomic(organizationId: string, actorUserId: string, input: TelcoTopupInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganizationTx(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseTelcoTopup.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const posting = existing.status === "SUCCESS" ? await postExistingTelcoTx(tx, organizationId, actorUserId, existing.id) : null;
      return { topup: existing, idempotent: true, posting };
    }
    const provider = await tx.enterpriseRetailProvider.findFirst({ where: { organizationId, providerCode: input.providerCode, providerType: { in: ["TELCO", "BOTH"] }, isActive: true } });
    if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode: input.providerCode });
    const catalogItem = input.catalogItemId ? await tx.enterpriseCatalogItem.findFirst({ where: { id: input.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, currency: true } }) : null;
    if (input.catalogItemId && !catalogItem) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409);
    const tender = await financialAccountTx(tx, organizationId, input.tenderFinancialAccountId, input.currencyCode, ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"]);
    if (catalogItem?.currency && catalogItem.currency !== tender.currencyCode) throw new EnterpriseRetailError("RETAIL_CURRENCY_MISMATCH", 409);
    const operatorFloat = (await resolveTelcoFloatAccountTx(tx, organizationId, provider, tender.currencyCode)).account;
    if (operatorFloat.id === tender.id) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409);
    const cashSession = tender.accountType === "CASH" ? await openCashSessionTx(tx, organizationId, tender.id, actorUserId) : null;
    const saleAmount = decimal(input.saleAmount);
    const operatorCost = decimal(input.operatorCost);
    const marginAmount = money(saleAmount.minus(operatorCost));
    const occurredAt = input.occurredAt || new Date();
    const number = financeReference("TEL");
    const topup = await tx.enterpriseTelcoTopup.create({
      data: {
        organizationId,
        number,
        providerCode: provider.providerCode,
        destinationPhone: input.destinationPhone,
        catalogItemId: input.catalogItemId || null,
        offerLabel: input.offerLabel,
        currencyCode: input.currencyCode,
        saleAmount,
        operatorCost,
        marginAmount,
        tenderFinancialAccountId: tender.id,
        operatorFloatAccountId: operatorFloat.id,
        externalReference: input.externalReference || null,
        status: input.status,
        failureReason: input.failureReason || null,
        occurredAt,
        agentUserId: actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (input.status !== "SUCCESS") return { topup, idempotent: false, posting: null };
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: tender, effect: saleAmount, transactionType: "TELCO_TOPUP_TENDER", reference: number, transactionDate: occurredAt, cashSessionId: cashSession?.id, reason: `${provider.label} ${input.offerLabel}` });
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: operatorFloat, effect: operatorCost.negated(), transactionType: "TELCO_TOPUP_FLOAT", reference: number, transactionDate: occurredAt });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseTelcoTopup", entityId: topup.id, eventType: "TELCO_TOPUP_SUCCESS", summary: `Recharge ${number} réussie`, actorUserId, toStatus: "SUCCESS", metadataJson: { saleAmount: saleAmount.toFixed(), operatorCost: operatorCost.toFixed(), margin: marginAmount.toFixed(), currency: input.currencyCode } });
    const posting = await postExistingTelcoTx(tx, organizationId, actorUserId, topup.id);
    return { topup, idempotent: false, posting };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function createAndPostMobileMoneyFxAtomic(organizationId: string, actorUserId: string, input: MobileMoneyFxInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganizationTx(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseMobileMoneyFxTransfer.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      await ensureMobileMoneyFxLedgerMappingsTx(tx, organizationId, actorUserId, existing.id);
      const posting = await postBusinessEventTx(tx, organizationId, actorUserId, { postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED", sourceEntityType: "EnterpriseMobileMoneyFxTransfer", sourceEntityId: existing.id });
      return { transfer: existing, idempotent: true, posting };
    }
    const sourceCurrencyCode = input.sourceCurrencyCode.trim().toUpperCase();
    const targetCurrencyCode = input.targetCurrencyCode.trim().toUpperCase();
    if (sourceCurrencyCode === targetCurrencyCode) throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_PAIR_INVALID", 400);
    const provider = await tx.enterpriseRetailProvider.findFirst({ where: { organizationId, providerCode: input.providerCode, providerType: { in: ["MOBILE_MONEY", "BOTH"] }, isActive: true } });
    if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409);
    const [sourceResolved, targetResolved] = await Promise.all([
      resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, sourceCurrencyCode),
      resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, targetCurrencyCode),
    ]);
    if (!sourceResolved.mapping || !targetResolved.mapping) throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_MAPPING_REQUIRED", 409);
    const occurredAt = new Date();
    const exchange = await resolveExchangeRateDetails(tx, { organizationId, sourceCurrencyCode, targetCurrencyCode, rateDate: occurredAt });
    const sourceAmount = money(new Prisma.Decimal(input.sourceAmount));
    const targetAmount = money(sourceAmount.times(exchange.rate));
    if (!sourceAmount.gt(0) || !targetAmount.gt(0)) throw new EnterpriseRetailError("RETAIL_MOBILE_MONEY_FX_AMOUNT_INVALID", 400);
    const lockIds = [sourceResolved.account.id, targetResolved.account.id].sort();
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE "organizationId" = ${organizationId} AND id IN (${Prisma.join(lockIds)}) ORDER BY id FOR UPDATE`);
    const sourceAccount = await financialAccountTx(tx, organizationId, sourceResolved.account.id, sourceCurrencyCode, ["MOBILE_MONEY"]);
    if (sourceAccount.operationalBalance.lessThan(sourceAmount)) throw new EnterpriseRetailError("RETAIL_INSUFFICIENT_BALANCE", 409);
    const number = financeReference("MMFX");
    const transfer = await tx.enterpriseMobileMoneyFxTransfer.create({
      data: {
        organizationId,
        number,
        providerId: provider.id,
        providerCode: provider.providerCode,
        sourceProviderAccountId: sourceResolved.mapping.id,
        targetProviderAccountId: targetResolved.mapping.id,
        sourceFloatAccountId: sourceResolved.account.id,
        targetFloatAccountId: targetResolved.account.id,
        sourceCurrencyCode,
        targetCurrencyCode,
        sourceAmount,
        targetAmount,
        exchangeRate: exchange.rate,
        exchangeRateId: exchange.rateId,
        exchangeRateDate: exchange.rateDate,
        exchangeRateSource: `${exchange.direction}:${exchange.source}`,
        occurredAt,
        agentUserId: actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await tx.enterpriseFinancialAccount.update({ where: { id: sourceResolved.account.id }, data: { operationalBalance: { decrement: sourceAmount }, revision: { increment: 1 } } });
    await tx.enterpriseFinancialAccount.update({ where: { id: targetResolved.account.id }, data: { operationalBalance: { increment: targetAmount }, revision: { increment: 1 } } });
    await tx.enterpriseTreasuryTransaction.createMany({ data: [
      { organizationId, financialAccountId: sourceResolved.account.id, transactionType: "MOBILE_MONEY_FX_TRANSFER", direction: "OUTBOUND", currencyCode: sourceCurrencyCode, amount: sourceAmount, transactionDate: occurredAt, reference: number, createdByUserId: actorUserId },
      { organizationId, financialAccountId: targetResolved.account.id, transactionType: "MOBILE_MONEY_FX_TRANSFER", direction: "INBOUND", currencyCode: targetCurrencyCode, amount: targetAmount, transactionDate: occurredAt, reference: number, createdByUserId: actorUserId },
    ] });
    await snapshotExchangeRate(tx, { organizationId, sourceEntityType: "EnterpriseMobileMoneyFxTransfer", sourceEntityId: transfer.id, sourceCurrencyCode, targetCurrencyCode, rateDate: exchange.rateDate, rate: exchange.rate, source: `ENTERPRISE_RATE:${exchange.direction}:${exchange.rateId || "NONE"}:${exchange.source}` });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseMobileMoneyFxTransfer", entityId: transfer.id, eventType: "MOBILE_MONEY_FX_TRANSFER_CONFIRMED", summary: `${provider.label} ${sourceCurrencyCode}/${targetCurrencyCode} ${number}`, actorUserId, toStatus: "CONFIRMED", metadataJson: { sourceAmount: sourceAmount.toFixed(), targetAmount: targetAmount.toFixed(), exchangeRate: exchange.rate.toFixed() } });
    await ensureMobileMoneyFxLedgerMappingsTx(tx, organizationId, actorUserId, transfer.id);
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, { postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED", sourceEntityType: "EnterpriseMobileMoneyFxTransfer", sourceEntityId: transfer.id });
    return { transfer, idempotent: false, posting };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
