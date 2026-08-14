import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import { money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { RETAIL_PROFILE_CODE, RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { resolveMobileMoneyFloatAccountTx } from "@/lib/enterprise/retail/mobile-money-multicurrency-service";
import { resolveTelcoFloatAccountTx } from "@/lib/enterprise/retail/telco-multicurrency-service";
import type { mobileMoneyCreateSchema, retailDailyCloseCreateSchema, retailDailyCloseDecisionSchema, retailProviderUpsertSchema, retailSaleCreateSchema, retailSaleReverseSchema, telcoTopupCreateSchema } from "@/lib/enterprise/retail/schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type RetailSaleInput = z.infer<typeof retailSaleCreateSchema>;
type RetailSaleReverseInput = z.infer<typeof retailSaleReverseSchema>;
type MobileMoneyInput = z.infer<typeof mobileMoneyCreateSchema>;
type TelcoTopupInput = z.infer<typeof telcoTopupCreateSchema>;
type RetailCloseInput = z.infer<typeof retailDailyCloseCreateSchema>;
type RetailCloseDecisionInput = z.infer<typeof retailDailyCloseDecisionSchema>;
type RetailProviderInput = z.infer<typeof retailProviderUpsertSchema>;

function retailReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function phoneForList(value: string) {
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

async function assertRetailOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, deletedAt: null, status: "ACTIVE", organizationType: "CLIENT" },
    select: { id: true, sectorCode: true },
  });
  if (!organization || organization.sectorCode !== RETAIL_SECTOR_CODE) throw new EnterpriseRetailError("RETAIL_SECTOR_REQUIRED", 409);
  return organization;
}

async function ensureRetailConfigurationTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string) {
  const existing = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId } });
  if (existing) return existing;
  const financeConfiguration = await tx.enterpriseFinanceConfiguration.findUnique({
    where: { organizationId },
    select: { functionalCurrencyCode: true },
  });
  return tx.enterpriseRetailConfiguration.create({
    data: {
      organizationId,
      profileCode: RETAIL_PROFILE_CODE,
      baseCurrencyCode: financeConfiguration?.functionalCurrencyCode || "CDF",
      createdByUserId: actorUserId,
    },
  });
}

async function assertFinancialAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountId: string,
  currencyCode: string,
  allowedTypes?: string[],
) {
  const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: accountId, organizationId, status: "ACTIVE", archivedAt: null } });
  if (!account || account.currencyCode !== currencyCode || (allowedTypes?.length && !allowedTypes.includes(account.accountType))) {
    throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { accountId, currencyCode, allowedTypes });
  }
  return account;
}

async function assertOpenCashSession(tx: Prisma.TransactionClient, organizationId: string, financialAccountId: string, cashierUserId: string) {
  const session = await tx.enterpriseCashSession.findFirst({
    where: { organizationId, financialAccountId, cashierUserId, status: "OPEN" },
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
    cashReason?: string | null;
  },
) {
  if (input.effect.isZero()) return;
  const outbound = input.effect.isNegative();
  const amount = input.effect.abs();
  if (outbound && input.account.operationalBalance.lessThan(amount)) {
    throw new EnterpriseRetailError("RETAIL_INSUFFICIENT_BALANCE", 409, { financialAccountId: input.account.id, requiredAmount: amount.toFixed(), availableBalance: input.account.operationalBalance.toFixed() });
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
        reason: input.cashReason || null,
        createdByUserId: input.actorUserId,
      },
    });
  }
}

export async function upsertRetailProvider(organizationId: string, actorUserId: string, input: RetailProviderInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    if (input.mobileMoneyFloatAccountId) await assertFinancialAccount(tx, organizationId, input.mobileMoneyFloatAccountId, (await tx.enterpriseFinancialAccount.findUniqueOrThrow({ where: { id: input.mobileMoneyFloatAccountId }, select: { currencyCode: true } })).currencyCode, ["MOBILE_MONEY"]);
    if (input.telcoFloatAccountId) await assertFinancialAccount(tx, organizationId, input.telcoFloatAccountId, (await tx.enterpriseFinancialAccount.findUniqueOrThrow({ where: { id: input.telcoFloatAccountId }, select: { currencyCode: true } })).currencyCode, ["MOBILE_MONEY", "CLEARING"]);
    return tx.enterpriseRetailProvider.upsert({
      where: { organizationId_providerCode: { organizationId, providerCode: input.providerCode } },
      update: { label: input.label, providerType: input.providerType, mobileMoneyFloatAccountId: input.mobileMoneyFloatAccountId || null, telcoFloatAccountId: input.telcoFloatAccountId || null, settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : Prisma.JsonNull, isActive: input.isActive, revision: { increment: 1 } },
      create: { organizationId, providerCode: input.providerCode, label: input.label, providerType: input.providerType, mobileMoneyFloatAccountId: input.mobileMoneyFloatAccountId || null, telcoFloatAccountId: input.telcoFloatAccountId || null, settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : undefined, isActive: input.isActive },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createRetailSale(organizationId: string, actorUserId: string, input: RetailSaleInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseRetailSale.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { lines: true, tenders: true } });
    if (existing) return { sale: existing, idempotent: true };

    const catalogItemIds = Array.from(new Set(input.lines.map((line) => line.catalogItemId)));
    const tenderAccountIds = Array.from(new Set(input.tenders.map((tender) => tender.financialAccountId)));
    const [warehouse, site, location, customer, catalogItems, inventoryItems, financialAccounts] = await Promise.all([
      tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, siteId: true } }),
      input.siteId ? tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }) : Promise.resolve(null),
      input.storageLocationId ? tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: input.warehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true } }) : Promise.resolve(null),
      input.customerBusinessPartyId ? tx.enterpriseBusinessParty.findFirst({ where: { id: input.customerBusinessPartyId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }) : Promise.resolve(null),
      tx.enterpriseCatalogItem.findMany({
        where: { id: { in: catalogItemIds }, organizationId, status: "ACTIVE", archivedAt: null },
        select: { id: true, name: true, currency: true, trackInventory: true },
      }),
      tx.enterpriseInventoryItem.findMany({
        where: { organizationId, catalogItemId: { in: catalogItemIds }, status: "ACTIVE", archivedAt: null },
        select: { id: true, catalogItemId: true },
      }),
      tx.enterpriseFinancialAccount.findMany({
        where: { organizationId, id: { in: tenderAccountIds }, status: "ACTIVE", archivedAt: null },
      }),
    ]);
    if (!warehouse || (input.siteId && !site) || (input.storageLocationId && !location) || (input.customerBusinessPartyId && !customer)) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 409);
    if (input.siteId && warehouse.siteId !== input.siteId) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 409, { field: "siteId" });
    if (catalogItems.length !== catalogItemIds.length) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409);
    if (financialAccounts.length !== tenderAccountIds.length) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409);

    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
    const inventoryByCatalogId = new Map(inventoryItems.map((item) => [item.catalogItemId, item]));
    const accountById = new Map(financialAccounts.map((account) => [account.id, account]));

    const preparedLines: Array<{
      catalogItemId: string; inventoryItemId: string | null; stockLotId: string | null; description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discountAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; lineTotal: Prisma.Decimal; trackInventory: boolean;
    }> = [];
    for (const line of input.lines) {
      const catalogItem = catalogById.get(line.catalogItemId);
      if (!catalogItem) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409, { catalogItemId: line.catalogItemId });
      if (catalogItem.currency && catalogItem.currency !== input.currencyCode) throw new EnterpriseRetailError("RETAIL_CURRENCY_MISMATCH", 409, { catalogItemId: line.catalogItemId });
      let inventoryItemId: string | null = null;
      if (catalogItem.trackInventory) {
        const inventoryItem = inventoryByCatalogId.get(catalogItem.id);
        if (!inventoryItem || (line.inventoryItemId && line.inventoryItemId !== inventoryItem.id)) {
          throw new EnterpriseRetailError("RETAIL_INVENTORY_ITEM_REQUIRED", 409, { catalogItemId: catalogItem.id });
        }
        inventoryItemId = inventoryItem.id;
      }
      const quantity = decimal(line.quantity);
      const unitPrice = decimal(line.unitPrice);
      const discountAmount = decimal(line.discountAmount || 0);
      const taxAmount = decimal(line.taxAmount || 0);
      const gross = quantity.times(unitPrice);
      if (discountAmount.greaterThan(gross.plus(taxAmount))) throw new EnterpriseRetailError("RETAIL_LINE_TOTAL_INVALID", 409, { catalogItemId: catalogItem.id });
      preparedLines.push({ catalogItemId: catalogItem.id, inventoryItemId, stockLotId: line.stockLotId || null, description: catalogItem.name, quantity, unitPrice, discountAmount, taxAmount, lineTotal: money(gross.minus(discountAmount).plus(taxAmount)), trackInventory: catalogItem.trackInventory });
    }

    const subtotal = money(sumDecimals(preparedLines.map((line) => line.quantity.times(line.unitPrice))));
    const discountTotal = money(sumDecimals(preparedLines.map((line) => line.discountAmount)));
    const taxTotal = money(sumDecimals(preparedLines.map((line) => line.taxAmount)));
    const grandTotal = money(subtotal.minus(discountTotal).plus(taxTotal));
    const tenderTotal = money(sumDecimals(input.tenders.map((tender) => decimal(tender.amount))));
    if (!tenderTotal.equals(grandTotal)) throw new EnterpriseRetailError("RETAIL_TENDER_TOTAL_MISMATCH", 409, { tenderTotal: tenderTotal.toFixed(), grandTotal: grandTotal.toFixed() });

    const cashAccountIds: string[] = [];
    for (const tender of input.tenders) {
      const account = accountById.get(tender.financialAccountId);
      const expectedTypes = tender.methodType === "CASH" ? ["CASH"] : tender.methodType === "MOBILE_MONEY" ? ["MOBILE_MONEY"] : ["BANK", "CLEARING"];
      if (!account || account.currencyCode !== input.currencyCode || !expectedTypes.includes(account.accountType)) {
        throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { accountId: tender.financialAccountId, currencyCode: input.currencyCode, allowedTypes: expectedTypes });
      }
      if (account.accountType === "CASH") cashAccountIds.push(account.id);
    }
    const openCashSessions = cashAccountIds.length
      ? await tx.enterpriseCashSession.findMany({
          where: { organizationId, financialAccountId: { in: cashAccountIds }, cashierUserId: actorUserId, status: "OPEN" },
          orderBy: { openedAt: "desc" },
        })
      : [];
    const cashSessionByAccountId = new Map<string, (typeof openCashSessions)[number]>();
    for (const session of openCashSessions) {
      if (!cashSessionByAccountId.has(session.financialAccountId)) cashSessionByAccountId.set(session.financialAccountId, session);
    }
    for (const accountId of cashAccountIds) {
      if (!cashSessionByAccountId.has(accountId)) throw new EnterpriseRetailError("RETAIL_OPEN_CASH_SESSION_REQUIRED", 409, { financialAccountId: accountId });
    }

    const sale = await tx.enterpriseRetailSale.create({
      data: {
        organizationId,
        number: retailReference("POS"),
        customerBusinessPartyId: input.customerBusinessPartyId || null,
        siteId: input.siteId || warehouse.siteId,
        warehouseId: input.warehouseId,
        storageLocationId: input.storageLocationId || null,
        currencyCode: input.currencyCode,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        soldAt: input.soldAt || new Date(),
        cashierUserId: actorUserId,
        idempotencyKey: input.idempotencyKey,
        lines: { create: preparedLines },
        tenders: { create: input.tenders.map((tender) => ({ methodType: tender.methodType, financialAccountId: tender.financialAccountId, currencyCode: input.currencyCode, amount: decimal(tender.amount), reference: tender.reference || null })) },
      },
      include: { lines: true, tenders: true },
    });

    for (const line of sale.lines) {
      if (!line.trackInventory || !line.inventoryItemId) continue;
      await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: line.inventoryItemId,
        warehouseId: sale.warehouseId,
        storageLocationId: sale.storageLocationId,
        stockLotId: line.stockLotId,
        movementType: "SALE_FULFILLMENT",
        direction: "OUT",
        quantity: Number(line.quantity),
        sourceEntityType: "EnterpriseRetailSale",
        sourceEntityId: sale.id,
        sourceLineId: line.id,
        idempotencyKey: `retail-sale:${sale.id}:${line.id}:out`,
        reason: `Ticket ${sale.number}`,
      });
    }

    for (const tender of sale.tenders) {
      const account = accountById.get(tender.financialAccountId);
      if (!account) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { accountId: tender.financialAccountId });
      const cashSession = account.accountType === "CASH" ? cashSessionByAccountId.get(account.id) || null : null;
      await applyAccountEffectTx(tx, { organizationId, actorUserId, account, effect: tender.amount, transactionType: "RETAIL_POS_SALE", reference: sale.number, transactionDate: sale.soldAt, cashSessionId: cashSession?.id, cashReason: `Vente ${sale.number}` });
    }

    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseRetailSale", entityId: sale.id, eventType: "RETAIL_POS_SALE_COMPLETED", summary: `Ticket ${sale.number} terminé`, actorUserId, toStatus: "COMPLETED", metadataJson: { total: sale.grandTotal.toFixed(), currency: sale.currencyCode, lineCount: sale.lines.length } });
    return { sale, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function reverseRetailSale(organizationId: string, saleId: string, actorUserId: string, input: RetailSaleReverseInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailSale" WHERE id = ${saleId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const sale = await tx.enterpriseRetailSale.findFirst({ where: { id: saleId, organizationId }, include: { lines: true, tenders: true } });
    if (!sale) throw new EnterpriseRetailError("RETAIL_SALE_NOT_FOUND", 404);
    if (sale.status === "REVERSED") return sale;
    if (sale.status !== "COMPLETED" || sale.revision !== input.revision) throw new EnterpriseRetailError("RETAIL_SALE_ALREADY_REVERSED", 409);

    for (const line of sale.lines) {
      if (!line.trackInventory || !line.inventoryItemId) continue;
      await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: line.inventoryItemId,
        warehouseId: sale.warehouseId,
        storageLocationId: sale.storageLocationId,
        stockLotId: line.stockLotId,
        movementType: "RETURN_IN",
        direction: "IN",
        quantity: Number(line.quantity),
        sourceEntityType: "EnterpriseRetailSale",
        sourceEntityId: sale.id,
        sourceLineId: line.id,
        idempotencyKey: `retail-sale:${sale.id}:${line.id}:reverse`,
        reason: input.reason,
      });
    }
    for (const tender of sale.tenders.filter((item) => item.status === "CONFIRMED")) {
      const account = await assertFinancialAccount(tx, organizationId, tender.financialAccountId, tender.currencyCode);
      const cashSession = account.accountType === "CASH" ? await assertOpenCashSession(tx, organizationId, account.id, actorUserId) : null;
      await applyAccountEffectTx(tx, { organizationId, actorUserId, account, effect: tender.amount.negated(), transactionType: "RETAIL_POS_REVERSAL", reference: sale.number, transactionDate: new Date(), cashSessionId: cashSession?.id, cashReason: input.reason });
    }
    await tx.enterpriseRetailTender.updateMany({ where: { organizationId, saleId: sale.id, status: "CONFIRMED" }, data: { status: "REVERSED" } });
    const updated = await tx.enterpriseRetailSale.update({ where: { id: sale.id }, data: { status: "REVERSED", reversalReason: input.reason, reversedAt: new Date(), reversedByUserId: actorUserId, revision: { increment: 1 } } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseRetailSale", entityId: sale.id, eventType: "RETAIL_POS_SALE_REVERSED", summary: `Ticket ${sale.number} annulé`, actorUserId, fromStatus: "COMPLETED", toStatus: "REVERSED", metadataJson: { reason: input.reason.slice(0, 500) } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

async function getRetailProviderTx(tx: Prisma.TransactionClient, organizationId: string, providerCode: string) {
  const provider = await tx.enterpriseRetailProvider.findFirst({ where: { organizationId, providerCode, isActive: true } });
  if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode });
  return provider;
}

export async function createMobileMoneyTransaction(organizationId: string, actorUserId: string, input: MobileMoneyInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseMobileMoneyTransaction.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) return { transaction: existing, idempotent: true };
    const provider = await getRetailProviderTx(tx, organizationId, input.providerCode);
    if (!["MOBILE_MONEY", "BOTH"].includes(provider.providerType)) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode: input.providerCode });
    const cashAccount = await assertFinancialAccount(tx, organizationId, input.cashAccountId, input.currencyCode, ["CASH"]);
    const resolvedFloatAccount = await resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, input.currencyCode);
    const floatAccount = resolvedFloatAccount.account;
    if (cashAccount.id === floatAccount.id) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409);
    const cashSession = await assertOpenCashSession(tx, organizationId, cashAccount.id, actorUserId);
    const principal = decimal(input.principalAmount);
    const cashFee = input.feeCollectionMode === "CASH" ? decimal(input.customerFeeAmount || 0) : decimal(0);
    const cashEffect = input.transactionType === "DEPOSIT" ? principal.plus(cashFee) : principal.negated().plus(cashFee);
    const floatEffect = input.transactionType === "DEPOSIT" ? principal.negated() : principal;
    const occurredAt = input.occurredAt || new Date();
    const number = retailReference("MM");
    const transaction = await tx.enterpriseMobileMoneyTransaction.create({ data: { organizationId, number, providerCode: provider.providerCode, transactionType: input.transactionType, customerPhone: input.customerPhone, currencyCode: input.currencyCode, principalAmount: principal, customerFeeAmount: decimal(input.customerFeeAmount || 0), providerCommissionAmount: decimal(input.providerCommissionAmount || 0), feeCollectionMode: input.feeCollectionMode, cashAccountId: cashAccount.id, floatAccountId: floatAccount.id, cashEffectAmount: cashEffect, floatEffectAmount: floatEffect, externalReference: input.externalReference || null, occurredAt, agentUserId: actorUserId, idempotencyKey: input.idempotencyKey } });
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: cashAccount, effect: cashEffect, transactionType: `MOBILE_MONEY_${input.transactionType}_CASH`, reference: number, transactionDate: occurredAt, cashSessionId: cashSession.id, cashReason: `${provider.label} ${input.transactionType}` });
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: floatAccount, effect: floatEffect, transactionType: `MOBILE_MONEY_${input.transactionType}_FLOAT`, reference: number, transactionDate: occurredAt });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseMobileMoneyTransaction", entityId: transaction.id, eventType: `MOBILE_MONEY_${input.transactionType}_CONFIRMED`, summary: `${provider.label} ${input.transactionType} ${number}`, actorUserId, toStatus: "CONFIRMED", metadataJson: { principal: principal.toFixed(), customerFee: transaction.customerFeeAmount.toFixed(), providerCommission: transaction.providerCommissionAmount.toFixed(), currency: input.currencyCode, cashAccountId: cashAccount.id, floatAccountId: floatAccount.id } });
    return { transaction, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function reverseMobileMoneyTransaction(organizationId: string, transactionId: string, actorUserId: string, input: RetailSaleReverseInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseMobileMoneyTransaction" WHERE id = ${transactionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const transaction = await tx.enterpriseMobileMoneyTransaction.findFirst({ where: { id: transactionId, organizationId } });
    if (!transaction) throw new EnterpriseRetailError("RETAIL_TRANSACTION_NOT_FOUND", 404);
    if (transaction.status === "REVERSED") return transaction;
    if (transaction.status !== "CONFIRMED" || transaction.revision !== input.revision) throw new EnterpriseRetailError("RETAIL_TRANSACTION_CONFLICT", 409);
    const cashAccount = await assertFinancialAccount(tx, organizationId, transaction.cashAccountId, transaction.currencyCode, ["CASH"]);
    const floatAccount = await assertFinancialAccount(tx, organizationId, transaction.floatAccountId, transaction.currencyCode, ["MOBILE_MONEY"]);
    const cashSession = await assertOpenCashSession(tx, organizationId, cashAccount.id, actorUserId);
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: cashAccount, effect: transaction.cashEffectAmount.negated(), transactionType: "MOBILE_MONEY_REVERSAL_CASH", reference: transaction.number, transactionDate: new Date(), cashSessionId: cashSession.id, cashReason: input.reason });
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: floatAccount, effect: transaction.floatEffectAmount.negated(), transactionType: "MOBILE_MONEY_REVERSAL_FLOAT", reference: transaction.number, transactionDate: new Date() });
    const updated = await tx.enterpriseMobileMoneyTransaction.update({ where: { id: transaction.id }, data: { status: "REVERSED", reversalReason: input.reason, reversedAt: new Date(), reversedByUserId: actorUserId, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseMobileMoneyTransaction", entityId: transaction.id, eventType: "MOBILE_MONEY_REVERSED", summary: `Opération ${transaction.number} annulée`, actorUserId, fromStatus: "CONFIRMED", toStatus: "REVERSED", metadataJson: { reason: input.reason.slice(0, 500) } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function createTelcoTopup(organizationId: string, actorUserId: string, input: TelcoTopupInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseTelcoTopup.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) return { topup: existing, idempotent: true };
    const provider = await getRetailProviderTx(tx, organizationId, input.providerCode);
    if (!["TELCO", "BOTH"].includes(provider.providerType)) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode: input.providerCode });
    const catalogItem = input.catalogItemId
      ? await tx.enterpriseCatalogItem.findFirst({ where: { id: input.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, currency: true } })
      : null;
    if (input.catalogItemId && !catalogItem) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409, { catalogItemId: input.catalogItemId });
    const tenderAccount = await assertFinancialAccount(tx, organizationId, input.tenderFinancialAccountId, input.currencyCode, ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"]);
    if (catalogItem?.currency && catalogItem.currency !== tenderAccount.currencyCode) throw new EnterpriseRetailError("RETAIL_CURRENCY_MISMATCH", 409, { catalogItemId: catalogItem.id });
    const operatorFloatAccount = (await resolveTelcoFloatAccountTx(tx, organizationId, provider, tenderAccount.currencyCode)).account;
    if (tenderAccount.id === operatorFloatAccount.id) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409);
    const cashSession = tenderAccount.accountType === "CASH" ? await assertOpenCashSession(tx, organizationId, tenderAccount.id, actorUserId) : null;
    const saleAmount = decimal(input.saleAmount);
    const operatorCost = decimal(input.operatorCost);
    const marginAmount = money(saleAmount.minus(operatorCost));
    const occurredAt = input.occurredAt || new Date();
    const number = retailReference("TEL");
    const topup = await tx.enterpriseTelcoTopup.create({ data: { organizationId, number, providerCode: provider.providerCode, destinationPhone: input.destinationPhone, catalogItemId: input.catalogItemId || null, offerLabel: input.offerLabel, currencyCode: input.currencyCode, saleAmount, operatorCost, marginAmount, tenderFinancialAccountId: tenderAccount.id, operatorFloatAccountId: operatorFloatAccount.id, externalReference: input.externalReference || null, status: input.status, failureReason: input.failureReason || null, occurredAt, agentUserId: actorUserId, idempotencyKey: input.idempotencyKey } });
    if (input.status === "SUCCESS") {
      await applyAccountEffectTx(tx, { organizationId, actorUserId, account: tenderAccount, effect: saleAmount, transactionType: "TELCO_TOPUP_TENDER", reference: number, transactionDate: occurredAt, cashSessionId: cashSession?.id, cashReason: `${provider.label} ${input.offerLabel}` });
      await applyAccountEffectTx(tx, { organizationId, actorUserId, account: operatorFloatAccount, effect: operatorCost.negated(), transactionType: "TELCO_TOPUP_FLOAT", reference: number, transactionDate: occurredAt });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseTelcoTopup", entityId: topup.id, eventType: "TELCO_TOPUP_SUCCESS", summary: `Recharge ${number} réussie`, actorUserId, toStatus: "SUCCESS", metadataJson: { saleAmount: saleAmount.toFixed(), operatorCost: operatorCost.toFixed(), margin: marginAmount.toFixed(), currency: input.currencyCode } });
    }
    return { topup, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function reverseTelcoTopup(organizationId: string, topupId: string, actorUserId: string, input: RetailSaleReverseInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseTelcoTopup" WHERE id = ${topupId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const topup = await tx.enterpriseTelcoTopup.findFirst({ where: { id: topupId, organizationId } });
    if (!topup) throw new EnterpriseRetailError("RETAIL_TOPUP_NOT_FOUND", 404);
    if (topup.status === "REVERSED") return topup;
    if (topup.status !== "SUCCESS" || topup.revision !== input.revision) throw new EnterpriseRetailError("RETAIL_TOPUP_CONFLICT", 409);
    const tenderAccount = await assertFinancialAccount(tx, organizationId, topup.tenderFinancialAccountId, topup.currencyCode);
    const operatorFloatAccount = await assertFinancialAccount(tx, organizationId, topup.operatorFloatAccountId, topup.currencyCode);
    const cashSession = tenderAccount.accountType === "CASH" ? await assertOpenCashSession(tx, organizationId, tenderAccount.id, actorUserId) : null;
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: tenderAccount, effect: topup.saleAmount.negated(), transactionType: "TELCO_TOPUP_REVERSAL_TENDER", reference: topup.number, transactionDate: new Date(), cashSessionId: cashSession?.id, cashReason: input.reason });
    await applyAccountEffectTx(tx, { organizationId, actorUserId, account: operatorFloatAccount, effect: topup.operatorCost, transactionType: "TELCO_TOPUP_REVERSAL_FLOAT", reference: topup.number, transactionDate: new Date() });
    const updated = await tx.enterpriseTelcoTopup.update({ where: { id: topup.id }, data: { status: "REVERSED", reversalReason: input.reason, reversedAt: new Date(), reversedByUserId: actorUserId, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseTelcoTopup", entityId: topup.id, eventType: "TELCO_TOPUP_REVERSED", summary: `Recharge ${topup.number} annulée`, actorUserId, fromStatus: "SUCCESS", toStatus: "REVERSED", metadataJson: { reason: input.reason.slice(0, 500) } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function createRetailDailyClose(organizationId: string, actorUserId: string, input: RetailCloseInput) {
  return prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await ensureRetailConfigurationTx(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseRetailDailyClose.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { lines: true } });
    if (existing) return { close: existing, idempotent: true };
    const seen = new Set<string>();
    const preparedLines: Array<{ financialAccountId: string; accountType: string; currencyCode: string; cashSessionId: string | null; systemClosingBalance: Prisma.Decimal; declaredBalance: Prisma.Decimal; differenceAmount: Prisma.Decimal; varianceReason: string | null; countDetailsJson?: Prisma.InputJsonValue }> = [];
    for (const line of input.lines) {
      if (seen.has(line.financialAccountId)) throw new EnterpriseRetailError("RETAIL_DUPLICATE", 409);
      seen.add(line.financialAccountId);
      const account = await tx.enterpriseFinancialAccount.findFirst({ where: { id: line.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!account || account.accountType !== line.accountType) throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409, { financialAccountId: line.financialAccountId });
      const declared = money(decimal(line.declaredBalance));
      if (account.accountType === "CASH") {
        await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashSession" WHERE "organizationId" = ${organizationId} AND "financialAccountId" = ${account.id} AND "cashierUserId" = ${actorUserId} AND status = 'OPEN' FOR UPDATE`);
        const cashSession = await tx.enterpriseCashSession.findFirst({ where: { organizationId, financialAccountId: account.id, cashierUserId: actorUserId, status: "OPEN" }, include: { movements: true } });
        if (!cashSession) throw new EnterpriseRetailError("RETAIL_OPEN_CASH_SESSION_REQUIRED", 409, { financialAccountId: account.id });
        const inflows = sumDecimals(cashSession.movements.filter((movement) => movement.direction === "INBOUND").map((movement) => movement.amount));
        const outflows = sumDecimals(cashSession.movements.filter((movement) => movement.direction === "OUTBOUND").map((movement) => movement.amount));
        const expected = money(cashSession.openingAmount.plus(inflows).minus(outflows));
        const countTotal = money(sumDecimals(line.denominations.map((count) => decimal(count.denomination).times(count.quantity))));
        if (!countTotal.equals(declared)) throw new EnterpriseRetailError("RETAIL_CASH_COUNT_TOTAL_MISMATCH", 409, { financialAccountId: account.id, countTotal: countTotal.toFixed(), declared: declared.toFixed() });
        const difference = money(declared.minus(expected));
        if (!difference.isZero() && !line.varianceReason) throw new EnterpriseRetailError("RETAIL_VARIANCE_REASON_REQUIRED", 409, { financialAccountId: account.id, difference: difference.toFixed() });
        await tx.enterpriseCashCount.deleteMany({ where: { organizationId, cashSessionId: cashSession.id } });
        if (line.denominations.length) await tx.enterpriseCashCount.createMany({ data: line.denominations.map((count) => ({ organizationId, cashSessionId: cashSession.id, denomination: decimal(count.denomination), quantity: count.quantity, amount: decimal(count.denomination).times(count.quantity), countedByUserId: actorUserId })) });
        if (!difference.isZero()) await tx.enterpriseCashDiscrepancy.create({ data: { organizationId, cashSessionId: cashSession.id, amount: difference, reason: line.varianceReason as string, createdByUserId: actorUserId } });
        await tx.enterpriseCashSession.update({ where: { id: cashSession.id }, data: { status: "PENDING_VALIDATION", expectedClosingAmount: expected, countedClosingAmount: declared, discrepancyAmount: difference, closingReason: line.varianceReason || null, submittedAt: new Date(), revision: { increment: 1 } } });
        preparedLines.push({ financialAccountId: account.id, accountType: account.accountType, currencyCode: account.currencyCode, cashSessionId: cashSession.id, systemClosingBalance: expected, declaredBalance: declared, differenceAmount: difference, varianceReason: line.varianceReason || null, countDetailsJson: line.denominations as Prisma.InputJsonValue });
      } else {
        const expected = money(account.operationalBalance);
        const difference = money(declared.minus(expected));
        if (!difference.isZero() && !line.varianceReason) throw new EnterpriseRetailError("RETAIL_VARIANCE_REASON_REQUIRED", 409, { financialAccountId: account.id, difference: difference.toFixed() });
        preparedLines.push({ financialAccountId: account.id, accountType: account.accountType, currencyCode: account.currencyCode, cashSessionId: null, systemClosingBalance: expected, declaredBalance: declared, differenceAmount: difference, varianceReason: line.varianceReason || null });
      }
    }
    const close = await tx.enterpriseRetailDailyClose.create({ data: { organizationId, number: retailReference("CLOSE"), businessDate: input.businessDate, siteId: input.siteId || null, status: "SUBMITTED", submittedByUserId: actorUserId, notes: input.notes || null, idempotencyKey: input.idempotencyKey, lines: { create: preparedLines } }, include: { lines: true } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseRetailDailyClose", entityId: close.id, eventType: "RETAIL_DAILY_CLOSE_SUBMITTED", summary: `Clôture ${close.number} soumise`, actorUserId, toStatus: "SUBMITTED", metadataJson: { businessDate: close.businessDate.toISOString(), lineCount: close.lines.length, totalVariance: money(sumDecimals(close.lines.map((line) => line.differenceAmount.abs()))).toFixed() } });
    return { close, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function decideRetailDailyClose(organizationId: string, closeId: string, actorUserId: string, input: RetailCloseDecisionInput) {
  const result = await prisma.$transaction(async (tx) => {
    await assertRetailOrganization(tx, organizationId);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailDailyClose" WHERE id = ${closeId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const close = await tx.enterpriseRetailDailyClose.findFirst({ where: { id: closeId, organizationId }, include: { lines: true } });
    if (!close) throw new EnterpriseRetailError("RETAIL_CLOSE_NOT_FOUND", 404);
    if (close.submittedByUserId === actorUserId) throw new EnterpriseRetailError("RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN", 409);
    if (close.status !== "SUBMITTED" || close.revision !== input.revision) throw new EnterpriseRetailError("RETAIL_CLOSE_CONFLICT", 409);
    const discrepancyIds: string[] = [];
    for (const line of close.lines.filter((item) => item.cashSessionId)) {
      const cashSession = await tx.enterpriseCashSession.findFirst({ where: { id: line.cashSessionId as string, organizationId }, include: { discrepancies: true } });
      if (!cashSession || cashSession.status !== "PENDING_VALIDATION" || cashSession.cashierUserId !== close.submittedByUserId) throw new EnterpriseRetailError("RETAIL_CLOSE_CONFLICT", 409, { cashSessionId: line.cashSessionId });
      if (input.decision === "APPROVE") {
        await tx.enterpriseCashDiscrepancy.updateMany({ where: { organizationId, cashSessionId: cashSession.id, status: "PENDING" }, data: { status: "APPROVED", approvedByUserId: actorUserId } });
        discrepancyIds.push(...cashSession.discrepancies.filter((item) => !item.amount.isZero()).map((item) => item.id));
      }
      await tx.enterpriseCashSession.update({ where: { id: cashSession.id }, data: input.decision === "APPROVE" ? { status: "CLOSED", validatedByUserId: actorUserId, validatedAt: new Date(), revision: { increment: 1 } } : { status: "REJECTED", rejectedAt: new Date(), revision: { increment: 1 } } });
    }
    const nextStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseRetailDailyClose.update({ where: { id: close.id }, data: { status: nextStatus, validatedByUserId: actorUserId, validatedAt: input.decision === "APPROVE" ? new Date() : null, rejectedAt: input.decision === "REJECT" ? new Date() : null, rejectionReason: input.decision === "REJECT" ? input.reason || null : null, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseRetailDailyClose", entityId: close.id, eventType: `RETAIL_DAILY_CLOSE_${nextStatus}`, summary: `Clôture ${close.number}: ${nextStatus}`, actorUserId, fromStatus: close.status, toStatus: nextStatus, metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined });
    return { updated, discrepancyIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  if (input.decision === "APPROVE") {
    for (const discrepancyId of result.discrepancyIds) await postBusinessEvent(organizationId, actorUserId, { postingEvent: "CASH_VARIANCE_POSTED", sourceEntityType: "EnterpriseCashDiscrepancy", sourceEntityId: discrepancyId });
  }
  return result.updated;
}

export async function getRetailDashboard(organizationId: string, from?: Date, to?: Date) {
  const dateFrom = from || new Date(new Date().setHours(0, 0, 0, 0));
  const dateTo = to || new Date();
  const dateFilter = { gte: dateFrom, lte: dateTo };
  const [configuration, providers, accounts, warehouses, catalogItems, inventoryItems, sales, mobileMoney, topups, closes] = await Promise.all([
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId } }),
    prisma.enterpriseRetailProvider.findMany({ where: { organizationId, isActive: true }, orderBy: { label: "asc" } }),
    prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, accountType: { in: ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"] } }, orderBy: [{ accountType: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true, siteId: true } }),
    prisma.enterpriseWarehouse.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, include: { site: { select: { id: true, name: true } }, storageLocations: { where: { status: "ACTIVE", archivedAt: null }, select: { id: true, code: true, name: true } } } }),
    prisma.enterpriseCatalogItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: { name: "asc" }, take: 400, select: { id: true, code: true, sku: true, name: true, itemType: true, indicativeSalePrice: true, indicativeCost: true, currency: true, trackInventory: true } }),
    prisma.enterpriseInventoryItem.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, catalogItemId: true, balances: { select: { warehouseId: true, storageLocationId: true, stockLotId: true, quantityOnHand: true, quantityReserved: true } } } }),
    prisma.enterpriseRetailSale.findMany({ where: { organizationId, soldAt: dateFilter }, orderBy: { soldAt: "desc" }, take: 100, include: { lines: true, tenders: true } }),
    prisma.enterpriseMobileMoneyTransaction.findMany({ where: { organizationId, occurredAt: dateFilter }, orderBy: { occurredAt: "desc" }, take: 100 }),
    prisma.enterpriseTelcoTopup.findMany({ where: { organizationId, occurredAt: dateFilter }, orderBy: { occurredAt: "desc" }, take: 100 }),
    prisma.enterpriseRetailDailyClose.findMany({ where: { organizationId, businessDate: dateFilter }, orderBy: { businessDate: "desc" }, take: 30, include: { lines: true } }),
  ]);
  const activeSales = sales.filter((item) => item.status === "COMPLETED");
  const confirmedMobile = mobileMoney.filter((item) => item.status === "CONFIRMED");
  const successfulTopups = topups.filter((item) => item.status === "SUCCESS");
  return {
    configuration,
    providers,
    accounts,
    warehouses,
    catalogItems,
    inventoryItems,
    metrics: {
      salesCount: activeSales.length,
      salesRevenue: money(sumDecimals(activeSales.map((item) => item.grandTotal))).toFixed(),
      mobileMoneyDeposits: money(sumDecimals(confirmedMobile.filter((item) => item.transactionType === "DEPOSIT").map((item) => item.principalAmount))).toFixed(),
      mobileMoneyWithdrawals: money(sumDecimals(confirmedMobile.filter((item) => item.transactionType === "WITHDRAWAL").map((item) => item.principalAmount))).toFixed(),
      mobileMoneyCommission: money(sumDecimals(confirmedMobile.map((item) => item.providerCommissionAmount))).toFixed(),
      topupRevenue: money(sumDecimals(successfulTopups.map((item) => item.saleAmount))).toFixed(),
      topupMargin: money(sumDecimals(successfulTopups.map((item) => item.marginAmount))).toFixed(),
      pendingCloses: closes.filter((item) => item.status === "SUBMITTED").length,
    },
    recent: {
      sales,
      mobileMoney: mobileMoney.map((item) => ({ ...item, customerPhoneMasked: phoneForList(item.customerPhone) })),
      topups: topups.map((item) => ({ ...item, destinationPhoneMasked: phoneForList(item.destinationPhone) })),
      closes,
    },
    range: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
  };
}