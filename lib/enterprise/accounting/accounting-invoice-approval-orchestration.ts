import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  activateQueuedAccountingApproval,
  assertAccountingApprovalCandidate,
  cancelPendingAccountingApprovals,
  createAccountingApprovalAssignment,
  decideAccountingApproval,
  requireAccountingApprovalDecision,
} from "@/lib/enterprise/accounting/accounting-approval-service";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export async function submitSalesInvoiceForAssignedApproval(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { revision: number; approverUserId: string; reason?: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SALES_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    if (invoice.status !== "DRAFT") throw new EnterpriseAccountingError("SALES_INVOICE_TRANSITION_INVALID", 409);
    if (invoice.createdByUserId !== actorUserId) throw new EnterpriseAccountingError("SALES_INVOICE_SUBMITTER_MISMATCH", 403);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseSalesInvoice",
      targetEntityId: invoice.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
    });
    const updated = await tx.enterpriseSalesInvoice.update({
      where: { id: invoice.id },
      data: { status: "PENDING_APPROVAL", revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesInvoice",
      entityId: invoice.id,
      eventType: "SALES_INVOICE_SUBMIT",
      summary: `Customer invoice ${invoice.number}: SUBMIT`,
      actorUserId,
      fromStatus: "DRAFT",
      toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveSalesInvoiceAssignedApproval(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { revision: number; reason?: string },
) {
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseSalesInvoice",
    targetEntityId: invoiceId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SALES_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    if (invoice.status !== "PENDING_APPROVAL") throw new EnterpriseAccountingError("SALES_INVOICE_TRANSITION_INVALID", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: "APPROVED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const updated = await tx.enterpriseSalesInvoice.update({
      where: { id: invoice.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: actorUserId, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesInvoice",
      entityId: invoice.id,
      eventType: "SALES_INVOICE_APPROVE",
      summary: `Customer invoice ${invoice.number}: APPROVE`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "APPROVED",
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitSupplierInvoiceForAssignedReview(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { revision: number; reviewerUserId: string; approverUserId: string; reason?: string },
) {
  if (input.reviewerUserId === input.approverUserId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVIEWER_APPROVER_MUST_DIFFER", 400);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    if (invoice.status !== "DRAFT") throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TRANSITION_INVALID", 409);
    if (invoice.createdByUserId !== actorUserId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_SUBMITTER_MISMATCH", 403);

    const review = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseSupplierInvoiceReview",
      targetEntityId: invoice.id,
      requesterUserId: actorUserId,
      approverUserId: input.reviewerUserId,
    });
    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseSupplierInvoiceApproval",
      targetEntityId: invoice.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
      initialStatus: "QUEUED",
    });
    const updated = await tx.enterpriseSupplierInvoice.update({
      where: { id: invoice.id },
      data: { status: "PENDING_REVIEW", revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierInvoice",
      entityId: invoice.id,
      eventType: "SUPPLIER_INVOICE_SUBMIT",
      summary: `Supplier invoice ${invoice.number}: SUBMIT`,
      actorUserId,
      fromStatus: "DRAFT",
      toStatus: "PENDING_REVIEW",
      metadataJson: {
        reviewApprovalId: review.id,
        reviewerUserId: input.reviewerUserId,
        finalApprovalId: approval.id,
        approverUserId: input.approverUserId,
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reviewSupplierInvoiceAssignedStep(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { revision: number; reason?: string },
) {
  const [{ approval: reviewApproval, decision }, queuedApproval] = await Promise.all([
    requireAccountingApprovalDecision({
      organizationId,
      targetEntityType: "EnterpriseSupplierInvoiceReview",
      targetEntityId: invoiceId,
      actorUserId,
    }),
    prisma.enterpriseApproval.findFirst({
      where: {
        organizationId,
        targetEntityType: "EnterpriseSupplierInvoiceApproval",
        targetEntityId: invoiceId,
        status: "QUEUED",
        archivedAt: null,
      },
      select: { requestedByUserId: true, approverUserId: true },
    }),
  ]);
  if (!queuedApproval) throw new EnterpriseAccountingError("ACCOUNTING_QUEUED_APPROVAL_NOT_FOUND", 409);
  await assertAccountingApprovalCandidate({
    organizationId,
    targetEntityType: "EnterpriseSupplierInvoiceApproval",
    requesterUserId: queuedApproval.requestedByUserId,
    approverUserId: queuedApproval.approverUserId,
  });

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    if (invoice.status !== "PENDING_REVIEW") throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TRANSITION_INVALID", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: reviewApproval.id,
      approvalRevision: reviewApproval.revision,
      actorUserId,
      status: "APPROVED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const finalApprovalId = await activateQueuedAccountingApproval(tx, {
      organizationId,
      targetEntityType: "EnterpriseSupplierInvoiceApproval",
      targetEntityId: invoice.id,
    });
    const updated = await tx.enterpriseSupplierInvoice.update({
      where: { id: invoice.id },
      data: { status: "PENDING_APPROVAL", reviewedByUserId: actorUserId, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierInvoice",
      entityId: invoice.id,
      eventType: "SUPPLIER_INVOICE_REVIEW",
      summary: `Supplier invoice ${invoice.number}: REVIEW`,
      actorUserId,
      fromStatus: "PENDING_REVIEW",
      toStatus: "PENDING_APPROVAL",
      metadataJson: {
        reviewApprovalId: reviewApproval.id,
        finalApprovalId,
        selfApprovalOverride: decision.selfApprovalOverride,
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveSupplierInvoiceAssignedStep(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { revision: number; reason?: string },
) {
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseSupplierInvoiceApproval",
    targetEntityId: invoiceId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { threeWayMatch: true },
    });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    if (invoice.status !== "PENDING_APPROVAL") throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TRANSITION_INVALID", 409);
    if (invoice.threeWayMatch?.status === "VARIANCE" && !invoice.threeWayMatch.overrideReason) throw new EnterpriseAccountingError("THREE_WAY_MATCH_VARIANCE_UNRESOLVED", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: "APPROVED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const updated = await tx.enterpriseSupplierInvoice.update({
      where: { id: invoice.id },
      data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date(), revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierInvoice",
      entityId: invoice.id,
      eventType: "SUPPLIER_INVOICE_APPROVE",
      summary: `Supplier invoice ${invoice.number}: APPROVE`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "APPROVED",
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectSupplierInvoiceAssignedStep(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { revision: number; reason: string },
) {
  const snapshot = await prisma.enterpriseSupplierInvoice.findFirst({ where: { id: invoiceId, organizationId }, select: { status: true } });
  if (!snapshot) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
  const targetEntityType = snapshot.status === "PENDING_REVIEW"
    ? "EnterpriseSupplierInvoiceReview"
    : snapshot.status === "PENDING_APPROVAL"
      ? "EnterpriseSupplierInvoiceApproval"
      : null;
  if (!targetEntityType) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TRANSITION_INVALID", 409);
  const { approval, decision } = await requireAccountingApprovalDecision({ organizationId, targetEntityType, targetEntityId: invoiceId, actorUserId });

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    if (invoice.status !== snapshot.status) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: "REJECTED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    await cancelPendingAccountingApprovals(tx, {
      organizationId,
      targetEntityTypes: ["EnterpriseSupplierInvoiceReview", "EnterpriseSupplierInvoiceApproval"],
      targetEntityId: invoice.id,
      reason: input.reason,
    });
    const updated = await tx.enterpriseSupplierInvoice.update({
      where: { id: invoice.id },
      data: { status: "REJECTED", revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierInvoice",
      entityId: invoice.id,
      eventType: "SUPPLIER_INVOICE_REJECT",
      summary: `Supplier invoice ${invoice.number}: REJECT`,
      actorUserId,
      fromStatus: snapshot.status,
      toStatus: "REJECTED",
      metadataJson: { approvalId: approval.id, reason: input.reason.slice(0, 500), selfApprovalOverride: decision.selfApprovalOverride },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelSupplierInvoicePendingReview(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { revision: number; reason?: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    if (!["DRAFT", "PENDING_REVIEW"].includes(invoice.status)) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TRANSITION_INVALID", 409);
    if (invoice.createdByUserId !== actorUserId) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_CANCEL_ACTOR_FORBIDDEN", 403);

    await cancelPendingAccountingApprovals(tx, {
      organizationId,
      targetEntityTypes: ["EnterpriseSupplierInvoiceReview", "EnterpriseSupplierInvoiceApproval"],
      targetEntityId: invoice.id,
      reason: input.reason,
    });
    const updated = await tx.enterpriseSupplierInvoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", revision: { increment: 1 } } });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierInvoice",
      entityId: invoice.id,
      eventType: "SUPPLIER_INVOICE_CANCEL",
      summary: `Supplier invoice ${invoice.number}: CANCEL`,
      actorUserId,
      fromStatus: invoice.status,
      toStatus: "CANCELLED",
      metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined,
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}