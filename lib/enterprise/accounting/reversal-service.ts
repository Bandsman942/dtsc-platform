import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";

export async function reverseJournalEntry(
  organizationId: string,
  originalEntryId: string,
  actorUserId: string,
  input: { reason: string; accountingDate: Date },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id = ${originalEntryId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const original = await tx.enterpriseJournalEntry.findFirst({
      where: { id: originalEntryId, organizationId },
      include: { lines: true, journal: true },
    });
    if (!original) throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_FOUND", 404);
    if (original.status === "REVERSED") {
      const existing = await tx.enterpriseJournalReversal.findFirst({ where: { organizationId, originalEntryId } });
      if (!existing) throw new EnterpriseAccountingError("JOURNAL_REVERSAL_INCONSISTENT", 409);
      return tx.enterpriseJournalEntry.findFirstOrThrow({ where: { id: existing.reversalEntryId, organizationId }, include: { lines: true } });
    }
    if (original.status !== "POSTED") throw new EnterpriseAccountingError("ONLY_POSTED_ENTRY_CAN_BE_REVERSED", 409);
    assertIndependentActor({
      actorUserId,
      relatedUserIds: [original.preparedByUserId, original.approvedByUserId, original.postedByUserId],
      errorCode: "JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN",
    });
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
            organizationId,
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
      metadataJson: { reversalEntryId: reversal.id, reason: input.reason.slice(0, 500) },
    });
    return reversal;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}
