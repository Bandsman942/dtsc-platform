import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createAccountingApprovalAssignment,
  decideAccountingApproval,
  requireAccountingApprovalDecision,
} from "@/lib/enterprise/accounting/accounting-approval-service";
import { calculateFinancialCloseChecklist } from "@/lib/enterprise/accounting/close-service";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money, publishFinanceEvent, serializeFinanceValue, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

export async function submitFinancialCloseForAssignedApproval(
  organizationId: string,
  closeId: string,
  actorUserId: string,
  input: { revision: number; approverUserId: string; reason?: string },
) {
  const snapshot = await prisma.enterpriseFinancialClose.findFirst({ where: { id: closeId, organizationId } });
  if (!snapshot) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NOT_FOUND", 404);
  const fresh = await calculateFinancialCloseChecklist(organizationId, snapshot.fiscalPeriodId);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialClose" WHERE id = ${closeId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseFinancialClose.findFirst({ where: { id: closeId, organizationId } });
    const retryable = current?.status === "DRAFT" || current?.status === "BLOCKED";
    if (!current || !retryable || current.revision !== input.revision) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_CONFLICT", 409);
    if (current.requestedByUserId !== actorUserId) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_SUBMITTER_MISMATCH", 403);

    let approvalId: string | null = null;
    if (fresh.ready) {
      const approval = await createAccountingApprovalAssignment(tx, {
        organizationId,
        targetEntityType: "EnterpriseFinancialClose",
        targetEntityId: current.id,
        requesterUserId: actorUserId,
        approverUserId: input.approverUserId,
      });
      approvalId = approval.id;
    }
    const updated = await tx.enterpriseFinancialClose.update({
      where: { id: current.id },
      data: {
        status: fresh.ready ? "PENDING_APPROVAL" : "BLOCKED",
        checklistJson: serializeFinanceValue(fresh.checklist) as Prisma.InputJsonValue,
        blockersJson: serializeFinanceValue(fresh.blockers) as Prisma.InputJsonValue,
        requestedByUserId: actorUserId,
        requestedAt: new Date(),
        approvedByUserId: null,
        approvedAt: null,
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseFiscalPeriod.update({
      where: { id: current.fiscalPeriodId },
      data: {
        status: fresh.ready ? "SOFT_CLOSED" : "OPEN",
        softClosedAt: fresh.ready ? new Date() : null,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFinancialClose",
      entityId: current.id,
      eventType: fresh.ready ? "FINANCIAL_CLOSE_SUBMITTED" : "FINANCIAL_CLOSE_BLOCKED",
      summary: fresh.ready ? "Financial close submitted" : "Financial close blocked",
      actorUserId,
      fromStatus: current.status,
      toStatus: updated.status,
      metadataJson: { blockers: fresh.blockers, approvalId, approverUserId: fresh.ready ? input.approverUserId : null } as Prisma.InputJsonValue,
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveFinancialCloseAssignedApproval(
  organizationId: string,
  closeId: string,
  actorUserId: string,
  input: { revision: number; reason?: string },
) {
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseFinancialClose",
    targetEntityId: closeId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialClose" WHERE id = ${closeId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const close = await tx.enterpriseFinancialClose.findFirst({ where: { id: closeId, organizationId }, include: { fiscalPeriod: true } });
    if (!close) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NOT_FOUND", 404);
    if (close.revision !== input.revision) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_REVISION_CONFLICT", 409, { currentRevision: close.revision });
    if (close.status !== "PENDING_APPROVAL") throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NOT_SUBMITTED", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: "APPROVED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const updated = await tx.enterpriseFinancialClose.update({
      where: { id: close.id },
      data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date(), revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseFinancialClose",
      entityId: close.id,
      eventType: "FINANCIAL_CLOSE_APPROVED",
      summary: `Close approved for ${close.fiscalPeriod.code}`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "APPROVED",
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitCashSessionCloseForAssignedValidation(
  organizationId: string,
  sessionId: string,
  cashierUserId: string,
  input: {
    countedClosingAmount: string;
    closingReason?: string;
    counts: Array<{ denomination: string; quantity: number }>;
    revision: number;
    approverUserId: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseCashSession.findFirst({ where: { id: sessionId, organizationId }, include: { movements: true } });
    if (!session) throw new EnterpriseAccountingError("CASH_SESSION_NOT_FOUND", 404);
    if (session.cashierUserId !== cashierUserId) throw new EnterpriseAccountingError("CASH_SESSION_NOT_OWNED", 403);
    if (session.status !== "OPEN" || session.revision !== input.revision) throw new EnterpriseAccountingError("CASH_SESSION_CONFLICT", 409);

    const inflows = sumDecimals(session.movements.filter((movement) => movement.direction === "INBOUND").map((movement) => movement.amount));
    const outflows = sumDecimals(session.movements.filter((movement) => movement.direction === "OUTBOUND").map((movement) => movement.amount));
    const expected = money(session.openingAmount.plus(inflows).minus(outflows));
    const counted = new Prisma.Decimal(input.countedClosingAmount);
    const countTotal = money(sumDecimals(input.counts.map((count) => new Prisma.Decimal(count.denomination).times(count.quantity))));
    if (!countTotal.equals(counted)) throw new EnterpriseAccountingError("CASH_COUNT_TOTAL_MISMATCH", 409, { countTotal: countTotal.toFixed(), counted: counted.toFixed() });
    const discrepancy = money(counted.minus(expected));
    if (!discrepancy.isZero() && !input.closingReason) throw new EnterpriseAccountingError("CASH_DISCREPANCY_REASON_REQUIRED", 409);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseCashSession",
      targetEntityId: session.id,
      requesterUserId: cashierUserId,
      approverUserId: input.approverUserId,
    });
    await tx.enterpriseCashCount.deleteMany({ where: { organizationId, cashSessionId: session.id } });
    if (input.counts.length) {
      await tx.enterpriseCashCount.createMany({
        data: input.counts.map((count) => ({
          organizationId,
          cashSessionId: session.id,
          denomination: new Prisma.Decimal(count.denomination),
          quantity: count.quantity,
          amount: new Prisma.Decimal(count.denomination).times(count.quantity),
          countedByUserId: cashierUserId,
        })),
      });
    }
    if (!discrepancy.isZero()) {
      await tx.enterpriseCashDiscrepancy.create({
        data: { organizationId, cashSessionId: session.id, amount: discrepancy, reason: input.closingReason!, createdByUserId: cashierUserId },
      });
    }
    const updated = await tx.enterpriseCashSession.update({
      where: { id: session.id },
      data: {
        status: "PENDING_VALIDATION",
        expectedClosingAmount: expected,
        countedClosingAmount: counted,
        discrepancyAmount: discrepancy,
        closingReason: input.closingReason || null,
        submittedAt: new Date(),
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseCashSession",
      entityId: session.id,
      eventType: "CASH_SESSION_SUBMITTED",
      summary: `Cash session ${session.number} submitted`,
      actorUserId: cashierUserId,
      fromStatus: "OPEN",
      toStatus: "PENDING_VALIDATION",
      metadataJson: {
        expected: expected.toFixed(),
        counted: counted.toFixed(),
        discrepancy: discrepancy.toFixed(),
        approvalId: approval.id,
        approverUserId: input.approverUserId,
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function validateCashSessionAssignedApproval(
  organizationId: string,
  sessionId: string,
  validatorUserId: string,
  input: { approve: boolean; reason?: string; revision: number },
) {
  if (!input.approve && !input.reason?.trim()) throw new EnterpriseAccountingError("CASH_REJECTION_REASON_REQUIRED", 409);
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseCashSession",
    targetEntityId: sessionId,
    actorUserId: validatorUserId,
  });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseCashSession.findFirst({ where: { id: sessionId, organizationId }, include: { discrepancies: true } });
    if (!session) throw new EnterpriseAccountingError("CASH_SESSION_NOT_FOUND", 404);
    if (session.status !== "PENDING_VALIDATION" || session.revision !== input.revision) throw new EnterpriseAccountingError("CASH_SESSION_CONFLICT", 409);

    const status = input.approve ? "CLOSED" : "REJECTED";
    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId: validatorUserId,
      status: input.approve ? "APPROVED" : "REJECTED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    if (input.approve) {
      await tx.enterpriseCashDiscrepancy.updateMany({
        where: { organizationId, cashSessionId: session.id, status: "PENDING" },
        data: { status: "APPROVED", approvedByUserId: validatorUserId },
      });
    }
    const updated = await tx.enterpriseCashSession.update({
      where: { id: session.id },
      data: {
        status,
        validatedByUserId: validatorUserId,
        validatedAt: input.approve ? new Date() : null,
        rejectedAt: input.approve ? null : new Date(),
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseCashSession",
      entityId: session.id,
      eventType: input.approve ? "CASH_SESSION_CLOSED" : "CASH_SESSION_REJECTED",
      summary: `Cash session ${session.number}: ${status}`,
      actorUserId: validatorUserId,
      fromStatus: "PENDING_VALIDATION",
      toStatus: status,
      metadataJson: {
        approvalId: approval.id,
        selfApprovalOverride: decision.selfApprovalOverride,
        ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}),
      },
    });
    return { updated, discrepancies: session.discrepancies };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (input.approve) {
    for (const discrepancy of result.discrepancies.filter((item) => !item.amount.isZero())) {
      await postBusinessEvent(organizationId, validatorUserId, {
        postingEvent: "CASH_VARIANCE_POSTED",
        sourceEntityType: "EnterpriseCashDiscrepancy",
        sourceEntityId: discrepancy.id,
      });
    }
  }
  return result.updated;
}

async function reconciliationSnapshot(organizationId: string, sessionId: string) {
  const session = await prisma.enterpriseReconciliationSession.findFirst({
    where: { id: sessionId, organizationId },
    include: { matches: true, financialAccount: true },
  });
  if (!session) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_NOT_FOUND", 404);
  const matchedTotal = money(sumDecimals(session.matches.filter((match) => match.status === "CONFIRMED").map((match) => match.matchedAmount)));
  const difference = money(session.statementBalance.minus(session.bookBalance));
  const tolerance = (await prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }))?.reconciliationTolerance || new Prisma.Decimal("0.01");
  return { session, matchedTotal, difference, tolerance };
}

export async function submitReconciliationForAssignedValidation(
  organizationId: string,
  sessionId: string,
  actorUserId: string,
  input: { revision: number; approverUserId: string; reason?: string },
) {
  const snapshot = await reconciliationSnapshot(organizationId, sessionId);
  if (snapshot.difference.abs().greaterThan(snapshot.tolerance)) {
    throw new EnterpriseAccountingError("RECONCILIATION_DIFFERENCE_UNRESOLVED", 409, {
      difference: snapshot.difference.toFixed(),
      matchedTotal: snapshot.matchedTotal.toFixed(),
    });
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseReconciliationSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseReconciliationSession.findFirst({ where: { id: sessionId, organizationId } });
    if (!session) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_NOT_FOUND", 404);
    if (!["DRAFT", "IN_PROGRESS"].includes(session.status) || session.revision !== input.revision) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_CONFLICT", 409);
    if (session.preparedByUserId !== actorUserId) throw new EnterpriseAccountingError("RECONCILIATION_SUBMITTER_MISMATCH", 403);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseReconciliationSession",
      targetEntityId: session.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
    });
    const updated = await tx.enterpriseReconciliationSession.update({
      where: { id: session.id },
      data: { status: "PENDING_VALIDATION", revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseReconciliationSession",
      entityId: session.id,
      eventType: "RECONCILIATION_SUBMITTED",
      summary: `Reconciliation ${session.number} submitted for validation`,
      actorUserId,
      fromStatus: session.status,
      toStatus: "PENDING_VALIDATION",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function decideReconciliationAssignedValidation(
  organizationId: string,
  sessionId: string,
  actorUserId: string,
  input: { action: "APPROVE" | "REJECT"; revision: number; reason?: string },
) {
  if (input.action === "REJECT" && !input.reason?.trim()) throw new EnterpriseAccountingError("RECONCILIATION_REJECTION_REASON_REQUIRED", 400);
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseReconciliationSession",
    targetEntityId: sessionId,
    actorUserId,
  });
  const snapshot = await reconciliationSnapshot(organizationId, sessionId);
  if (input.action === "APPROVE" && snapshot.difference.abs().greaterThan(snapshot.tolerance)) {
    throw new EnterpriseAccountingError("RECONCILIATION_DIFFERENCE_UNRESOLVED", 409, {
      difference: snapshot.difference.toFixed(),
      matchedTotal: snapshot.matchedTotal.toFixed(),
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseReconciliationSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseReconciliationSession.findFirst({ where: { id: sessionId, organizationId } });
    if (!session) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_NOT_FOUND", 404);
    if (session.status !== "PENDING_VALIDATION" || session.revision !== input.revision) throw new EnterpriseAccountingError("RECONCILIATION_SESSION_CONFLICT", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    if (input.action === "REJECT") {
      const updated = await tx.enterpriseReconciliationSession.update({
        where: { id: session.id },
        data: { status: "IN_PROGRESS", revision: { increment: 1 } },
      });
      await publishFinanceEvent(tx, {
        organizationId,
        entityType: "EnterpriseReconciliationSession",
        entityId: session.id,
        eventType: "RECONCILIATION_REJECTED",
        summary: `Reconciliation ${session.number} rejected for correction`,
        actorUserId,
        fromStatus: "PENDING_VALIDATION",
        toStatus: "IN_PROGRESS",
        metadataJson: { approvalId: approval.id, reason: input.reason!.slice(0, 500), selfApprovalOverride: decision.selfApprovalOverride },
      });
      return updated;
    }

    const updated = await tx.enterpriseReconciliationSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        approvedByUserId: actorUserId,
        completedAt: new Date(),
        reconciledDifference: snapshot.difference,
        revision: { increment: 1 },
      },
    });
    await tx.enterpriseFinancialAccount.update({
      where: { id: session.financialAccountId },
      data: { reconciledBalance: session.statementBalance, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseReconciliationSession",
      entityId: session.id,
      eventType: "RECONCILIATION_COMPLETED",
      summary: `Reconciliation ${session.number} completed`,
      actorUserId,
      fromStatus: "PENDING_VALIDATION",
      toStatus: "COMPLETED",
      metadataJson: {
        approvalId: approval.id,
        matchedTotal: snapshot.matchedTotal.toFixed(),
        difference: snapshot.difference.toFixed(),
        selfApprovalOverride: decision.selfApprovalOverride,
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}