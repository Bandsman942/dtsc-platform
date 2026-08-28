import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createAccountingApprovalAssignment,
  decideAccountingApproval,
  requireAccountingApprovalDecision,
} from "@/lib/enterprise/accounting/accounting-approval-service";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

type AssignedDocumentSubmitInput = {
  revision: number;
  approverUserId: string;
  reason?: string;
};

type AssignedDocumentDecisionInput = {
  action: "APPROVE" | "REJECT";
  revision: number;
  reason?: string;
};

function requireRejectionReason(input: AssignedDocumentDecisionInput) {
  if (input.action === "REJECT" && !input.reason?.trim()) {
    throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_REJECTION_REASON_REQUIRED", 400);
  }
}

export async function submitOpeningBalanceForAssignedApproval(
  organizationId: string,
  openingId: string,
  actorUserId: string,
  input: AssignedDocumentSubmitInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseOpeningBalanceImport" WHERE id = ${openingId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const opening = await tx.enterpriseOpeningBalanceImport.findFirst({ where: { id: openingId, organizationId } });
    if (!opening) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_FOUND", 404);
    if (!(["DRAFT", "REJECTED"].includes(opening.status)) || opening.revision !== input.revision) {
      throw new EnterpriseAccountingError("OPENING_BALANCE_CONFLICT", 409);
    }
    if (opening.preparedByUserId !== actorUserId) throw new EnterpriseAccountingError("OPENING_BALANCE_SUBMITTER_MISMATCH", 403);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseOpeningBalanceApproval",
      targetEntityId: opening.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
    });
    const updated = await tx.enterpriseOpeningBalanceImport.update({
      where: { id: opening.id },
      data: { status: "PENDING_APPROVAL", approvedByUserId: null, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseOpeningBalanceImport",
      entityId: opening.id,
      eventType: "OPENING_BALANCE_SUBMITTED",
      summary: `Opening balance ${opening.reference} submitted for approval`,
      actorUserId,
      fromStatus: opening.status,
      toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId, ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function decideOpeningBalanceAssignedApproval(
  organizationId: string,
  openingId: string,
  actorUserId: string,
  input: AssignedDocumentDecisionInput,
) {
  requireRejectionReason(input);
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseOpeningBalanceApproval",
    targetEntityId: openingId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseOpeningBalanceImport" WHERE id = ${openingId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const opening = await tx.enterpriseOpeningBalanceImport.findFirst({ where: { id: openingId, organizationId } });
    if (!opening) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_FOUND", 404);
    if (opening.status !== "PENDING_APPROVAL" || opening.revision !== input.revision) throw new EnterpriseAccountingError("OPENING_BALANCE_CONFLICT", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const nextStatus = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseOpeningBalanceImport.update({
      where: { id: opening.id },
      data: { status: nextStatus, approvedByUserId: input.action === "APPROVE" ? actorUserId : null, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseOpeningBalanceImport",
      entityId: opening.id,
      eventType: `OPENING_BALANCE_${input.action}`,
      summary: `Opening balance ${opening.reference}: ${input.action}`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: nextStatus,
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride, ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function postApprovedOpeningBalance(
  organizationId: string,
  openingId: string,
  actorUserId: string,
  revision: number,
) {
  const initial = await prisma.enterpriseOpeningBalanceImport.findFirst({ where: { id: openingId, organizationId } });
  if (!initial) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_FOUND", 404);
  if (initial.status === "POSTED") return initial;
  if (initial.status !== "APPROVED" || initial.revision !== revision) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_APPROVED", 409);

  const posting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "OPENING_BALANCE_POSTED",
    sourceEntityType: "EnterpriseOpeningBalanceImport",
    sourceEntityId: initial.id,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseOpeningBalanceImport" WHERE id = ${openingId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const opening = await tx.enterpriseOpeningBalanceImport.findFirst({ where: { id: openingId, organizationId } });
    if (!opening) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_FOUND", 404);
    if (opening.status === "POSTED") return opening;
    if (opening.status !== "APPROVED" || opening.revision !== revision) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_APPROVED", 409);
    const posted = await tx.enterpriseOpeningBalanceImport.update({
      where: { id: opening.id },
      data: { status: "POSTED", postedAt: new Date(), journalEntryId: posting.entry.id, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseOpeningBalanceImport",
      entityId: opening.id,
      eventType: "OPENING_BALANCE_POSTED",
      summary: `Opening balance ${opening.reference} posted`,
      actorUserId,
      fromStatus: "APPROVED",
      toStatus: "POSTED",
      metadataJson: { journalEntryId: posting.entry.id },
    });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitSalesCreditNoteForAssignedApproval(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string,
  input: AssignedDocumentSubmitInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
    if (!credit) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_FOUND", 404);
    if (!(["DRAFT", "REJECTED"].includes(credit.status)) || credit.revision !== input.revision) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_CONFLICT", 409);
    if (credit.createdByUserId !== actorUserId) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_SUBMITTER_MISMATCH", 403);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseSalesCreditNoteApproval",
      targetEntityId: credit.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
    });
    const updated = await tx.enterpriseSalesCreditNote.update({
      where: { id: credit.id },
      data: { status: "PENDING_APPROVAL", approvedByUserId: null, approvedAt: null, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesCreditNote",
      entityId: credit.id,
      eventType: "SALES_CREDIT_NOTE_SUBMITTED",
      summary: `Credit note ${credit.number} submitted for approval`,
      actorUserId,
      fromStatus: credit.status,
      toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId, ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function decideSalesCreditNoteAssignedApproval(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string,
  input: AssignedDocumentDecisionInput,
) {
  requireRejectionReason(input);
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseSalesCreditNoteApproval",
    targetEntityId: creditNoteId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
    if (!credit) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_FOUND", 404);
    if (credit.status !== "PENDING_APPROVAL" || credit.revision !== input.revision) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_CONFLICT", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const nextStatus = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseSalesCreditNote.update({
      where: { id: credit.id },
      data: {
        status: nextStatus,
        approvedByUserId: input.action === "APPROVE" ? actorUserId : null,
        approvedAt: input.action === "APPROVE" ? new Date() : null,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesCreditNote",
      entityId: credit.id,
      eventType: `SALES_CREDIT_NOTE_${input.action}`,
      summary: `Credit note ${credit.number}: ${input.action}`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: nextStatus,
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride, ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function postApprovedSalesCreditNote(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string,
  revision: number,
) {
  const initial = await prisma.enterpriseSalesCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
  if (!initial) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_FOUND", 404);
  if (initial.status === "POSTED") return initial;
  if (initial.status !== "APPROVED" || initial.revision !== revision) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_APPROVED", 409);

  const posting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "SALES_CREDIT_NOTE_POSTED",
    sourceEntityType: "EnterpriseSalesCreditNote",
    sourceEntityId: initial.id,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: creditNoteId, organizationId }, include: { salesInvoice: { include: { receivable: true } } } });
    if (!credit?.salesInvoice.receivable) throw new EnterpriseAccountingError("RECEIVABLE_NOT_FOUND", 409);
    if (credit.status === "POSTED") return credit;
    if (credit.status !== "APPROVED" || credit.revision !== revision) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_APPROVED", 409);
    const receivable = credit.salesInvoice.receivable;
    const outstanding = money(receivable.outstandingAmount.minus(credit.grandTotal));
    await tx.enterpriseReceivableAllocation.create({
      data: { organizationId, receivableId: receivable.id, sourceType: "SALES_CREDIT_NOTE", sourceId: credit.id, amount: credit.grandTotal, allocationDate: credit.creditDate, createdByUserId: actorUserId },
    });
    await tx.enterpriseReceivable.update({ where: { id: receivable.id }, data: { creditedAmount: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
    await tx.enterpriseSalesInvoice.update({ where: { id: credit.salesInvoiceId }, data: { amountCredited: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CREDIT_NOTE" : credit.salesInvoice.status, revision: { increment: 1 } } });
    const posted = await tx.enterpriseSalesCreditNote.update({ where: { id: credit.id }, data: { status: "POSTED", postedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesCreditNote",
      entityId: credit.id,
      eventType: "SALES_CREDIT_NOTE_POSTED",
      summary: `Credit note ${credit.number} posted`,
      actorUserId,
      fromStatus: "APPROVED",
      toStatus: "POSTED",
      metadataJson: { receivableId: receivable.id, journalEntryId: posting.entry.id },
    });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitSupplierCreditNoteForAssignedApproval(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string,
  input: AssignedDocumentSubmitInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSupplierCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
    if (!credit) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_FOUND", 404);
    if (!(["DRAFT", "REJECTED"].includes(credit.status)) || credit.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_CONFLICT", 409);
    if (credit.createdByUserId !== actorUserId) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_SUBMITTER_MISMATCH", 403);

    const approval = await createAccountingApprovalAssignment(tx, {
      organizationId,
      targetEntityType: "EnterpriseSupplierCreditNoteApproval",
      targetEntityId: credit.id,
      requesterUserId: actorUserId,
      approverUserId: input.approverUserId,
    });
    const updated = await tx.enterpriseSupplierCreditNote.update({
      where: { id: credit.id },
      data: { status: "PENDING_APPROVAL", approvedByUserId: null, approvedAt: null, revision: { increment: 1 } },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierCreditNote",
      entityId: credit.id,
      eventType: "SUPPLIER_CREDIT_NOTE_SUBMITTED",
      summary: `Supplier credit note ${credit.number} submitted for approval`,
      actorUserId,
      fromStatus: credit.status,
      toStatus: "PENDING_APPROVAL",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId, ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function decideSupplierCreditNoteAssignedApproval(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string,
  input: AssignedDocumentDecisionInput,
) {
  requireRejectionReason(input);
  const { approval, decision } = await requireAccountingApprovalDecision({
    organizationId,
    targetEntityType: "EnterpriseSupplierCreditNoteApproval",
    targetEntityId: creditNoteId,
    actorUserId,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSupplierCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
    if (!credit) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_FOUND", 404);
    if (credit.status !== "PENDING_APPROVAL" || credit.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_CONFLICT", 409);

    await decideAccountingApproval(tx, {
      organizationId,
      approvalId: approval.id,
      approvalRevision: approval.revision,
      actorUserId,
      status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      decisionComment: input.reason,
      selfApprovalOverride: decision.selfApprovalOverride,
    });
    const nextStatus = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseSupplierCreditNote.update({
      where: { id: credit.id },
      data: {
        status: nextStatus,
        approvedByUserId: input.action === "APPROVE" ? actorUserId : null,
        approvedAt: input.action === "APPROVE" ? new Date() : null,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierCreditNote",
      entityId: credit.id,
      eventType: `SUPPLIER_CREDIT_NOTE_${input.action}`,
      summary: `Supplier credit note ${credit.number}: ${input.action}`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: nextStatus,
      metadataJson: { approvalId: approval.id, selfApprovalOverride: decision.selfApprovalOverride, ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}) },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function postApprovedSupplierCreditNote(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string,
  revision: number,
) {
  const initial = await prisma.enterpriseSupplierCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
  if (!initial) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_FOUND", 404);
  if (initial.status === "POSTED") return initial;
  if (initial.status !== "APPROVED" || initial.revision !== revision) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_APPROVED", 409);

  const posting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "SUPPLIER_CREDIT_NOTE_POSTED",
    sourceEntityType: "EnterpriseSupplierCreditNote",
    sourceEntityId: initial.id,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSupplierCreditNote.findFirst({ where: { id: creditNoteId, organizationId }, include: { supplierInvoice: { include: { payable: true } } } });
    if (!credit?.supplierInvoice.payable) throw new EnterpriseAccountingError("PAYABLE_NOT_FOUND", 409);
    if (credit.status === "POSTED") return credit;
    if (credit.status !== "APPROVED" || credit.revision !== revision) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_APPROVED", 409);
    const payable = credit.supplierInvoice.payable;
    const outstanding = money(payable.outstandingAmount.minus(credit.grandTotal));
    await tx.enterprisePayableAllocation.create({
      data: { organizationId, payableId: payable.id, sourceType: "SUPPLIER_CREDIT_NOTE", sourceId: credit.id, amount: credit.grandTotal, allocationDate: credit.creditDate, createdByUserId: actorUserId },
    });
    await tx.enterprisePayable.update({ where: { id: payable.id }, data: { creditedAmount: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
    await tx.enterpriseSupplierInvoice.update({ where: { id: credit.supplierInvoiceId }, data: { amountCredited: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "PAID" : credit.supplierInvoice.status, revision: { increment: 1 } } });
    const posted = await tx.enterpriseSupplierCreditNote.update({ where: { id: credit.id }, data: { status: "POSTED", postedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierCreditNote",
      entityId: credit.id,
      eventType: "SUPPLIER_CREDIT_NOTE_POSTED",
      summary: `Supplier credit note ${credit.number} posted`,
      actorUserId,
      fromStatus: "APPROVED",
      toStatus: "POSTED",
      metadataJson: { payableId: payable.id, journalEntryId: posting.entry.id },
    });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
