import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { lockSupplierClaimRefundTx, readSupplierClaimRefundEvidenceTx, readSupplierClaimCompensationEvidenceTx } from "@/lib/enterprise/accounting/supplier-return-claim-refunds";
import { lockSupplierReturnInvoiceTx } from "@/lib/enterprise/accounting/supplier-return-credit-reconciliation";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { isValidEnterpriseActivityCivilDate } from "@/lib/enterprise/enterprise-activity-civil-date";

type DraftInput = { claimId: string; payableId: string; amount: string; accountingDate: string;
  supplierReference: string; reason: string; idempotencyKey: string };

const conflict = (): never => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_DRAFT_CONFLICT", 409); };

export async function assertSupplierCompensationScopeTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string) {
  // The target invoice has no canonical site dimension: fail closed for every
  // site-scoped actor, regardless of the originating claim's warehouse.
  if (await retailFinanceReadSiteScope(organizationId, actorUserId, "COLLECT_PAYMENT", tx) !== null) {
    throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
  }
}

function handleConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError &&
      (["P2034", "P2002"].includes(error.code) ||
        (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))))) return conflict();
  throw error;
}

/** Preparing a draft does not reserve either balance. The future submit
 * transition must revalidate the immutable evidence and both capacities. */
export async function prepareSupplierClaimCompensation(organizationId: string, actorUserId: string, input: DraftInput) {
  if (!isValidEnterpriseActivityCivilDate(input.accountingDate) || !/^\d{1,14}(\.\d{1,6})?$/.test(input.amount))
    return conflict();
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.gt(0) || !input.supplierReference.trim() || input.reason.trim().length < 8 || !input.idempotencyKey.trim()) return conflict();
  const accountingDate = new Date(input.accountingDate + "T00:00:00.000Z");
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    // Both future reservation paths must use this ordering: claim, then invoice.
    await lockSupplierClaimRefundTx(tx, organizationId, input.claimId);
    const existing = await tx.enterpriseSupplierClaimCompensation.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.requestedByUserId !== actorUserId || existing.claimId !== input.claimId ||
          existing.payableId !== input.payableId || !existing.amount.equals(amount) ||
          existing.accountingDate.getTime() !== accountingDate.getTime() ||
          existing.supplierReference !== input.supplierReference || existing.reason !== input.reason) return conflict();
      return existing;
    }
    const payable = await tx.enterprisePayable.findFirst({
      where: { organizationId, id: input.payableId }, select: { supplierInvoiceId: true },
    });
    if (!payable) return conflict();
    await lockSupplierReturnInvoiceTx(tx, organizationId, payable.supplierInvoiceId);
    const proof = await readSupplierClaimRefundEvidenceTx(tx, organizationId, input.claimId);
    const { evidence, preview } = await readSupplierClaimCompensationEvidenceTx(tx, organizationId, proof, input.payableId, input);
    if (!preview.plan || !proof.claim.creditJournalEntryId || !proof.claim.settlementClaimAccountId ||
        evidence.targetInvoiceId !== payable.supplierInvoiceId) return conflict();
    const draft = await tx.enterpriseSupplierClaimCompensation.create({
      data: { organizationId, claimId: input.claimId, payableId: input.payableId,
        currencyCode: preview.currencyCode, amount, accountingDate, supplierReference: input.supplierReference,
        reason: input.reason, requestedByUserId: actorUserId, idempotencyKey: input.idempotencyKey,
        sourceCreditJournalId: proof.claim.creditJournalEntryId, targetInvoiceJournalId: evidence.targetInvoiceJournalId,
        claimAccountId: proof.claim.settlementClaimAccountId, payableAccountId: evidence.payableAccountId },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierClaimCompensation", entityId: draft.id,
      eventType: "SUPPLIER_CLAIM_COMPENSATION_DRAFT_CREATED", summary: "Supplier claim compensation draft prepared",
      actorUserId, toStatus: "DRAFT", metadataJson: { claimId: draft.claimId, payableId: draft.payableId, amount: amount.toFixed(), currency: draft.currencyCode, reserved: false } });
    return draft;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(handleConflict);
}


/** Reserve both sides only when the draft is submitted for an independent
 * canonical Finance approval. No payable allocation or posting is emitted. */
export async function submitSupplierClaimCompensation(
  organizationId: string, actorUserId: string,
  input: { compensationId: string; revision: number; approverUserId: string },
) {
  if (!input.approverUserId || input.approverUserId === actorUserId) {
    throw new EnterpriseAccountingError("ACCOUNTING_SELF_APPROVAL_FORBIDDEN", 403);
  }
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    const initial = await tx.enterpriseSupplierClaimCompensation.findFirst({
      where: { organizationId, id: input.compensationId },
      select: { claimId: true, payableId: true, requestedByUserId: true },
    });
    if (!initial) throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_NOT_FOUND", 404);
    if (initial.requestedByUserId !== actorUserId) throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
    await lockSupplierClaimRefundTx(tx, organizationId, initial.claimId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierClaimCompensation" WHERE id = ${input.compensationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const draft = await tx.enterpriseSupplierClaimCompensation.findFirst({ where: { organizationId, id: input.compensationId } });
    if (!draft || draft.claimId !== initial.claimId || draft.payableId !== initial.payableId) return conflict();
    if (draft.status === "PENDING_APPROVAL" && draft.revision === input.revision + 1 && draft.approverUserId === input.approverUserId)
      return draft;
    if (draft.status !== "DRAFT" || draft.revision !== input.revision) return conflict();
    const payable = await tx.enterprisePayable.findFirst({
      where: { organizationId, id: draft.payableId }, select: { supplierInvoiceId: true },
    });
    if (!payable) return conflict();
    await lockSupplierReturnInvoiceTx(tx, organizationId, payable.supplierInvoiceId);
    const proof = await readSupplierClaimRefundEvidenceTx(tx, organizationId, draft.claimId);
    const { evidence, preview } = await readSupplierClaimCompensationEvidenceTx(tx, organizationId, proof, draft.payableId, {
      amount: draft.amount.toFixed(), accountingDate: formatSupplierCompensationCivilDate(draft.accountingDate),
    });
    if (!preview.plan || evidence.targetInvoiceId !== payable.supplierInvoiceId ||
        !draft.amount.equals(preview.plan.amount) || draft.currencyCode !== preview.currencyCode ||
        draft.sourceCreditJournalId !== proof.claim.creditJournalEntryId ||
        draft.claimAccountId !== proof.claim.settlementClaimAccountId ||
        draft.targetInvoiceJournalId !== evidence.targetInvoiceJournalId ||
        draft.payableAccountId !== evidence.payableAccountId) return conflict();
    const { createAccountingApprovalAssignment } = await import("@/lib/enterprise/accounting/accounting-approval-service");
    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId, targetEntityType: "EnterpriseSupplierClaimCompensation", targetEntityId: draft.id,
      requesterUserId: actorUserId, approverUserId: input.approverUserId,
    });
    const updated = await tx.enterpriseSupplierClaimCompensation.update({
      where: { organizationId_id: { organizationId, id: draft.id } },
      data: { status: "PENDING_APPROVAL", submittedAt: new Date(), approverUserId: input.approverUserId, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierClaimCompensation", entityId: draft.id,
      eventType: "SUPPLIER_CLAIM_COMPENSATION_SUBMITTED", summary: "Supplier claim compensation assigned for review",
      actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId, amount: draft.amount.toFixed() } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(handleConflict);
}

function formatSupplierCompensationCivilDate(value: Date) {
  // A stored canonical date-only value is UTC midnight by contract.
  const year = value.getUTCFullYear(), month = value.getUTCMonth() + 1, day = value.getUTCDate();
  const text = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  if (!isValidEnterpriseActivityCivilDate(text) || new Date(text + "T00:00:00.000Z").getTime() !== value.getTime()) return conflict();
  return text;
}

export async function cancelSupplierClaimCompensation(organizationId: string, actorUserId: string,
  input: { compensationId: string; revision: number; reason: string }) {
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierClaimCompensation" WHERE id = ${input.compensationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const draft = await tx.enterpriseSupplierClaimCompensation.findFirst({ where: { organizationId, id: input.compensationId } });
    if (!draft) throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_NOT_FOUND", 404);
    if (draft.requestedByUserId !== actorUserId)
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
    if (draft.status === "CANCELLED" && draft.revision === input.revision + 1 && draft.cancellationReason === input.reason)
      return draft;
    if (draft.status !== "DRAFT" || draft.revision !== input.revision || input.reason.trim().length < 8) return conflict();
    const cancelled = await tx.enterpriseSupplierClaimCompensation.update({
      where: { organizationId_id: { organizationId, id: draft.id } },
      data: { status: "CANCELLED", cancelledByUserId: actorUserId, cancelledAt: new Date(),
        cancellationReason: input.reason, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierClaimCompensation", entityId: draft.id,
      eventType: "SUPPLIER_CLAIM_COMPENSATION_DRAFT_CANCELLED", summary: "Supplier claim compensation draft cancelled",
      actorUserId, fromStatus: "DRAFT", toStatus: "CANCELLED" });
    return cancelled;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(handleConflict);
}

async function revalidateCompensationReservationTx(tx: Prisma.TransactionClient, organizationId: string, draft: {
  id: string; claimId: string; payableId: string; amount: Prisma.Decimal; accountingDate: Date;
  sourceCreditJournalId: string; targetInvoiceJournalId: string; claimAccountId: string; payableAccountId: string;
  currencyCode: string;
}) {
  const payable = await tx.enterprisePayable.findFirst({
    where: { organizationId, id: draft.payableId }, select: { supplierInvoiceId: true },
  });
  if (!payable) return conflict();
  await lockSupplierReturnInvoiceTx(tx, organizationId, payable.supplierInvoiceId);
  const proof = await readSupplierClaimRefundEvidenceTx(tx, organizationId, draft.claimId, undefined, draft.id);
  const { evidence, preview } = await readSupplierClaimCompensationEvidenceTx(tx, organizationId, proof, draft.payableId,
    { amount: draft.amount.toFixed(), accountingDate: formatSupplierCompensationCivilDate(draft.accountingDate) }, draft.id);
  if (!preview.plan || !draft.amount.equals(preview.plan.amount) || draft.currencyCode !== preview.currencyCode ||
      payable.supplierInvoiceId !== evidence.targetInvoiceId || draft.sourceCreditJournalId !== proof.claim.creditJournalEntryId ||
      draft.claimAccountId !== proof.claim.settlementClaimAccountId ||
      draft.targetInvoiceJournalId !== evidence.targetInvoiceJournalId ||
      draft.payableAccountId !== evidence.payableAccountId) return conflict();
  return { proof, payable, preview };
}

/** Assigned decision revalidates current accounting evidence before approval.
 * Rejection simply releases the two reservations, without a fake cash flow. */
export async function decideSupplierClaimCompensation(
  organizationId: string, actorUserId: string,
  input: { compensationId: string; revision: number; action: "APPROVE" | "REJECT"; reason?: string },
) {
  if (input.action === "REJECT" && (!input.reason || input.reason.trim().length < 8)) return conflict();
  const { requireAccountingApprovalDecision, decideAccountingApproval } = await import("@/lib/enterprise/accounting/accounting-approval-service");
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId, targetEntityType: "EnterpriseSupplierClaimCompensation",
    targetEntityId: input.compensationId, actorUserId,
  });
  if (decision.selfApprovalOverride || approval.requestedByUserId === actorUserId)
    throw new EnterpriseAccountingError("ACCOUNTING_SELF_APPROVAL_FORBIDDEN", 403);
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    const initial = await tx.enterpriseSupplierClaimCompensation.findFirst({
      where: { organizationId, id: input.compensationId }, select: { claimId: true },
    });
    if (!initial) throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_NOT_FOUND", 404);
    await lockSupplierClaimRefundTx(tx, organizationId, initial.claimId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierClaimCompensation" WHERE id = ${input.compensationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const draft = await tx.enterpriseSupplierClaimCompensation.findFirst({
      where: { organizationId, id: input.compensationId },
    });
    if (!draft || draft.claimId !== initial.claimId || draft.status !== "PENDING_APPROVAL" ||
        draft.revision !== input.revision || draft.approverUserId !== actorUserId ||
        draft.requestedByUserId === actorUserId || !draft.submittedAt) return conflict();
    if (input.action === "APPROVE") await revalidateCompensationReservationTx(tx, organizationId, draft);
    await decideAccountingApproval(tx, {
      organizationId, approvalId: approval.id, approvalRevision: approval.revision,
      actorUserId, status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      decisionComment: input.reason, selfApprovalOverride: false,
    });
    const toStatus = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseSupplierClaimCompensation.update({
      where: { organizationId_id: { organizationId, id: draft.id } },
      data: { status: toStatus, revision: { increment: 1 },
        ...(input.action === "APPROVE"
          ? { approvedAt: new Date(), approvedByUserId: actorUserId }
          : { rejectedAt: new Date(), rejectedByUserId: actorUserId, rejectionReason: input.reason!.trim() }) },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseSupplierClaimCompensation", entityId: draft.id,
      eventType: "SUPPLIER_CLAIM_COMPENSATION_" + toStatus,
      summary: "Supplier claim compensation " + toStatus.toLowerCase(),
      actorUserId, fromStatus: "PENDING_APPROVAL", toStatus,
      metadataJson: { approvalId: approval.id, amount: draft.amount.toFixed(), currency: draft.currencyCode },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(handleConflict);
}

/** The canonical posting and both financial projections commit atomically.
 * No EnterprisePayment or TreasuryTransaction is created by offsetting debt. */
export async function postSupplierClaimCompensation(
  organizationId: string, actorUserId: string,
  input: { compensationId: string; revision: number },
) {
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    const initial = await tx.enterpriseSupplierClaimCompensation.findFirst({
      where: { organizationId, id: input.compensationId }, select: { claimId: true },
    });
    if (!initial) throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_NOT_FOUND", 404);
    await lockSupplierClaimRefundTx(tx, organizationId, initial.claimId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierClaimCompensation" WHERE id = ${input.compensationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const draft = await tx.enterpriseSupplierClaimCompensation.findFirst({ where: { organizationId, id: input.compensationId } });
    if (!draft || draft.claimId !== initial.claimId) return conflict();
    if (draft.status === "POSTED" && draft.revision === input.revision + 1) return draft;
    if (draft.status !== "APPROVED" || draft.revision !== input.revision ||
        !draft.approvedAt || !draft.approvedByUserId || draft.approvedByUserId !== draft.approverUserId ||
        !draft.submittedAt || actorUserId === draft.requestedByUserId || actorUserId === draft.approvedByUserId)
      return conflict();
    const { proof, payable } = await revalidateCompensationReservationTx(tx, organizationId, draft);
    if (proof.claim.supplierId !== proof.invoice.supplierId) return conflict();
    const { postBusinessEventTx } = await import("@/lib/enterprise/accounting/posting-service");
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
      postingEvent: "SUPPLIER_CLAIM_COMPENSATION_POSTED",
      sourceEntityType: "EnterpriseSupplierClaimCompensation", sourceEntityId: draft.id,
    }, { supplierClaimCompensationTransition: true });
    const current = await tx.enterprisePayable.findFirst({ where: { organizationId, id: draft.payableId } });
    if (!current || !current.outstandingAmount.isFinite() || current.outstandingAmount.lt(draft.amount) ||
        current.supplierInvoiceId !== payable.supplierInvoiceId ||
        current.currencyCode !== draft.currencyCode) return conflict();
    const outstanding = current.outstandingAmount.minus(draft.amount);
    await tx.enterprisePayableAllocation.create({ data: {
      organizationId, payableId: current.id, sourceType: "SUPPLIER_CLAIM_COMPENSATION", sourceId: draft.id,
      amount: draft.amount, allocationDate: draft.accountingDate, createdByUserId: actorUserId,
    } });
    await tx.enterprisePayable.update({ where: { id: current.id }, data: {
      compensatedAmount: { increment: draft.amount }, outstandingAmount: outstanding,
      status: outstanding.isZero() ? "CLOSED" : "OPEN",
    } });
    await tx.enterpriseSupplierInvoice.update({ where: { id: current.supplierInvoiceId }, data: {
      amountCompensated: { increment: draft.amount }, outstandingAmount: outstanding,
      status: outstanding.isZero() ? "PAID" : "POSTED", revision: { increment: 1 },
    } });
    const updated = await tx.enterpriseSupplierClaimCompensation.update({
      where: { organizationId_id: { organizationId, id: draft.id } },
      data: { status: "POSTED", postedAt: new Date(), postedByUserId: actorUserId,
        postingJournalEntryId: posting.entry.id, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId, entityType: "EnterpriseSupplierClaimCompensation", entityId: draft.id,
      eventType: "SUPPLIER_CLAIM_COMPENSATION_POSTED", summary: "Supplier claim settled against an open payable",
      actorUserId, fromStatus: "APPROVED", toStatus: "POSTED",
      metadataJson: { payableId: draft.payableId, journalEntryId: posting.entry.id, amount: draft.amount.toFixed(), currency: draft.currencyCode, treasuryImpact: "0" },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }).catch(handleConflict);
}

export async function readSupplierClaimCompensation(organizationId: string, actorUserId: string, compensationId: string, canSeeAll: boolean) {
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    const draft = await tx.enterpriseSupplierClaimCompensation.findFirst({
      where: { organizationId, id: compensationId, ...(canSeeAll ? {} : { requestedByUserId: actorUserId }) },
    });
    if (!draft) throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_NOT_FOUND", 404);
    return draft;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/** Page-bounded claim workflow history. No private ledger identifiers
 * are exposed and site-scoped operators cannot see another store's debts. */
export async function listSupplierClaimCompensations(
  organizationId: string, actorUserId: string, claimId: string, canSeeAll: boolean,
  page: number, status?: string,
) {
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    const where = { organizationId, claimId, ...(canSeeAll ? {} : { requestedByUserId: actorUserId }),
      ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      tx.enterpriseSupplierClaimCompensation.findMany({
        where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 25, take: 25,
        include: { payable: { select: { supplierInvoice: { select: { number: true } } } } },
      }),
      tx.enterpriseSupplierClaimCompensation.count({ where }),
    ]);
    const actorIds = [...new Set(items.flatMap(item =>
      [item.requestedByUserId, item.approverUserId, item.approvedByUserId, item.postedByUserId, item.reversedByUserId]
        .filter((id): id is string => Boolean(id))))];
    const actors = actorIds.length
      ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(actors.map(actor => [actor.id, actor.name]));
    return {
      items: items.map(item => ({
        ...supplierCompensationDraftProjection(item),
        targetInvoiceNumber: item.payable.supplierInvoice.number,
        requestedByName: names.get(item.requestedByUserId) || null,
        approverName: item.approverUserId ? names.get(item.approverUserId) || null : null,
        postedByName: item.postedByUserId ? names.get(item.postedByUserId) || null : null,
        reversedByName: item.reversedByUserId ? names.get(item.reversedByUserId) || null : null,
      })),
      pagination: { page, pageSize: 25, total, pageCount: Math.max(1, Math.ceil(total / 25)) },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

// The frozen accounting proof stays server-side. Never represent this as an
// allocation, payment, posted journal or even a reservation.
export function supplierCompensationDraftProjection(row: Awaited<ReturnType<typeof prepareSupplierClaimCompensation>>) {
  return { id: row.id, claimId: row.claimId, payableId: row.payableId, amount: row.amount,
    currencyCode: row.currencyCode, accountingDate: row.accountingDate, supplierReference: row.supplierReference,
    reason: row.reason, status: row.status, revision: row.revision, requestedByUserId: row.requestedByUserId,
    cancelledAt: row.cancelledAt, cancellationReason: row.cancellationReason, createdAt: row.createdAt,
    submittedAt: row.submittedAt, approverUserId: row.approverUserId,
    approvedAt: row.approvedAt, approvedByUserId: row.approvedByUserId,
    postedAt: row.postedAt, postingJournalEntryId: row.postingJournalEntryId,
    reversedAt: row.reversedAt, reversedByUserId: row.reversedByUserId,
    reversalReason: row.reversalReason, reversalJournalEntryId: row.reversalJournalEntryId,
    reservationActive: ["PENDING_APPROVAL", "APPROVED"].includes(row.status), executionAvailable: false as const };
}

// Posting can only be invoked by the approved compensation transition.
// The registry deliberately exposes no standalone accounting-adjustment route.
export const buildSupplierClaimCompensationPosting: import("@/lib/enterprise/accounting/posting-types").PostingBuilder = async (tx, input) => {
  if (input.sourceEntityType !== "EnterpriseSupplierClaimCompensation") return conflict();
  const row = await tx.enterpriseSupplierClaimCompensation.findFirst({
    where: { organizationId: input.organizationId, id: input.sourceEntityId, status: "APPROVED" },
    include: { claim: true, payable: { include: { supplierInvoice: true } } },
  });
  if (!row || !row.approvedAt || !row.approvedByUserId || row.approvedByUserId !== row.approverUserId ||
      row.approvedByUserId === row.requestedByUserId || !row.submittedAt ||
      !row.amount.isFinite() || !row.amount.gt(0) || !row.claim.settlementClaimAmount?.gt(0) ||
      row.claim.creditJournalEntryId !== row.sourceCreditJournalId ||
      row.claim.settlementClaimAccountId !== row.claimAccountId ||
      row.claim.supplierId !== row.payable.supplierId ||
      row.payable.supplierInvoice.supplierId !== row.claim.supplierId ||
      row.payable.businessPartyId !== row.payable.supplierInvoice.businessPartyId ||
      row.payable.currencyCode !== row.currencyCode ||
      row.payableAccountId === row.claimAccountId || !row.payable.businessPartyId) return conflict();
  const approval = await tx.enterpriseApproval.findFirst({
    where: { organizationId: input.organizationId, targetEntityType: "EnterpriseSupplierClaimCompensation",
      targetEntityId: row.id, status: "APPROVED", archivedAt: null,
      requestedByUserId: row.requestedByUserId, approverUserId: row.approvedByUserId },
    select: { id: true },
  });
  if (!approval) return conflict();
  const partyId = row.payable.businessPartyId;
  const common = { transactionCurrencyCode: row.currencyCode, transactionAmount: row.amount,
    businessPartyId: partyId, description: row.supplierReference };
  return {
    organizationId: input.organizationId, journalType: "GENERAL",
    accountingDate: row.accountingDate, documentDate: row.accountingDate,
    reference: row.supplierReference, description: "Supplier claim offset " + row.supplierReference,
    sourceModule: "FINANCE_PAYABLES", sourceEntityType: "EnterpriseSupplierClaimCompensation",
    sourceEntityId: row.id, currencyCode: row.currencyCode,
    lines: [
      { ...common, accountMappingKey: "ACCOUNTS_PAYABLE", debit: row.amount },
      { ...common, accountMappingKey: "SUPPLIER_RETURN_CLAIMS", credit: row.amount },
    ],
  };
};
