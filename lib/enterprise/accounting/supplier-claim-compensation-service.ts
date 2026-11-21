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

// The frozen accounting proof stays server-side. Never represent this as an
// allocation, payment, posted journal or even a reservation.
export function supplierCompensationDraftProjection(row: Awaited<ReturnType<typeof prepareSupplierClaimCompensation>>) {
  return { id: row.id, claimId: row.claimId, payableId: row.payableId, amount: row.amount,
    currencyCode: row.currencyCode, accountingDate: row.accountingDate, supplierReference: row.supplierReference,
    reason: row.reason, status: row.status, revision: row.revision, requestedByUserId: row.requestedByUserId,
    cancelledAt: row.cancelledAt, cancellationReason: row.cancellationReason, createdAt: row.createdAt,
    submittedAt: row.submittedAt, approverUserId: row.approverUserId,
    reservationActive: ["PENDING_APPROVAL", "APPROVED"].includes(row.status), executionAvailable: false as const };
}
