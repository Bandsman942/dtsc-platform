import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createAccountingApprovalAssignment,
  decideAccountingApproval,
  requireAccountingApprovalDecision,
  cancelPendingAccountingApprovals,
} from "@/lib/enterprise/accounting/accounting-approval-service";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export async function submitJournalEntryForAssignedApproval(
  organizationId: string,
  entryId: string,
  actorUserId: string,
  input: { revision: number; approverUserId: string; reason?: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id = ${entryId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const entry = await tx.enterpriseJournalEntry.findFirst({
      where: { id: entryId, organizationId },
      include: { journal: true },
    });
    if (!entry) throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_FOUND", 404);
    if (entry.revision !== input.revision) throw new EnterpriseAccountingError("JOURNAL_ENTRY_REVISION_CONFLICT", 409, { currentRevision: entry.revision });
    if (entry.status !== "DRAFT" || !entry.journal.requiresApproval) throw new EnterpriseAccountingError("JOURNAL_ENTRY_TRANSITION_INVALID", 409);
    if (entry.preparedByUserId !== actorUserId) throw new EnterpriseAccountingError("JOURNAL_ENTRY_SUBMITTER_MISMATCH", 403);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseJournalEntry",
      targetEntityId: entry.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
    });
    const updated = await tx.enterpriseJournalEntry.update({
      where: { id: entry.id },
      data: { status: "PENDING_APPROVAL", revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseJournalEntry",
      entityId: entry.id,
      eventType: "JOURNAL_ENTRY_SUBMIT",
      summary: `Journal entry ${entry.number}: SUBMIT`,
      actorUserId,
      fromStatus: "DRAFT",
      toStatus: "PENDING_APPROVAL",
      metadataJson: {
        approvalId: approval.id,
        approverUserId: input.approverUserId,
        ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}),
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function decideJournalEntryAssignedApproval(
  organizationId: string,
  entryId: string,
  actorUserId: string,
  input: { action: "APPROVE" | "REJECT"; revision: number; reason?: string },
) {
  if (input.action === "REJECT" && !input.reason?.trim()) throw new EnterpriseAccountingError("JOURNAL_ENTRY_REJECTION_REASON_REQUIRED", 400);
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseJournalEntry",
    targetEntityId: entryId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id = ${entryId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const entry = await tx.enterpriseJournalEntry.findFirst({ where: { id: entryId, organizationId } });
    if (!entry) throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_FOUND", 404);
    if (entry.revision !== input.revision) throw new EnterpriseAccountingError("JOURNAL_ENTRY_REVISION_CONFLICT", 409, { currentRevision: entry.revision });
    if (entry.status !== "PENDING_APPROVAL") throw new EnterpriseAccountingError("JOURNAL_ENTRY_TRANSITION_INVALID", 409);

    const nextStatus = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const updated = await tx.enterpriseJournalEntry.update({
      where: { id: entry.id },
      data: {
        status: nextStatus,
        approvedByUserId: input.action === "APPROVE" ? actorUserId : entry.approvedByUserId,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseJournalEntry",
      entityId: entry.id,
      eventType: `JOURNAL_ENTRY_${input.action}`,
      summary: `Journal entry ${entry.number}: ${input.action}`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: nextStatus,
      metadataJson: {
        approvalId: approval.id,
        selfApprovalOverride: decision.selfApprovalOverride,
        ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}),
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitPaymentForAssignedApproval(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
  input: { revision: number; approverUserId: string; reason?: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment) throw new EnterpriseAccountingError("PAYMENT_NOT_FOUND", 404);
    if (payment.revision !== input.revision) throw new EnterpriseAccountingError("PAYMENT_REVISION_CONFLICT", 409, { currentRevision: payment.revision });
    if (payment.status !== "DRAFT") throw new EnterpriseAccountingError("PAYMENT_TRANSITION_INVALID", 409);
    if (payment.initiatedByUserId !== actorUserId) throw new EnterpriseAccountingError("PAYMENT_SUBMITTER_MISMATCH", 403);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterprisePayment",
      targetEntityId: payment.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
    });
    const updated = await tx.enterprisePayment.update({
      where: { id: payment.id },
      data: { status: "PENDING_APPROVAL", revision: { increment: 1 } },
    });
    await tx.enterprisePaymentEvent.create({
      data: {
        organizationId,
        paymentId: payment.id,
        actorUserId,
        eventType: "SUBMIT",
        summary: "Payment submitted for assigned approval",
        metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePayment",
      entityId: payment.id,
      eventType: "PAYMENT_SUBMIT",
      summary: `Payment ${payment.number}: SUBMIT`,
      actorUserId,
      fromStatus: "DRAFT",
      toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approvePaymentAssignedApproval(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
  input: { revision: number; reason?: string },
) {
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterprisePayment",
    targetEntityId: paymentId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment) throw new EnterpriseAccountingError("PAYMENT_NOT_FOUND", 404);
    if (payment.revision !== input.revision) throw new EnterpriseAccountingError("PAYMENT_REVISION_CONFLICT", 409, { currentRevision: payment.revision });
    if (payment.status !== "PENDING_APPROVAL") throw new EnterpriseAccountingError("PAYMENT_TRANSITION_INVALID", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: "APPROVED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const updated = await tx.enterprisePayment.update({
      where: { id: payment.id },
      data: { status: "APPROVED", approvedByUserId: actorUserId, revision: { increment: 1 } },
    });
    await tx.enterprisePaymentEvent.create({
      data: {
        organizationId,
        paymentId: payment.id,
        actorUserId,
        eventType: "APPROVE",
        summary: "Payment approved by assigned approver",
        metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePayment",
      entityId: payment.id,
      eventType: "PAYMENT_APPROVE",
      summary: `Payment ${payment.number}: APPROVE`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "APPROVED",
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelPaymentPendingApproval(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
  input: { revision: number; reason?: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const payment = await tx.enterprisePayment.findFirst({ where: { id: paymentId, organizationId } });
    if (!payment) throw new EnterpriseAccountingError("PAYMENT_NOT_FOUND", 404);
    if (payment.revision !== input.revision) throw new EnterpriseAccountingError("PAYMENT_REVISION_CONFLICT", 409, { currentRevision: payment.revision });
    if (!["DRAFT", "PENDING_APPROVAL"].includes(payment.status)) throw new EnterpriseAccountingError("PAYMENT_TRANSITION_INVALID", 409);
    if (payment.initiatedByUserId !== actorUserId) throw new EnterpriseAccountingError("PAYMENT_CANCEL_ACTOR_FORBIDDEN", 403);

    await cancelPendingAccountingApprovals(tx, {
      organizationId,
      targetEntityTypes: ["EnterprisePayment"],
      targetEntityId: payment.id,
      reason: input.reason,
    });
    const updated = await tx.enterprisePayment.update({
      where: { id: payment.id },
      data: { status: "CANCELLED", revision: { increment: 1 } },
    });
    await tx.enterprisePaymentEvent.create({
      data: { organizationId, paymentId: payment.id, actorUserId, eventType: "CANCEL", summary: "Payment cancelled" },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterprisePayment",
      entityId: payment.id,
      eventType: "PAYMENT_CANCEL",
      summary: `Payment ${payment.number}: CANCEL`,
      actorUserId,
      fromStatus: payment.status,
      toStatus: "CANCELLED",
      metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined,
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}