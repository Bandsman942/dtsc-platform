import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { assertAcquisitionJournalCorrectionAllowedTx } from "@/lib/enterprise/accounting/inventory-acquisition-cost-guards";

export type JournalReversalAuthorization = "USER" | "APPROVED_PERIODIC_TEMPLATE" | "SYSTEM_CLOSING" | "DOMAIN_INVERSE";

export async function reverseJournalEntryTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  originalEntryId: string,
  actorUserId: string,
  input: { reason: string; accountingDate: Date },
  options?: { authorization?: JournalReversalAuthorization },
) {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id = ${originalEntryId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const original = await tx.enterpriseJournalEntry.findFirst({
    where: { id: originalEntryId, organizationId },
    include: { lines: true, journal: true },
  });
  if (!original) throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_FOUND", 404);

  const existing = await tx.enterpriseJournalReversal.findFirst({ where: { organizationId, originalEntryId } });
  if (existing) {
    return tx.enterpriseJournalEntry.findFirstOrThrow({
      where: { id: existing.reversalEntryId, organizationId },
      include: { lines: true },
    });
  }
  if (original.status === "REVERSED") throw new EnterpriseAccountingError("JOURNAL_REVERSAL_INCONSISTENT", 409);
  if (original.status !== "POSTED") throw new EnterpriseAccountingError("ONLY_POSTED_ENTRY_CAN_BE_REVERSED", 409);
  await assertAcquisitionJournalCorrectionAllowedTx(tx, organizationId, {
    journalId: original.id, sourceEntityType: original.sourceEntityType, sourceEntityId: original.sourceEntityId,
  });
  // A manual reversal of a matched supplier source would leave stock, payable
  // and the return evidence inconsistent. Only a future domain inverse can
  // reverse those objects together.
  if (["INVENTORY_SUPPLIER_RETURN_VALUED","INVENTORY_RECEIPT_VALUED","SUPPLIER_INVOICE_POSTED","SUPPLIER_CREDIT_NOTE_POSTED"].includes(original.postingEvent || "")) {
    const linked = await tx.enterpriseSupplierReturnRequest.findFirst({where:{organizationId,status:{in:["DISPATCHED","RECONCILED"]},OR:[
      {creditJournalEntryId:original.id},
      ...(original.sourceEntityType==="EnterpriseInventoryAccountingEvent" && original.sourceEntityId ? [{dispatchAccountingEventId:original.sourceEntityId},{receiptAccountingEventId:original.sourceEntityId}] : []),
      ...(original.sourceEntityType==="EnterpriseSupplierInvoice" && original.sourceEntityId ? [{supplierInvoiceId:original.sourceEntityId}] : []),
      ...(original.sourceEntityType==="EnterpriseSupplierCreditNote" && original.sourceEntityId ? [{supplierCreditNoteId:original.sourceEntityId}] : []),
    ]},select:{id:true}});
    if (linked) throw new EnterpriseAccountingError("SUPPLIER_RETURN_DOMAIN_REVERSAL_REQUIRED",409);
  }

  // Generic journal reversal can never detach a supplier-claim offset from
  // its payable and allocation. Only the explicit atomic domain inverse may
  // reverse this posting, after verifying its own business evidence.
  if (original.postingEvent === "SUPPLIER_CLAIM_COMPENSATION_POSTED" &&
      (options?.authorization !== "DOMAIN_INVERSE" ||
        original.sourceEntityType !== "EnterpriseSupplierClaimCompensation"))
    throw new EnterpriseAccountingError("SUPPLIER_RETURN_DOMAIN_REVERSAL_REQUIRED",409);
  if (original.postingEvent === "SUPPLIER_INVOICE_POSTED" && original.sourceEntityId &&
      await tx.enterpriseSupplierClaimCompensation.count({ where: {
        organizationId, status: "POSTED", payable: { supplierInvoiceId: original.sourceEntityId },
      } })) throw new EnterpriseAccountingError("SUPPLIER_RETURN_DOMAIN_REVERSAL_REQUIRED",409);
  // A domain inverse is final accounting evidence. Do not allow a generic
  // "reversal of the reversal": this would reopen the claim in the GL without
  // restoring its allocation or payable projection and would defeat the
  // immutable status machine.
  if (original.postingEvent === "REVERSAL" && await tx.enterpriseSupplierClaimCompensation.count({
    where: { organizationId, status: "REVERSED", reversalJournalEntryId: original.id },
  })) throw new EnterpriseAccountingError("SUPPLIER_RETURN_DOMAIN_REVERSAL_REQUIRED", 409);
  if (original.postingEvent === "SUPPLIER_RETURN_REFUND_CONFIRMED") throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_DOMAIN_WORKFLOW_REQUIRED",409);

  // Claims rely on the original supplier payment and allocation journals.
  if (original.sourceEntityId && ["SUPPLIER_PAYMENT_CONFIRMED","PAYMENT_ALLOCATION_CONFIRMED"].includes(original.postingEvent || "")) {
    const allocations=await tx.enterprisePaymentAllocation.findMany({where:{organizationId,payableId:{not:null},
      ...(original.postingEvent==="SUPPLIER_PAYMENT_CONFIRMED"?{paymentId:original.sourceEntityId}:{id:original.sourceEntityId})},select:{payable:{select:{supplierInvoiceId:true}}}});
    const invoiceIds=allocations.flatMap(row=>row.payable?[row.payable.supplierInvoiceId]:[]);
    if(invoiceIds.length&&await tx.enterpriseSupplierReturnRequest.count({where:{organizationId,supplierInvoiceId:{in:invoiceIds},status:{in:["DISPATCHED","RECONCILED"]},settlementClaimAmount:{gt:0}}}))
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_DOMAIN_REVERSAL_REQUIRED",409);
  }

  if (["INVENTORY_CUSTODY_RECOVERY_VALUED","INVENTORY_ISSUE_VALUED","SALES_CREDIT_NOTE_POSTED"].includes(original.postingEvent || "")) {
    const linked=await tx.enterpriseInventoryReturnRecoveryAssessment.findFirst({where:{organizationId,status:"EXECUTED",OR:[
      {recoveryJournalEntryId:original.id},{originalIssueJournalId:original.id},
      ...(original.sourceEntityType==="EnterpriseSalesCreditNote"&&original.sourceEntityId?[{custody:{returnLine:{request:{salesCreditNoteId:original.sourceEntityId}}}}]:[]),
    ]},select:{id:true}});
    if(linked)throw new EnterpriseAccountingError("INVENTORY_RETURN_RECOVERY_DOMAIN_REVERSAL_REQUIRED",409);
  }
  if ((options?.authorization || "USER") === "USER") {
    assertIndependentActor({
      actorUserId,
      relatedUserIds: [original.preparedByUserId, original.approvedByUserId, original.postedByUserId],
      errorCode: "JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN",
    });
  }

  const period = await getPostingPeriod(tx, organizationId, input.accountingDate, { allowSoftClosed: true });
  const reversal = await tx.enterpriseJournalEntry.create({
    data: {
      organizationId,
      number: financeReference(`${original.journal.sequencePrefix || original.journal.code}-REV`),
      journalId: original.journalId,
      fiscalPeriodId: period.id,
      accountingDate: input.accountingDate,
      documentDate: input.accountingDate,
      reference: original.number,
      description: `Contrepassation de ${original.number} : ${input.reason}`,
      sourceModule: original.sourceModule,
      sourceEntityType: "EnterpriseJournalEntryReversal",
      sourceEntityId: original.id,
      postingEvent: "REVERSAL",
      postingVersion: original.postingVersion,
      idempotencyKey: `${organizationId}:REVERSAL:${original.id}`,
      status: "POSTED",
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      functionalCurrencyCode: original.functionalCurrencyCode,
      preparedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      postedByUserId: actorUserId,
      postedAt: new Date(),
      reversalOfEntryId: original.id,
      lines: {
        create: original.lines.map((line) => ({
          ledgerAccountId: line.ledgerAccountId,
          businessPartyId: line.businessPartyId,
          projectId: line.projectId,
          departmentId: line.departmentId,
          siteId: line.siteId,
          assetId: line.assetId,
          inventoryItemId: line.inventoryItemId,
          description: line.description ? `Contrepassation : ${line.description}` : `Contrepassation ${original.number}`,
          debit: line.credit,
          credit: line.debit,
          transactionCurrencyCode: line.transactionCurrencyCode,
          transactionAmount: line.transactionAmount,
          exchangeRate: line.exchangeRate,
          functionalAmount: line.functionalAmount,
          analyticReference: line.analyticReference,
        })),
      },
    },
    include: { lines: true },
  });
  await tx.enterpriseJournalReversal.create({
    data: { organizationId, originalEntryId: original.id, reversalEntryId: reversal.id, reason: input.reason, requestedByUserId: actorUserId, approvedByUserId: actorUserId },
  });
  await tx.enterpriseJournalEntry.update({ where: { id: original.id }, data: { status: "REVERSED", reversedAt: new Date(), revision: { increment: 1 } } });
  await publishFinanceEvent(tx, {
    organizationId,
    entityType: "EnterpriseJournalEntry",
    entityId: original.id,
    eventType: "JOURNAL_ENTRY_REVERSED",
    summary: `Journal entry ${original.number} reversed by ${reversal.number}`,
    actorUserId,
    fromStatus: "POSTED",
    toStatus: "REVERSED",
    metadataJson: { reversalEntryId: reversal.id, reason: input.reason.slice(0, 500), authorization: options?.authorization || "USER" },
  });
  return reversal;
}

export async function reverseJournalEntry(
  organizationId: string,
  originalEntryId: string,
  actorUserId: string,
  input: { reason: string; accountingDate: Date },
) {
  return prisma.$transaction(
    (tx) => reverseJournalEntryTx(tx, organizationId, originalEntryId, actorUserId, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
  );
}
