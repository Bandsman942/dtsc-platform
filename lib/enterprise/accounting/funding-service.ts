import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertEnterpriseApprovalCandidate, assertEnterpriseApprovalDecision } from "@/lib/enterprise/approval-assignment";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import type { PostingEvent } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { reverseJournalEntryTx } from "@/lib/enterprise/accounting/reversal-service";
import type {
  fundingOperationCreateSchema,
  fundingOperationReverseSchema,
} from "@/lib/enterprise/accounting/treasury-schemas";

type FundingCreateInput = z.infer<typeof fundingOperationCreateSchema>;
type FundingReverseInput = z.infer<typeof fundingOperationReverseSchema>;

function fundingPostingEvent(fundingType: string): PostingEvent {
  if (fundingType === "CAPITAL_CONTRIBUTION") return "CAPITAL_CONTRIBUTION_CONFIRMED";
  if (fundingType === "SHAREHOLDER_ADVANCE") return "SHAREHOLDER_ADVANCE_CONFIRMED";
  if (fundingType === "LOAN_DRAW") return "LOAN_DRAW_CONFIRMED";
  throw new EnterpriseAccountingError("FUNDING_TYPE_INVALID", 400);
}

async function resolveOpenCashSession(
  tx: Prisma.TransactionClient,
  organizationId: string,
  financialAccountId: string,
  requestedCashSessionId?: string | null,
) {
  if (requestedCashSessionId) {
    const selected = await tx.enterpriseCashSession.findFirst({
      where: {
        id: requestedCashSessionId,
        organizationId,
        financialAccountId,
        status: "OPEN",
      },
    });
    if (!selected) throw new EnterpriseAccountingError("FUNDING_CASH_SESSION_INVALID", 409);
    return selected;
  }

  const sessions = await tx.enterpriseCashSession.findMany({
    where: { organizationId, financialAccountId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
    take: 2,
  });
  if (sessions.length === 0) throw new EnterpriseAccountingError("FUNDING_CASH_SESSION_REQUIRED", 409);
  if (sessions.length > 1) throw new EnterpriseAccountingError("FUNDING_CASH_SESSION_AMBIGUOUS", 409);
  return sessions[0];
}

async function validateFundingCounterpart(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fundingType: string,
  counterpartyLedgerAccountId?: string | null,
) {
  if (fundingType !== "SHAREHOLDER_ADVANCE") {
    if (counterpartyLedgerAccountId) throw new EnterpriseAccountingError("FUNDING_COUNTERPART_NOT_ALLOWED", 409);
    return null;
  }
  if (!counterpartyLedgerAccountId) throw new EnterpriseAccountingError("FUNDING_COUNTERPART_ACCOUNT_REQUIRED", 409);
  const account = await tx.enterpriseLedgerAccount.findFirst({
    where: {
      id: counterpartyLedgerAccountId,
      organizationId,
      accountType: "LIABILITY",
      isActive: true,
      archivedAt: null,
      allowDirectPosting: true,
    },
  });
  if (!account) throw new EnterpriseAccountingError("FUNDING_COUNTERPART_ACCOUNT_INVALID", 409);
  return account;
}

async function assertFundingApprovalDecision(
  organizationId: string,
  fundingOperationId: string,
  actorUserId: string,
) {
  const pendingApproval = await prisma.enterpriseApproval.findFirst({
    where: {
      organizationId,
      targetEntityType: "EnterpriseFundingOperation",
      targetEntityId: fundingOperationId,
      status: "PENDING",
      archivedAt: null,
    },
    select: { id: true, approverUserId: true, requestedByUserId: true, revision: true },
  });
  if (!pendingApproval) throw new EnterpriseAccountingError("FUNDING_APPROVAL_NOT_ASSIGNED", 409);

  try {
    const decision = await assertEnterpriseApprovalDecision({
      organizationId,
      requesterUserId: pendingApproval.requestedByUserId,
      approverUserId: pendingApproval.approverUserId,
      actorUserId,
      moduleCode: "FINANCE_TREASURY",
    });
    return { pendingApproval, decision };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "FUNDING_APPROVER_NOT_ALLOWED";
    if (code === "WRONG_APPROVER" || code === "APPROVER_PERMISSION_DENIED") {
      throw new EnterpriseAccountingError("FUNDING_APPROVER_NOT_ALLOWED", 403);
    }
    if (code === "SELF_APPROVAL_FORBIDDEN") {
      throw new EnterpriseAccountingError("FUNDING_SELF_APPROVAL_FORBIDDEN", 403);
    }
    throw error;
  }
}

export async function createFundingOperation(
  organizationId: string,
  actorUserId: string,
  input: FundingCreateInput,
) {
  try {
    await assertEnterpriseApprovalCandidate({
      organizationId,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
      moduleCode: "FINANCE_TREASURY",
    });
  } catch {
    throw new EnterpriseAccountingError("FUNDING_APPROVER_NOT_ELIGIBLE", 403);
  }

  return prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.enterpriseFundingOperation.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        const sameRequest =
          existing.fundingType === input.fundingType &&
          existing.financialAccountId === input.financialAccountId &&
          existing.amount.equals(new Prisma.Decimal(input.amount));
        if (!sameRequest) throw new EnterpriseAccountingError("FUNDING_IDEMPOTENCY_CONFLICT", 409);
        return existing;
      }
    }

    const [financialAccount, approverMembership] = await Promise.all([
      tx.enterpriseFinancialAccount.findFirst({
        where: { id: input.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null },
      }),
      tx.organizationMember.findFirst({
        where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null },
        select: { id: true },
      }),
    ]);
    if (!financialAccount) throw new EnterpriseAccountingError("FUNDING_FINANCIAL_ACCOUNT_INVALID", 409);
    if (!approverMembership) throw new EnterpriseAccountingError("FUNDING_APPROVER_NOT_ELIGIBLE", 403);

    const amount = money(new Prisma.Decimal(input.amount));
    if (!amount.isPositive()) throw new EnterpriseAccountingError("FINANCE_AMOUNT_MUST_BE_POSITIVE", 400);
    await validateFundingCounterpart(tx, organizationId, input.fundingType, input.counterpartyLedgerAccountId);

    const cashSession = financialAccount.accountType === "CASH"
      ? await resolveOpenCashSession(tx, organizationId, financialAccount.id, input.cashSessionId)
      : null;
    if (financialAccount.accountType !== "CASH" && input.cashSessionId) {
      throw new EnterpriseAccountingError("FUNDING_CASH_SESSION_NOT_ALLOWED", 409);
    }

    const funding = await tx.enterpriseFundingOperation.create({
      data: {
        organizationId,
        number: financeReference("FND"),
        fundingType: input.fundingType,
        financialAccountId: financialAccount.id,
        cashSessionId: cashSession?.id || null,
        counterpartyLedgerAccountId: input.counterpartyLedgerAccountId || null,
        currencyCode: financialAccount.currencyCode,
        amount,
        operationDate: input.operationDate,
        reference: input.reference || null,
        description: input.description || null,
        initiatedByUserId: actorUserId,
        idempotencyKey: input.idempotencyKey || null,
      },
    });
    const approval = await tx.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterpriseFundingOperation",
        targetEntityId: funding.id,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
        status: "PENDING",
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFundingOperation",
      entityId: funding.id,
      eventType: "FUNDING_OPERATION_CREATED",
      summary: `Funding ${funding.number} created`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: {
        fundingType: funding.fundingType,
        financialAccountId: funding.financialAccountId,
        cashSessionId: funding.cashSessionId,
        amount: funding.amount.toFixed(),
        currencyCode: funding.currencyCode,
        approvalId: approval.id,
        approverUserId: input.approverUserId,
      },
    });
    return funding;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAssignedFundingOperation(
  organizationId: string,
  fundingOperationId: string,
  actorUserId: string,
  revision: number,
) {
  const { pendingApproval, decision } = await assertFundingApprovalDecision(organizationId, fundingOperationId, actorUserId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFundingOperation" WHERE id = ${fundingOperationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const funding = await tx.enterpriseFundingOperation.findFirst({ where: { id: fundingOperationId, organizationId } });
    if (!funding) throw new EnterpriseAccountingError("FUNDING_OPERATION_NOT_FOUND", 404);
    if (funding.status !== "DRAFT" || funding.revision !== revision) throw new EnterpriseAccountingError("FUNDING_OPERATION_CONFLICT", 409);

    const approval = await tx.enterpriseApproval.findFirst({
      where: {
        id: pendingApproval.id,
        organizationId,
        targetEntityType: "EnterpriseFundingOperation",
        targetEntityId: funding.id,
        status: "PENDING",
        archivedAt: null,
      },
    });
    if (!approval || approval.approverUserId !== actorUserId) throw new EnterpriseAccountingError("FUNDING_APPROVAL_CONFLICT", 409);

    const decided = await tx.enterpriseApproval.updateMany({
      where: { id: approval.id, organizationId, status: "PENDING", revision: approval.revision, archivedAt: null },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decisionComment: decision.selfApprovalOverride ? "SELF_APPROVAL_OVERRIDE" : null,
        revision: { increment: 1 },
      },
    });
    if (decided.count !== 1) throw new EnterpriseAccountingError("FUNDING_APPROVAL_CONFLICT", 409);

    const updated = await tx.enterpriseFundingOperation.update({
      where: { id: funding.id },
      data: { status: "APPROVED", approvedByUserId: actorUserId, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFundingOperation",
      entityId: funding.id,
      eventType: "FUNDING_OPERATION_APPROVED",
      summary: `Funding ${funding.number} approved`,
      actorUserId,
      fromStatus: "DRAFT",
      toStatus: "APPROVED",
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectAssignedFundingOperation(
  organizationId: string,
  fundingOperationId: string,
  actorUserId: string,
  revision: number,
  reason: string,
) {
  const { pendingApproval, decision } = await assertFundingApprovalDecision(organizationId, fundingOperationId, actorUserId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFundingOperation" WHERE id = ${fundingOperationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const funding = await tx.enterpriseFundingOperation.findFirst({ where: { id: fundingOperationId, organizationId } });
    if (!funding) throw new EnterpriseAccountingError("FUNDING_OPERATION_NOT_FOUND", 404);
    if (funding.status !== "DRAFT" || funding.revision !== revision) throw new EnterpriseAccountingError("FUNDING_OPERATION_CONFLICT", 409);

    const approval = await tx.enterpriseApproval.findFirst({
      where: { id: pendingApproval.id, organizationId, status: "PENDING", archivedAt: null },
    });
    if (!approval || approval.approverUserId !== actorUserId) throw new EnterpriseAccountingError("FUNDING_APPROVAL_CONFLICT", 409);
    const decided = await tx.enterpriseApproval.updateMany({
      where: { id: approval.id, organizationId, status: "PENDING", revision: approval.revision, archivedAt: null },
      data: {
        status: "REJECTED",
        decidedAt: new Date(),
        decisionComment: reason,
        revision: { increment: 1 },
      },
    });
    if (decided.count !== 1) throw new EnterpriseAccountingError("FUNDING_APPROVAL_CONFLICT", 409);

    const updated = await tx.enterpriseFundingOperation.update({
      where: { id: funding.id },
      data: { status: "REJECTED", revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFundingOperation",
      entityId: funding.id,
      eventType: "FUNDING_OPERATION_REJECTED",
      summary: `Funding ${funding.number} rejected`,
      actorUserId,
      fromStatus: "DRAFT",
      toStatus: "REJECTED",
      metadataJson: {
        approvalId: approval.id,
        selfApprovalOverride: decision.selfApprovalOverride,
        rejectionReason: reason.slice(0, 500),
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function confirmFundingOperation(
  organizationId: string,
  fundingOperationId: string,
  actorUserId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFundingOperation" WHERE id = ${fundingOperationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const funding = await tx.enterpriseFundingOperation.findFirst({ where: { id: fundingOperationId, organizationId } });
    if (!funding) throw new EnterpriseAccountingError("FUNDING_OPERATION_NOT_FOUND", 404);

    if (funding.status === "CONFIRMED") {
      const treasury = await tx.enterpriseTreasuryTransaction.findFirst({
        where: { organizationId, fundingOperationId: funding.id, transactionType: "FUNDING", direction: "INBOUND", status: "CONFIRMED" },
      });
      const journal = await tx.enterpriseJournalEntry.findFirst({
        where: {
          organizationId,
          sourceEntityType: "EnterpriseFundingOperation",
          sourceEntityId: funding.id,
          postingEvent: fundingPostingEvent(funding.fundingType),
          status: "POSTED",
        },
      });
      if (!treasury || !journal) throw new EnterpriseAccountingError("FUNDING_CONFIRMATION_INCONSISTENT", 409);
      return funding;
    }

    if (funding.status !== "APPROVED" || funding.revision !== revision) throw new EnterpriseAccountingError("FUNDING_OPERATION_NOT_APPROVED", 409);
    assertIndependentActor({
      actorUserId,
      relatedUserIds: [funding.initiatedByUserId, funding.approvedByUserId],
      errorCode: "FUNDING_CONFIRMATION_ACTOR_FORBIDDEN",
    });

    const financialAccount = await tx.enterpriseFinancialAccount.findFirst({
      where: { id: funding.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null },
    });
    if (!financialAccount || financialAccount.currencyCode !== funding.currencyCode) {
      throw new EnterpriseAccountingError("FUNDING_FINANCIAL_ACCOUNT_INVALID", 409);
    }
    await validateFundingCounterpart(tx, organizationId, funding.fundingType, funding.counterpartyLedgerAccountId);
    const cashSession = financialAccount.accountType === "CASH"
      ? await resolveOpenCashSession(tx, organizationId, financialAccount.id, funding.cashSessionId)
      : null;
    if (financialAccount.accountType !== "CASH" && funding.cashSessionId) {
      throw new EnterpriseAccountingError("FUNDING_CASH_SESSION_NOT_ALLOWED", 409);
    }

    const confirmed = await tx.enterpriseFundingOperation.update({
      where: { id: funding.id },
      data: {
        status: "CONFIRMED",
        cashSessionId: cashSession?.id || null,
        confirmedByUserId: actorUserId,
        confirmedAt: new Date(),
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseFinancialAccount.update({
      where: { id: financialAccount.id },
      data: { operationalBalance: { increment: funding.amount }, revision: { increment: 1 } },
    });
    await tx.enterpriseTreasuryTransaction.create({
      data: {
        organizationId,
        financialAccountId: financialAccount.id,
        fundingOperationId: funding.id,
        transactionType: "FUNDING",
        direction: "INBOUND",
        currencyCode: funding.currencyCode,
        amount: funding.amount,
        transactionDate: funding.operationDate,
        reference: funding.reference || funding.number,
        createdByUserId: actorUserId,
      },
    });
    if (cashSession) {
      await tx.enterpriseCashMovement.create({
        data: {
          organizationId,
          cashSessionId: cashSession.id,
          fundingOperationId: funding.id,
          movementType: "FUNDING",
          direction: "INBOUND",
          amount: funding.amount,
          currencyCode: funding.currencyCode,
          reference: funding.reference || funding.number,
          reason: funding.description || "Funding received",
          createdByUserId: actorUserId,
        },
      });
    }

    await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: fundingPostingEvent(funding.fundingType),
      sourceEntityType: "EnterpriseFundingOperation",
      sourceEntityId: funding.id,
      postingVersion: 1,
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFundingOperation",
      entityId: funding.id,
      eventType: "FUNDING_OPERATION_CONFIRMED",
      summary: `Funding ${funding.number} confirmed`,
      actorUserId,
      fromStatus: "APPROVED",
      toStatus: "CONFIRMED",
      metadataJson: {
        fundingType: funding.fundingType,
        financialAccountId: funding.financialAccountId,
        cashSessionId: cashSession?.id || null,
        amount: funding.amount.toFixed(),
        currencyCode: funding.currencyCode,
      },
    });
    return confirmed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function reverseFundingOperation(
  organizationId: string,
  fundingOperationId: string,
  actorUserId: string,
  input: FundingReverseInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFundingOperation" WHERE id = ${fundingOperationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const funding = await tx.enterpriseFundingOperation.findFirst({ where: { id: fundingOperationId, organizationId } });
    if (!funding) throw new EnterpriseAccountingError("FUNDING_OPERATION_NOT_FOUND", 404);
    if (funding.status === "REVERSED") return funding;
    if (funding.status !== "CONFIRMED" || funding.revision !== input.revision) {
      throw new EnterpriseAccountingError("FUNDING_OPERATION_NOT_REVERSIBLE", 409);
    }
    assertIndependentActor({
      actorUserId,
      relatedUserIds: [funding.initiatedByUserId, funding.approvedByUserId, funding.confirmedByUserId],
      errorCode: "FUNDING_REVERSAL_ACTOR_FORBIDDEN",
    });

    const financialAccount = await tx.enterpriseFinancialAccount.findFirst({
      where: { id: funding.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null },
    });
    if (!financialAccount || financialAccount.currencyCode !== funding.currencyCode) {
      throw new EnterpriseAccountingError("FUNDING_FINANCIAL_ACCOUNT_INVALID", 409);
    }
    if (financialAccount.operationalBalance.lessThan(funding.amount)) {
      throw new EnterpriseAccountingError("FUNDING_REVERSAL_INSUFFICIENT_BALANCE", 409);
    }
    const cashSession = financialAccount.accountType === "CASH"
      ? await resolveOpenCashSession(tx, organizationId, financialAccount.id, input.cashSessionId)
      : null;
    if (financialAccount.accountType !== "CASH" && input.cashSessionId) {
      throw new EnterpriseAccountingError("FUNDING_CASH_SESSION_NOT_ALLOWED", 409);
    }

    const originalJournal = await tx.enterpriseJournalEntry.findFirst({
      where: {
        organizationId,
        sourceEntityType: "EnterpriseFundingOperation",
        sourceEntityId: funding.id,
        postingEvent: fundingPostingEvent(funding.fundingType),
        status: "POSTED",
      },
    });
    if (!originalJournal) throw new EnterpriseAccountingError("FUNDING_POSTED_ENTRY_MISSING", 409);
    await reverseJournalEntryTx(
      tx,
      organizationId,
      originalJournal.id,
      actorUserId,
      { reason: input.reason, accountingDate: input.accountingDate },
      { authorization: "DOMAIN_INVERSE" },
    );

    await tx.enterpriseFinancialAccount.update({
      where: { id: financialAccount.id },
      data: { operationalBalance: { decrement: funding.amount }, revision: { increment: 1 } },
    });
    await tx.enterpriseTreasuryTransaction.create({
      data: {
        organizationId,
        financialAccountId: financialAccount.id,
        fundingOperationId: funding.id,
        transactionType: "FUNDING_REVERSAL",
        direction: "OUTBOUND",
        currencyCode: funding.currencyCode,
        amount: funding.amount,
        transactionDate: input.accountingDate,
        reference: `${funding.number}-REV`,
        createdByUserId: actorUserId,
      },
    });
    if (cashSession) {
      await tx.enterpriseCashMovement.create({
        data: {
          organizationId,
          cashSessionId: cashSession.id,
          fundingOperationId: funding.id,
          movementType: "FUNDING_REVERSAL",
          direction: "OUTBOUND",
          amount: funding.amount,
          currencyCode: funding.currencyCode,
          reference: `${funding.number}-REV`,
          reason: input.reason,
          createdByUserId: actorUserId,
        },
      });
    }
    const reversed = await tx.enterpriseFundingOperation.update({
      where: { id: funding.id },
      data: {
        status: "REVERSED",
        reversedByUserId: actorUserId,
        reversedAt: new Date(),
        reversalReason: input.reason,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFundingOperation",
      entityId: funding.id,
      eventType: "FUNDING_OPERATION_REVERSED",
      summary: `Funding ${funding.number} reversed`,
      actorUserId,
      fromStatus: "CONFIRMED",
      toStatus: "REVERSED",
      metadataJson: {
        reason: input.reason.slice(0, 500),
        cashSessionId: cashSession?.id || null,
        amount: funding.amount.toFixed(),
        currencyCode: funding.currencyCode,
      },
    });
    return reversed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
