import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  RETAIL_PAYMENT_TRANSITIONS,
  RETAIL_PROVIDER_OPERATION_TRANSITIONS,
} from "@/lib/enterprise/retail/constants";
import type {
  retailCustomerProfileUpsertSchema,
  retailDeviceProfileUpsertSchema,
  retailLoyaltyEarnSchema,
  retailLoyaltyProgramUpsertSchema,
  retailLoyaltyRedeemSchema,
  retailPaymentCreateSchema,
  retailPaymentTransitionSchema,
  retailProviderIntegrationUpsertSchema,
  retailProviderOperationCreateSchema,
  retailProviderOperationTransitionSchema,
  retailStoredValueIssueSchema,
  retailStoredValueRedeemSchema,
  retailStoredValueRefundSchema,
  retailWebhookEventSchema,
} from "@/lib/enterprise/retail/customer-payments-schemas";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type CustomerProfileInput = z.infer<typeof retailCustomerProfileUpsertSchema>;
type LoyaltyProgramInput = z.infer<typeof retailLoyaltyProgramUpsertSchema>;
type LoyaltyEarnInput = z.infer<typeof retailLoyaltyEarnSchema>;
type LoyaltyRedeemInput = z.infer<typeof retailLoyaltyRedeemSchema>;
type StoredValueIssueInput = z.infer<typeof retailStoredValueIssueSchema>;
type StoredValueRedeemInput = z.infer<typeof retailStoredValueRedeemSchema>;
type StoredValueRefundInput = z.infer<typeof retailStoredValueRefundSchema>;
type ProviderIntegrationInput = z.infer<typeof retailProviderIntegrationUpsertSchema>;
type ProviderOperationCreateInput = z.infer<typeof retailProviderOperationCreateSchema>;
type ProviderOperationTransitionInput = z.infer<typeof retailProviderOperationTransitionSchema>;
type PaymentCreateInput = z.infer<typeof retailPaymentCreateSchema>;
type PaymentTransitionInput = z.infer<typeof retailPaymentTransitionSchema>;
type WebhookEventInput = z.infer<typeof retailWebhookEventSchema>;
type DeviceProfileInput = z.infer<typeof retailDeviceProfileUpsertSchema>;

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function customerNumber() {
  return `CUS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function hashStoredValueCode(value: string) {
  return createHash("sha256").update(value.trim().toUpperCase(), "utf8").digest("hex");
}

function generateStoredValueCode() {
  const raw = randomBytes(18).toString("base64url").toUpperCase();
  return `DTSC-${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 18)}`;
}

function storedValueDisplayCode(code: string) {
  const compact = code.replace(/[^A-Z0-9]/gi, "");
  return `••••-${compact.slice(-4).toUpperCase()}`;
}

function assertTransition(current: string, next: string, map: Record<string, readonly string[]>, code: string) {
  if (current === next) return;
  if (!(map[current] || []).includes(next)) throw new EnterpriseRetailError(code, 409, { current, next });
}

async function assertCustomerPartyTx(tx: Prisma.TransactionClient, organizationId: string, businessPartyId: string) {
  const party = await tx.enterpriseBusinessParty.findFirst({
    where: {
      id: businessPartyId,
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
    },
    select: { id: true, legalName: true, displayName: true, primaryEmail: true, primaryPhone: true },
  });
  if (!party) throw new EnterpriseRetailError("RETAIL_CUSTOMER_INVALID", 409, { businessPartyId });
  return party;
}

async function assertSaleTx(tx: Prisma.TransactionClient, organizationId: string, saleId: string | null | undefined) {
  if (!saleId) return null;
  const sale = await tx.enterpriseRetailSale.findFirst({ where: { id: saleId, organizationId }, select: { id: true, customerBusinessPartyId: true, currencyCode: true, grandTotal: true, status: true } });
  if (!sale) throw new EnterpriseRetailError("RETAIL_SALE_NOT_FOUND", 404);
  return sale;
}

async function assertReturnTx(tx: Prisma.TransactionClient, organizationId: string, returnId: string | null | undefined) {
  if (!returnId) return null;
  const retailReturn = await tx.enterpriseRetailReturn.findFirst({ where: { id: returnId, organizationId }, select: { id: true, saleId: true, currencyCode: true, grandTotal: true, status: true } });
  if (!retailReturn) throw new EnterpriseRetailError("RETAIL_RETURN_NOT_FOUND", 404);
  return retailReturn;
}

async function assertProviderTx(tx: Prisma.TransactionClient, organizationId: string, providerId: string) {
  const provider = await tx.enterpriseRetailProvider.findFirst({ where: { id: providerId, organizationId, isActive: true }, select: { id: true, providerCode: true, providerType: true, label: true } });
  if (!provider) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerId });
  return provider;
}

export async function listRetailCustomers(organizationId: string, search = "", page = 1, pageSize = 20) {
  const q = search.trim();
  const where: Prisma.EnterpriseBusinessPartyWhereInput = {
    organizationId,
    status: "ACTIVE",
    archivedAt: null,
    roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } },
    ...(q ? {
      OR: [
        { legalName: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { primaryEmail: { contains: q, mode: "insensitive" } },
        { primaryPhone: { contains: q, mode: "insensitive" } },
        { contacts: { some: { normalizedValue: { contains: q, mode: "insensitive" }, status: "ACTIVE", archivedAt: null } } },
      ],
    } : {}),
  };
  const [parties, total] = await Promise.all([
    prisma.enterpriseBusinessParty.findMany({
      where,
      orderBy: [{ legalName: "asc" }, { createdAt: "desc" }],
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        legalName: true,
        displayName: true,
        primaryEmail: true,
        primaryPhone: true,
        partyType: true,
        createdAt: true,
      },
    }),
    prisma.enterpriseBusinessParty.count({ where }),
  ]);
  const profiles = parties.length
    ? await prisma.enterpriseRetailCustomerProfile.findMany({ where: { organizationId, businessPartyId: { in: parties.map((party) => party.id) }, archivedAt: null } })
    : [];
  const profileByParty = new Map(profiles.map((profile) => [profile.businessPartyId, profile]));
  return {
    items: parties.map((party) => ({ ...party, retailProfile: profileByParty.get(party.id) || null })),
    pagination: { page: Math.max(1, page), pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function upsertRetailCustomerProfile(organizationId: string, actorUserId: string, input: CustomerProfileInput) {
  return prisma.$transaction(async (tx) => {
    await assertCustomerPartyTx(tx, organizationId, input.businessPartyId);
    const existing = await tx.enterpriseRetailCustomerProfile.findFirst({ where: { organizationId, businessPartyId: input.businessPartyId } });
    if (existing) {
      return tx.enterpriseRetailCustomerProfile.update({
        where: { id: existing.id },
        data: {
          segmentCode: input.segmentCode || null,
          priceListCode: input.priceListCode || null,
          preferredLocale: input.preferredLocale || null,
          preferredCurrencyCode: input.preferredCurrencyCode || null,
          status: input.status,
          notes: input.notes || null,
          updatedByUserId: actorUserId,
          revision: { increment: 1 },
        },
      });
    }
    return tx.enterpriseRetailCustomerProfile.create({
      data: {
        organizationId,
        businessPartyId: input.businessPartyId,
        customerNumber: input.customerNumber || customerNumber(),
        segmentCode: input.segmentCode || null,
        priceListCode: input.priceListCode || null,
        preferredLocale: input.preferredLocale || null,
        preferredCurrencyCode: input.preferredCurrencyCode || null,
        status: input.status,
        notes: input.notes || null,
        createdByUserId: actorUserId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function listRetailLoyaltyPrograms(organizationId: string) {
  return prisma.enterpriseRetailLoyaltyProgram.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ status: "asc" }, { code: "asc" }] });
}

export async function upsertRetailLoyaltyProgram(organizationId: string, actorUserId: string, input: LoyaltyProgramInput) {
  return prisma.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.enterpriseRetailLoyaltyProgram.findFirst({ where: { id: input.id, organizationId, archivedAt: null } });
      if (!existing) throw new EnterpriseRetailError("RETAIL_LOYALTY_PROGRAM_NOT_FOUND", 404);
      return tx.enterpriseRetailLoyaltyProgram.update({
        where: { id: existing.id },
        data: {
          code: input.code,
          nameFr: input.nameFr,
          nameEn: input.nameEn,
          currencyCode: input.currencyCode,
          earnPointsPerCurrencyUnit: decimal(input.earnPointsPerCurrencyUnit),
          redeemValuePerPoint: decimal(input.redeemValuePerPoint),
          minimumRedeemPoints: decimal(input.minimumRedeemPoints),
          status: input.status,
          startsAt: input.startsAt || null,
          endsAt: input.endsAt || null,
          settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : Prisma.JsonNull,
          updatedByUserId: actorUserId,
          revision: { increment: 1 },
        },
      });
    }
    return tx.enterpriseRetailLoyaltyProgram.create({
      data: {
        organizationId,
        code: input.code,
        nameFr: input.nameFr,
        nameEn: input.nameEn,
        currencyCode: input.currencyCode,
        earnPointsPerCurrencyUnit: decimal(input.earnPointsPerCurrencyUnit),
        redeemValuePerPoint: decimal(input.redeemValuePerPoint),
        minimumRedeemPoints: decimal(input.minimumRedeemPoints),
        status: input.status,
        startsAt: input.startsAt || null,
        endsAt: input.endsAt || null,
        settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : undefined,
        createdByUserId: actorUserId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function getActiveLoyaltyProgramTx(tx: Prisma.TransactionClient, organizationId: string, programId: string) {
  const now = new Date();
  const program = await tx.enterpriseRetailLoyaltyProgram.findFirst({
    where: {
      id: programId,
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
  });
  if (!program) throw new EnterpriseRetailError("RETAIL_LOYALTY_PROGRAM_INACTIVE", 409, { programId });
  return program;
}

async function ensureLoyaltyAccountTx(tx: Prisma.TransactionClient, organizationId: string, programId: string, customerBusinessPartyId: string) {
  await assertCustomerPartyTx(tx, organizationId, customerBusinessPartyId);
  let account = await tx.enterpriseRetailLoyaltyAccount.findFirst({ where: { organizationId, programId, customerBusinessPartyId } });
  if (!account) {
    account = await tx.enterpriseRetailLoyaltyAccount.create({ data: { organizationId, programId, customerBusinessPartyId } });
  }
  if (account.status !== "ACTIVE") throw new EnterpriseRetailError("RETAIL_LOYALTY_ACCOUNT_INACTIVE", 409, { accountId: account.id });
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailLoyaltyAccount" WHERE id = ${account.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
  return tx.enterpriseRetailLoyaltyAccount.findFirstOrThrow({ where: { id: account.id, organizationId } });
}

export async function earnRetailLoyaltyPoints(organizationId: string, actorUserId: string, input: LoyaltyEarnInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailLoyaltyEntry.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const account = await tx.enterpriseRetailLoyaltyAccount.findFirstOrThrow({ where: { id: existing.accountId, organizationId } });
      return { account, entry: existing, idempotent: true };
    }
    const program = await getActiveLoyaltyProgramTx(tx, organizationId, input.programId);
    if (input.currencyCode && input.currencyCode !== program.currencyCode) throw new EnterpriseRetailError("RETAIL_LOYALTY_CURRENCY_MISMATCH", 409);
    const sale = await assertSaleTx(tx, organizationId, input.saleId);
    if (sale?.customerBusinessPartyId && sale.customerBusinessPartyId !== input.customerBusinessPartyId) throw new EnterpriseRetailError("RETAIL_LOYALTY_CUSTOMER_MISMATCH", 409);
    const account = await ensureLoyaltyAccountTx(tx, organizationId, program.id, input.customerBusinessPartyId);
    const pointAmount = decimal(input.points);
    const entry = await tx.enterpriseRetailLoyaltyEntry.create({
      data: {
        organizationId,
        accountId: account.id,
        entryType: "EARN",
        points: pointAmount,
        monetaryAmount: input.monetaryAmount == null ? null : decimal(input.monetaryAmount),
        currencyCode: input.currencyCode || program.currencyCode,
        saleId: input.saleId || null,
        reason: input.reason || null,
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt || null,
        createdByUserId: actorUserId,
      },
    });
    const updated = await tx.enterpriseRetailLoyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { increment: pointAmount }, lifetimeEarned: { increment: pointAmount }, revision: { increment: 1 } } });
    return { account: updated, entry, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function redeemRetailLoyaltyPoints(organizationId: string, actorUserId: string, input: LoyaltyRedeemInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailLoyaltyEntry.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const account = await tx.enterpriseRetailLoyaltyAccount.findFirstOrThrow({ where: { id: existing.accountId, organizationId } });
      return { account, entry: existing, idempotent: true };
    }
    const program = await getActiveLoyaltyProgramTx(tx, organizationId, input.programId);
    if (input.currencyCode && input.currencyCode !== program.currencyCode) throw new EnterpriseRetailError("RETAIL_LOYALTY_CURRENCY_MISMATCH", 409);
    const sale = await assertSaleTx(tx, organizationId, input.saleId);
    if (sale?.customerBusinessPartyId && sale.customerBusinessPartyId !== input.customerBusinessPartyId) throw new EnterpriseRetailError("RETAIL_LOYALTY_CUSTOMER_MISMATCH", 409);
    const account = await ensureLoyaltyAccountTx(tx, organizationId, program.id, input.customerBusinessPartyId);
    const pointAmount = decimal(input.points);
    if (pointAmount.lessThan(program.minimumRedeemPoints) || account.pointsBalance.lessThan(pointAmount)) {
      throw new EnterpriseRetailError("RETAIL_LOYALTY_BALANCE_INSUFFICIENT", 409, { available: account.pointsBalance.toFixed(), requested: pointAmount.toFixed() });
    }
    const entry = await tx.enterpriseRetailLoyaltyEntry.create({
      data: {
        organizationId,
        accountId: account.id,
        entryType: "REDEEM",
        points: pointAmount.negated(),
        monetaryAmount: input.monetaryAmount == null ? pointAmount.times(program.redeemValuePerPoint) : decimal(input.monetaryAmount),
        currencyCode: input.currencyCode || program.currencyCode,
        saleId: input.saleId || null,
        reason: input.reason || null,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: actorUserId,
      },
    });
    const updated = await tx.enterpriseRetailLoyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { decrement: pointAmount }, lifetimeRedeemed: { increment: pointAmount }, revision: { increment: 1 } } });
    return { account: updated, entry, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function issueRetailStoredValue(organizationId: string, actorUserId: string, input: StoredValueIssueInput) {
  return prisma.$transaction(async (tx) => {
    const priorEntry = await tx.enterpriseRetailStoredValueEntry.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (priorEntry) {
      const account = await tx.enterpriseRetailStoredValueAccount.findFirstOrThrow({ where: { id: priorEntry.accountId, organizationId } });
      return { account, code: null, idempotent: true };
    }
    if (input.customerBusinessPartyId) await assertCustomerPartyTx(tx, organizationId, input.customerBusinessPartyId);
    if (input.expiresAt && input.expiresAt <= new Date()) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_EXPIRY_INVALID", 409);
    const bearerCode = generateStoredValueCode();
    const initialValue = decimal(input.initialValue);
    const account = await tx.enterpriseRetailStoredValueAccount.create({
      data: {
        organizationId,
        accountType: input.accountType,
        lookupHash: hashStoredValueCode(bearerCode),
        displayCode: storedValueDisplayCode(bearerCode),
        customerBusinessPartyId: input.customerBusinessPartyId || null,
        currencyCode: input.currencyCode,
        initialValue,
        balance: initialValue,
        expiresAt: input.expiresAt || null,
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseRetailStoredValueEntry.create({
      data: { organizationId, accountId: account.id, entryType: "ISSUE", amount: initialValue, reason: `Issue ${input.accountType}`, idempotencyKey: input.idempotencyKey, createdByUserId: actorUserId },
    });
    return { account, code: bearerCode, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function redeemRetailStoredValue(organizationId: string, actorUserId: string, input: StoredValueRedeemInput) {
  return prisma.$transaction(async (tx) => {
    const priorEntry = await tx.enterpriseRetailStoredValueEntry.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (priorEntry) {
      const account = await tx.enterpriseRetailStoredValueAccount.findFirstOrThrow({ where: { id: priorEntry.accountId, organizationId } });
      return { account, entry: priorEntry, idempotent: true };
    }
    const account = await tx.enterpriseRetailStoredValueAccount.findFirst({ where: { organizationId, lookupHash: hashStoredValueCode(input.code), archivedAt: null } });
    if (!account) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_NOT_FOUND", 404);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailStoredValueAccount" WHERE id = ${account.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const locked = await tx.enterpriseRetailStoredValueAccount.findFirstOrThrow({ where: { id: account.id, organizationId } });
    if (locked.status !== "ACTIVE") throw new EnterpriseRetailError("RETAIL_STORED_VALUE_INACTIVE", 409, { status: locked.status });
    if (locked.expiresAt && locked.expiresAt <= new Date()) {
      await tx.enterpriseRetailStoredValueAccount.update({ where: { id: locked.id }, data: { status: "EXPIRED", revision: { increment: 1 } } });
      throw new EnterpriseRetailError("RETAIL_STORED_VALUE_EXPIRED", 409);
    }
    if (locked.currencyCode !== input.currencyCode) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_CURRENCY_MISMATCH", 409);
    if (input.saleId) await assertSaleTx(tx, organizationId, input.saleId);
    const amount = decimal(input.amount);
    if (locked.balance.lessThan(amount)) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_INSUFFICIENT", 409, { available: locked.balance.toFixed(), requested: amount.toFixed() });
    const entry = await tx.enterpriseRetailStoredValueEntry.create({
      data: { organizationId, accountId: locked.id, entryType: "REDEEM", amount: amount.negated(), saleId: input.saleId || null, reason: input.reason || null, idempotencyKey: input.idempotencyKey, createdByUserId: actorUserId },
    });
    const remaining = locked.balance.minus(amount);
    const updated = await tx.enterpriseRetailStoredValueAccount.update({ where: { id: locked.id }, data: { balance: remaining, status: remaining.isZero() ? "EXHAUSTED" : "ACTIVE", revision: { increment: 1 } } });
    return { account: updated, entry, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function refundRetailStoredValue(organizationId: string, actorUserId: string, input: StoredValueRefundInput) {
  return prisma.$transaction(async (tx) => {
    const priorEntry = await tx.enterpriseRetailStoredValueEntry.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (priorEntry) {
      const account = await tx.enterpriseRetailStoredValueAccount.findFirstOrThrow({ where: { id: priorEntry.accountId, organizationId } });
      return { account, entry: priorEntry, idempotent: true };
    }
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailStoredValueAccount" WHERE id = ${input.accountId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const account = await tx.enterpriseRetailStoredValueAccount.findFirst({ where: { id: input.accountId, organizationId, archivedAt: null } });
    if (!account) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_NOT_FOUND", 404);
    if (account.currencyCode !== input.currencyCode) throw new EnterpriseRetailError("RETAIL_STORED_VALUE_CURRENCY_MISMATCH", 409);
    if (input.returnId) await assertReturnTx(tx, organizationId, input.returnId);
    const amount = decimal(input.amount);
    const entry = await tx.enterpriseRetailStoredValueEntry.create({
      data: { organizationId, accountId: account.id, entryType: "REFUND", amount, returnId: input.returnId || null, reason: input.reason, idempotencyKey: input.idempotencyKey, createdByUserId: actorUserId },
    });
    const updated = await tx.enterpriseRetailStoredValueAccount.update({ where: { id: account.id }, data: { balance: { increment: amount }, status: "ACTIVE", revision: { increment: 1 } } });
    return { account: updated, entry, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function listRetailStoredValueAccounts(organizationId: string, customerBusinessPartyId?: string | null) {
  return prisma.enterpriseRetailStoredValueAccount.findMany({
    where: { organizationId, archivedAt: null, ...(customerBusinessPartyId ? { customerBusinessPartyId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, accountType: true, displayCode: true, customerBusinessPartyId: true, currencyCode: true, initialValue: true, balance: true, status: true, expiresAt: true, revision: true, createdAt: true, updatedAt: true },
  });
}

export async function upsertRetailProviderIntegration(organizationId: string, actorUserId: string, input: ProviderIntegrationInput) {
  return prisma.$transaction(async (tx) => {
    await assertProviderTx(tx, organizationId, input.providerId);
    const existing = await tx.enterpriseRetailProviderIntegration.findFirst({ where: { organizationId, providerId: input.providerId, archivedAt: null } });
    if (existing) {
      return tx.enterpriseRetailProviderIntegration.update({
        where: { id: existing.id },
        data: {
          integrationMode: input.integrationMode,
          adapterCode: input.adapterCode || null,
          credentialReference: input.credentialReference || null,
          webhookSecretReference: input.webhookSecretReference || null,
          connectionStatus: input.connectionStatus,
          settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : Prisma.JsonNull,
          updatedByUserId: actorUserId,
          revision: { increment: 1 },
        },
      });
    }
    return tx.enterpriseRetailProviderIntegration.create({
      data: {
        organizationId,
        providerId: input.providerId,
        integrationMode: input.integrationMode,
        adapterCode: input.adapterCode || null,
        credentialReference: input.credentialReference || null,
        webhookSecretReference: input.webhookSecretReference || null,
        connectionStatus: input.connectionStatus,
        settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : undefined,
        createdByUserId: actorUserId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createRetailProviderOperation(organizationId: string, actorUserId: string, input: ProviderOperationCreateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailProviderOperation.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) return { operation: existing, idempotent: true };
    await assertProviderTx(tx, organizationId, input.providerId);
    if (input.sourceEntityType === "EnterpriseRetailPaymentTransaction") {
      const payment = await tx.enterpriseRetailPaymentTransaction.findFirst({ where: { id: input.sourceEntityId, organizationId } });
      if (!payment) throw new EnterpriseRetailError("RETAIL_PAYMENT_NOT_FOUND", 404);
    } else if (input.sourceEntityType === "EnterpriseMobileMoneyTransaction") {
      const transaction = await tx.enterpriseMobileMoneyTransaction.findFirst({ where: { id: input.sourceEntityId, organizationId } });
      if (!transaction) throw new EnterpriseRetailError("RETAIL_TRANSACTION_NOT_FOUND", 404);
    } else {
      const topup = await tx.enterpriseTelcoTopup.findFirst({ where: { id: input.sourceEntityId, organizationId } });
      if (!topup) throw new EnterpriseRetailError("RETAIL_TRANSACTION_NOT_FOUND", 404);
    }
    const operation = await tx.enterpriseRetailProviderOperation.create({
      data: {
        organizationId,
        providerId: input.providerId,
        operationType: input.operationType,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        currencyCode: input.currencyCode || null,
        amount: input.amount == null ? null : decimal(input.amount),
        externalReference: input.externalReference || null,
        idempotencyKey: input.idempotencyKey,
        timeoutAt: input.timeoutAt || null,
        createdByUserId: actorUserId,
      },
    });
    return { operation, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

async function transitionProviderOperationTx(tx: Prisma.TransactionClient, organizationId: string, operationId: string, input: ProviderOperationTransitionInput) {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailProviderOperation" WHERE id = ${operationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const operation = await tx.enterpriseRetailProviderOperation.findFirst({ where: { id: operationId, organizationId } });
  if (!operation) throw new EnterpriseRetailError("RETAIL_PROVIDER_OPERATION_NOT_FOUND", 404);
  if (operation.revision !== input.revision) throw new EnterpriseRetailError("RETAIL_PROVIDER_OPERATION_CONFLICT", 409);
  assertTransition(operation.status, input.status, RETAIL_PROVIDER_OPERATION_TRANSITIONS, "RETAIL_PROVIDER_OPERATION_TRANSITION_INVALID");
  if (operation.status === input.status) return operation;
  return tx.enterpriseRetailProviderOperation.update({
    where: { id: operation.id },
    data: {
      status: input.status,
      externalReference: input.externalReference || operation.externalReference,
      lastErrorCode: input.errorCode || null,
      lastErrorMessage: input.errorMessage || null,
      confirmedAt: input.status === "CONFIRMED" ? new Date() : operation.confirmedAt,
      reconciledAt: input.status === "RECONCILED" || input.reconciled ? new Date() : operation.reconciledAt,
      revision: { increment: 1 },
    },
  });
}

export async function transitionRetailProviderOperation(organizationId: string, operationId: string, input: ProviderOperationTransitionInput) {
  return prisma.$transaction((tx) => transitionProviderOperationTx(tx, organizationId, operationId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function createRetailPaymentTransaction(organizationId: string, actorUserId: string, input: PaymentCreateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailPaymentTransaction.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) return { payment: existing, idempotent: true };
    if (input.providerId) await assertProviderTx(tx, organizationId, input.providerId);
    const sale = await assertSaleTx(tx, organizationId, input.saleId);
    const retailReturn = await assertReturnTx(tx, organizationId, input.returnId);
    if (sale && sale.currencyCode !== input.currencyCode) throw new EnterpriseRetailError("RETAIL_PAYMENT_CURRENCY_MISMATCH", 409);
    if (retailReturn && retailReturn.currencyCode !== input.currencyCode) throw new EnterpriseRetailError("RETAIL_PAYMENT_CURRENCY_MISMATCH", 409);
    const payment = await tx.enterpriseRetailPaymentTransaction.create({
      data: {
        organizationId,
        providerId: input.providerId || null,
        saleId: input.saleId || null,
        returnId: input.returnId || null,
        methodType: input.methodType,
        currencyCode: input.currencyCode,
        amount: decimal(input.amount),
        clientReference: input.clientReference,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: actorUserId,
      },
    });
    return { payment, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

async function transitionPaymentTx(tx: Prisma.TransactionClient, organizationId: string, paymentId: string, input: PaymentTransitionInput) {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailPaymentTransaction" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const payment = await tx.enterpriseRetailPaymentTransaction.findFirst({ where: { id: paymentId, organizationId } });
  if (!payment) throw new EnterpriseRetailError("RETAIL_PAYMENT_NOT_FOUND", 404);
  if (payment.revision !== input.revision) throw new EnterpriseRetailError("RETAIL_PAYMENT_CONFLICT", 409);
  assertTransition(payment.status, input.status, RETAIL_PAYMENT_TRANSITIONS, "RETAIL_PAYMENT_TRANSITION_INVALID");
  if (payment.status === input.status) return payment;
  const now = new Date();
  return tx.enterpriseRetailPaymentTransaction.update({
    where: { id: payment.id },
    data: {
      status: input.status,
      providerReference: input.providerReference || payment.providerReference,
      failureCode: input.status === "FAILED" ? input.failureCode || "PROVIDER_FAILED" : null,
      failureMessage: input.status === "FAILED" ? input.failureMessage || null : null,
      authorizedAt: input.status === "AUTHORIZED" ? now : payment.authorizedAt,
      capturedAt: input.status === "CAPTURED" ? now : payment.capturedAt,
      failedAt: input.status === "FAILED" ? now : payment.failedAt,
      voidedAt: input.status === "VOIDED" ? now : payment.voidedAt,
      refundedAt: input.status === "REFUNDED" ? now : payment.refundedAt,
      revision: { increment: 1 },
    },
  });
}

export async function transitionRetailPayment(organizationId: string, paymentId: string, input: PaymentTransitionInput) {
  return prisma.$transaction((tx) => transitionPaymentTx(tx, organizationId, paymentId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function processRetailWebhookEvent(organizationId: string, input: WebhookEventInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailWebhookEvent.findFirst({ where: { organizationId, providerId: input.providerId, externalEventId: input.externalEventId } });
    if (existing) return { event: existing, idempotent: true, applied: false };
    await assertProviderTx(tx, organizationId, input.providerId);
    const event = await tx.enterpriseRetailWebhookEvent.create({
      data: {
        organizationId,
        providerId: input.providerId,
        externalEventId: input.externalEventId,
        eventType: input.eventType,
        status: input.signatureVerified ? "RECEIVED" : "REJECTED_SIGNATURE",
        signatureVerified: input.signatureVerified,
        payloadHash: input.payloadHash,
        safePayloadJson: input.safePayloadJson ? input.safePayloadJson as Prisma.InputJsonValue : undefined,
        providerOperationId: input.providerOperationId || null,
        paymentTransactionId: input.paymentTransactionId || null,
      },
    });
    if (!input.signatureVerified) return { event, idempotent: false, applied: false };

    let applied = false;
    if (input.providerOperationId && input.providerOperationStatus) {
      const operation = await tx.enterpriseRetailProviderOperation.findFirst({ where: { id: input.providerOperationId, organizationId, providerId: input.providerId } });
      if (!operation) throw new EnterpriseRetailError("RETAIL_PROVIDER_OPERATION_NOT_FOUND", 404);
      if (operation.status !== input.providerOperationStatus && (RETAIL_PROVIDER_OPERATION_TRANSITIONS[operation.status] || []).includes(input.providerOperationStatus)) {
        await transitionProviderOperationTx(tx, organizationId, operation.id, { revision: operation.revision, status: input.providerOperationStatus, externalReference: input.providerReference || null, errorCode: null, errorMessage: null, reconciled: input.providerOperationStatus === "RECONCILED" });
        applied = true;
      }
    }
    if (input.paymentTransactionId && input.paymentStatus) {
      const payment = await tx.enterpriseRetailPaymentTransaction.findFirst({ where: { id: input.paymentTransactionId, organizationId, ...(input.providerId ? { providerId: input.providerId } : {}) } });
      if (!payment) throw new EnterpriseRetailError("RETAIL_PAYMENT_NOT_FOUND", 404);
      if (payment.status !== input.paymentStatus && (RETAIL_PAYMENT_TRANSITIONS[payment.status] || []).includes(input.paymentStatus)) {
        await transitionPaymentTx(tx, organizationId, payment.id, { revision: payment.revision, status: input.paymentStatus, providerReference: input.providerReference || null, failureCode: null, failureMessage: null });
        applied = true;
      }
    }
    const updated = await tx.enterpriseRetailWebhookEvent.update({ where: { id: event.id }, data: { status: applied ? "PROCESSED" : "PROCESSED_NOOP", processedAt: new Date() } });
    return { event: updated, idempotent: false, applied };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function listRetailDeviceProfiles(organizationId: string) {
  return prisma.enterpriseRetailDeviceProfile.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ siteId: "asc" }, { deviceType: "asc" }, { name: "asc" }] });
}

export async function upsertRetailDeviceProfile(organizationId: string, actorUserId: string, input: DeviceProfileInput) {
  return prisma.$transaction(async (tx) => {
    if (input.siteId) {
      const site = await tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!site) throw new EnterpriseRetailError("RETAIL_REFERENCE_INVALID", 409, { field: "siteId" });
    }
    if (input.id) {
      const existing = await tx.enterpriseRetailDeviceProfile.findFirst({ where: { id: input.id, organizationId, archivedAt: null } });
      if (!existing) throw new EnterpriseRetailError("RETAIL_DEVICE_NOT_FOUND", 404);
      return tx.enterpriseRetailDeviceProfile.update({
        where: { id: existing.id },
        data: {
          siteId: input.siteId || null,
          code: input.code,
          name: input.name,
          deviceType: input.deviceType,
          connectionMode: input.connectionMode,
          capabilitiesJson: input.capabilitiesJson ? input.capabilitiesJson as Prisma.InputJsonValue : Prisma.JsonNull,
          settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : Prisma.JsonNull,
          status: input.status,
          updatedByUserId: actorUserId,
          revision: { increment: 1 },
        },
      });
    }
    return tx.enterpriseRetailDeviceProfile.create({
      data: {
        organizationId,
        siteId: input.siteId || null,
        code: input.code,
        name: input.name,
        deviceType: input.deviceType,
        connectionMode: input.connectionMode,
        capabilitiesJson: input.capabilitiesJson ? input.capabilitiesJson as Prisma.InputJsonValue : undefined,
        settingsJson: input.settingsJson ? input.settingsJson as Prisma.InputJsonValue : undefined,
        status: input.status,
        createdByUserId: actorUserId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
