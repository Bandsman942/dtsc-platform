import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { reverseJournalEntryTx } from "@/lib/enterprise/accounting/reversal-service";
import { assertSupplierCompensationScopeTx } from "@/lib/enterprise/accounting/supplier-claim-compensation-service";
import { lockSupplierClaimRefundTx, readSupplierClaimRefundEvidenceTx } from "@/lib/enterprise/accounting/supplier-return-claim-refunds";
import { lockSupplierReturnInvoiceTx } from "@/lib/enterprise/accounting/supplier-return-credit-reconciliation";
import { isValidEnterpriseActivityCivilDate } from "@/lib/enterprise/enterprise-activity-civil-date";

const error = (): never => {
  throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_INVERSE_CONFLICT", 409);
};

type InverseInput = { compensationId: string; revision: number; reason: string; accountingDate: string };

/**
 * Domain inverse of a posted, non-cash supplier claim offset.
 * It reverses the journal and restores BOTH payable projections while marking
 * the original allocation as reversed, all in ONE serializable transaction.
 * No EnterprisePayment, TreasuryTransaction, CashMovement or new supplier credit
 * note is ever created. The historical posting and allocation remain auditable.
 */
export async function reversePostedSupplierClaimCompensation(
  organizationId: string,
  actorUserId: string,
  input: InverseInput,
) {
  if (!input.compensationId || !Number.isInteger(input.revision) || input.revision < 1 ||
      !isValidEnterpriseActivityCivilDate(input.accountingDate) ||
      input.reason.trim().length < 8 || input.reason.length > 1000) return error();
  const correctionDate = new Date(input.accountingDate + "T00:00:00.000Z");
  return prisma.$transaction(async tx => {
    await assertSupplierCompensationScopeTx(tx, organizationId, actorUserId);
    const pointer = await tx.enterpriseSupplierClaimCompensation.findFirst({
      where: { organizationId, id: input.compensationId }, select: { claimId: true, payableId: true },
    });
    if (!pointer) throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_NOT_FOUND", 404);

    // Canonical lock order: originating claim -> compensation -> target invoice -> payable.
    await lockSupplierClaimRefundTx(tx, organizationId, pointer.claimId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierClaimCompensation"
      WHERE id = ${input.compensationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const posted = await tx.enterpriseSupplierClaimCompensation.findFirst({
      where: { organizationId, id: input.compensationId },
    });
    if (!posted || posted.claimId !== pointer.claimId || posted.payableId !== pointer.payableId) return error();
    if (posted.status === "REVERSED" && posted.revision === input.revision + 1 &&
        posted.reversedByUserId === actorUserId && posted.reversalReason === input.reason &&
        posted.reversalJournalEntryId) {
      const journal = await tx.enterpriseJournalEntry.findFirst({
        where: { organizationId, id: posted.reversalJournalEntryId },
        select: { accountingDate: true, reversalOfEntryId: true, status: true },
      });
      if (journal?.status === "POSTED" && journal.reversalOfEntryId === posted.postingJournalEntryId &&
          journal.accountingDate.getTime() === correctionDate.getTime()) return posted;
    }
    if (posted.status !== "POSTED" || posted.revision !== input.revision ||
        !posted.postingJournalEntryId || !posted.postedByUserId || !posted.approvedByUserId ||
        !posted.approvedAt || !posted.postedAt || !posted.submittedAt ||
        correctionDate.getTime() < posted.accountingDate.getTime()) return error();
    assertIndependentActor({
      actorUserId,
      relatedUserIds: [posted.requestedByUserId, posted.approverUserId,
        posted.approvedByUserId, posted.postedByUserId],
      errorCode: "SUPPLIER_RETURN_COMPENSATION_SELF_INVERSE_FORBIDDEN",
    });

    // A correction in a closed/soft-closed period is forbidden. The original
    // booked date remains untouched; the inverse uses a NEW open period.
    await getPostingPeriod(tx, organizationId, correctionDate);

    const payablePointer = await tx.enterprisePayable.findFirst({
      where: { organizationId, id: posted.payableId }, select: { supplierInvoiceId: true },
    });
    if (!payablePointer) return error();
    await lockSupplierReturnInvoiceTx(tx, organizationId, payablePointer.supplierInvoiceId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterprisePayable"
      WHERE id = ${posted.payableId} AND "organizationId" = ${organizationId} FOR UPDATE`);

    // Recheck ALL supplier claim evidence and the previous offset BEFORE the
    // journal is reversed. A reversed source credit, alien supplier or forged
    // payable projection must fail closed without partial writes.
    const proof = await readSupplierClaimRefundEvidenceTx(tx, organizationId, posted.claimId);
    const [payable, invoice, allocations, originalJournal] = await Promise.all([
      tx.enterprisePayable.findFirst({ where: { organizationId, id: posted.payableId } }),
      tx.enterpriseSupplierInvoice.findFirst({
        where: { organizationId, id: payablePointer.supplierInvoiceId },
      }),
      tx.enterprisePayableAllocation.findMany({
        where: { organizationId, sourceType: "SUPPLIER_CLAIM_COMPENSATION", sourceId: posted.id }, take: 2,
      }),
      tx.enterpriseJournalEntry.findFirst({
        where: { organizationId, id: posted.postingJournalEntryId, status: "POSTED" },
      }),
    ]);
    const allocation = allocations[0];
    if (!payable || !invoice || payable.supplierInvoiceId !== invoice.id ||
        payable.supplierId !== proof.claim.supplierId || invoice.supplierId !== proof.claim.supplierId ||
        payable.businessPartyId !== proof.invoice.businessPartyId ||
        invoice.businessPartyId !== proof.invoice.businessPartyId ||
        payable.currencyCode !== posted.currencyCode || invoice.currencyCode !== posted.currencyCode ||
        payable.status !== (payable.outstandingAmount.isZero() ? "CLOSED" : "OPEN") ||
        (invoice.outstandingAmount.isZero()
          ? invoice.status !== "PAID"
          : !["POSTED", "PARTIALLY_PAID"].includes(invoice.status)) ||
        allocations.length !== 1 || !allocation || allocation.payableId !== payable.id ||
        allocation.status !== "CONFIRMED" || allocation.reversedAt ||
        !allocation.amount.equals(posted.amount) ||
        allocation.allocationDate.getTime() !== posted.accountingDate.getTime() ||
        allocation.createdByUserId !== posted.postedByUserId ||
        !originalJournal || originalJournal.sourceEntityType !== "EnterpriseSupplierClaimCompensation" ||
        originalJournal.sourceEntityId !== posted.id ||
        originalJournal.postingEvent !== "SUPPLIER_CLAIM_COMPENSATION_POSTED" ||
        originalJournal.reversedAt || originalJournal.reversalOfEntryId ||
        originalJournal.accountingDate.getTime() !== posted.accountingDate.getTime() ||
        !originalJournal.totalDebit.equals(posted.amount) ||
        !originalJournal.totalCredit.equals(posted.amount) ||
        !payable.compensatedAmount.isFinite() || payable.compensatedAmount.lt(posted.amount) ||
        !payable.outstandingAmount.isFinite() || payable.outstandingAmount.lt(0) ||
        !invoice.amountCompensated.equals(payable.compensatedAmount) ||
        !invoice.outstandingAmount.equals(payable.outstandingAmount) ||
        !invoice.amountPaid.equals(payable.allocatedAmount) ||
        !invoice.amountCredited.equals(payable.creditedAmount) ||
        !payable.originalAmount.equals(invoice.grandTotal) ||
        !payable.originalAmount.minus(payable.allocatedAmount).minus(payable.creditedAmount)
          .minus(payable.compensatedAmount).equals(payable.outstandingAmount)) return error();

    const nextCompensated = payable.compensatedAmount.minus(posted.amount);
    const nextOutstanding = payable.outstandingAmount.plus(posted.amount);
    if (nextCompensated.lt(0) || nextOutstanding.gt(payable.originalAmount) ||
        nextOutstanding.lt(0)) return error();

    const reversal = await reverseJournalEntryTx(
      tx, organizationId, originalJournal.id, actorUserId,
      { reason: input.reason, accountingDate: correctionDate },
      { authorization: "DOMAIN_INVERSE" },
    );
    await tx.enterprisePayableAllocation.update({
      where: { id: allocation.id },
      data: { status: "REVERSED", reversedAt: new Date() },
    });
    await tx.enterprisePayable.update({
      where: { id: payable.id },
      data: { compensatedAmount: nextCompensated, outstandingAmount: nextOutstanding, status: "OPEN" },
    });
    await tx.enterpriseSupplierInvoice.update({
      where: { id: invoice.id },
      data: { amountCompensated: nextCompensated, outstandingAmount: nextOutstanding,
        status: payable.allocatedAmount.gt(0) ? "PARTIALLY_PAID" : "POSTED",
        revision: { increment: 1 } },
    });
    const updated = await tx.enterpriseSupplierClaimCompensation.update({
      where: { organizationId_id: { organizationId, id: posted.id } },
      data: { status: "REVERSED", revision: { increment: 1 },
        reversedAt: new Date(), reversedByUserId: actorUserId, reversalReason: input.reason,
        reversalJournalEntryId: reversal.id },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSupplierClaimCompensation",
      entityId: posted.id,
      eventType: "SUPPLIER_CLAIM_COMPENSATION_REVERSED",
      summary: "Supplier claim offset reversed; payable and claim capacity restored",
      actorUserId, fromStatus: "POSTED", toStatus: "REVERSED",
      metadataJson: { originalJournalEntryId: originalJournal.id,
        reversalJournalEntryId: reversal.id, payableId: payable.id,
        amount: posted.amount.toFixed(), currency: posted.currencyCode,
        treasuryImpact: "0", correctionDate: input.accountingDate },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000, timeout: 30000 }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (["P2034", "P2002"].includes(error.code) ||
          (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))))) {
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_INVERSE_CONFLICT", 409);
    }
    throw error;
  });
}
