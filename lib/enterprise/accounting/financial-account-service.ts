import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import type {
  financialAccountArchiveSchema,
  financialAccountCreateSchema,
  financialAccountUpdateSchema,
} from "@/lib/enterprise/accounting/treasury-schemas";

type FinancialAccountCreateInput = z.infer<typeof financialAccountCreateSchema>;
type FinancialAccountUpdateInput = z.infer<typeof financialAccountUpdateSchema>;
type FinancialAccountArchiveInput = z.infer<typeof financialAccountArchiveSchema>;

const ACCOUNT_CODE_PREFIX: Record<FinancialAccountCreateInput["accountType"], string> = {
  CASH: "CSH",
  BANK: "BNK",
  MOBILE_MONEY: "MMO",
  CLEARING: "CLR",
};

async function assertAccountRelations(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { responsibleUserId?: string | null; siteId?: string | null },
) {
  if (input.responsibleUserId) {
    const membership = await tx.organizationMember.findFirst({
      where: { organizationId, userId: input.responsibleUserId, status: "ACTIVE", removedAt: null },
      select: { id: true },
    });
    if (!membership) throw new EnterpriseAccountingError("TREASURY_RESPONSIBLE_USER_INVALID", 409);
  }
  if (input.siteId) {
    const site = await tx.enterpriseSite.findFirst({
      where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!site) throw new EnterpriseAccountingError("TREASURY_SITE_INVALID", 409);
  }
}

export async function createManagedFinancialAccount(
  organizationId: string,
  actorUserId: string,
  input: FinancialAccountCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    await assertAccountRelations(tx, organizationId, input);

    const ledger = await tx.enterpriseLedgerAccount.findFirst({
      where: { id: input.ledgerAccountId, organizationId, isActive: true, archivedAt: null },
    });
    if (!ledger) throw new EnterpriseAccountingError("TREASURY_LEDGER_ACCOUNT_INVALID", 409);
    const expectedSubtype = input.accountType === "CASH"
      ? "CASH"
      : input.accountType === "BANK"
        ? "BANK"
        : input.accountType === "MOBILE_MONEY"
          ? "MOBILE_MONEY"
          : "CLEARING";
    if (ledger.accountSubtype !== expectedSubtype) throw new EnterpriseAccountingError("TREASURY_LEDGER_SUBTYPE_MISMATCH", 409);
    if (ledger.currencyCode && ledger.currencyCode !== input.currencyCode) throw new EnterpriseAccountingError("TREASURY_LEDGER_CURRENCY_MISMATCH", 409);

    const openingBalance = new Prisma.Decimal(input.openingBalance);
    const code = financeReference(`FA-${ACCOUNT_CODE_PREFIX[input.accountType]}`);
    const account = await tx.enterpriseFinancialAccount.create({
      data: {
        organizationId,
        code,
        name: input.name,
        accountType: input.accountType,
        currencyCode: input.currencyCode,
        maskedReference: input.maskedReference || null,
        openingBalance,
        operationalBalance: openingBalance,
        reconciledBalance: openingBalance,
        ledgerAccountId: input.ledgerAccountId,
        responsibleUserId: input.responsibleUserId || null,
        siteId: input.siteId || null,
        settingsJson: input.settingsJson as Prisma.InputJsonValue | undefined,
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFinancialAccount",
      entityId: account.id,
      eventType: "FINANCIAL_ACCOUNT_CREATED",
      summary: `Financial account ${account.code} created`,
      actorUserId,
      toStatus: "ACTIVE",
      metadataJson: { accountType: account.accountType, currency: account.currencyCode, maskedReference: account.maskedReference },
    });
    return account;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateManagedFinancialAccount(
  organizationId: string,
  accountId: string,
  actorUserId: string,
  input: FinancialAccountUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE id = ${accountId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const existing = await tx.enterpriseFinancialAccount.findFirst({
      where: { id: accountId, organizationId, archivedAt: null },
    });
    if (!existing) throw new EnterpriseAccountingError("TREASURY_ACCOUNT_NOT_FOUND", 404);
    if (existing.revision !== input.revision) throw new EnterpriseAccountingError("TREASURY_ACCOUNT_CONFLICT", 409, { currentRevision: existing.revision });
    await assertAccountRelations(tx, organizationId, input);

    const updated = await tx.enterpriseFinancialAccount.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? existing.name,
        maskedReference: input.maskedReference === undefined ? existing.maskedReference : input.maskedReference,
        responsibleUserId: input.responsibleUserId === undefined ? existing.responsibleUserId : input.responsibleUserId,
        siteId: input.siteId === undefined ? existing.siteId : input.siteId,
        status: input.status ?? existing.status,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFinancialAccount",
      entityId: updated.id,
      eventType: "FINANCIAL_ACCOUNT_UPDATED",
      summary: `Financial account ${updated.code} updated`,
      actorUserId,
      fromStatus: existing.status,
      toStatus: updated.status,
      metadataJson: { mutableFieldsOnly: true },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function archiveManagedFinancialAccount(
  organizationId: string,
  accountId: string,
  actorUserId: string,
  input: FinancialAccountArchiveInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE id = ${accountId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const existing = await tx.enterpriseFinancialAccount.findFirst({
      where: { id: accountId, organizationId, archivedAt: null },
    });
    if (!existing) throw new EnterpriseAccountingError("TREASURY_ACCOUNT_NOT_FOUND", 404);
    if (existing.revision !== input.revision) throw new EnterpriseAccountingError("TREASURY_ACCOUNT_CONFLICT", 409, { currentRevision: existing.revision });
    if (!existing.operationalBalance.isZero() || !existing.reconciledBalance.isZero() || (existing.availableBalance && !existing.availableBalance.isZero())) {
      throw new EnterpriseAccountingError("TREASURY_ACCOUNT_BALANCE_NOT_ZERO", 409);
    }

    const [activeCashSessions, pendingTransfers] = await Promise.all([
      tx.enterpriseCashSession.count({
        where: { organizationId, financialAccountId: existing.id, status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] } },
      }),
      tx.enterpriseAccountTransfer.count({
        where: {
          organizationId,
          status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] },
          OR: [{ sourceFinancialAccountId: existing.id }, { targetFinancialAccountId: existing.id }],
        },
      }),
    ]);
    if (activeCashSessions > 0) throw new EnterpriseAccountingError("TREASURY_ACCOUNT_ACTIVE_CASH_SESSION", 409);
    if (pendingTransfers > 0) throw new EnterpriseAccountingError("TREASURY_ACCOUNT_PENDING_TRANSFER", 409);

    const archived = await tx.enterpriseFinancialAccount.update({
      where: { id: existing.id },
      data: { status: "INACTIVE", archivedAt: new Date(), revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFinancialAccount",
      entityId: archived.id,
      eventType: "FINANCIAL_ACCOUNT_ARCHIVED",
      summary: `Financial account ${archived.code} archived`,
      actorUserId,
      fromStatus: existing.status,
      toStatus: "INACTIVE",
      metadataJson: { reason: input.reason },
    });
    return archived;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
