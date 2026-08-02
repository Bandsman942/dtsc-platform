import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export async function reversePostedJournalEntry(
  organizationId: string,
  originalEntryId: string,
  actorUserId: string,
  input: { accountingDate: Date; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id = ${originalEntryId} AND "organizationId" = ${organizationId} FOR UPDATE`,
    );
    const original = await tx.enterpriseJournalEntry.findFirst({
      where: { id: originalEntryId, organizationId },
      include: { lines: true, journal: true },
    });
    if (!original) throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_FOUND", 404);
    if (original.status === "REVERSED") {
      const existing = await tx.enterpriseJournalEntry.findFirst({
        where: { organizationId, reversalOfEntryId: original.id },
        include: { lines: true, journal: true, fiscalPeriod: true },
      });
      if (existing) return existing;
    }
    if (original.status !== "POSTED") {
      throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_REVERSIBLE", 409);
    }
    assertIndependentActor({
      actorUserId,
      relatedUserIds: [original.preparedByUserId, original.approvedByUserId, original.postedByUserId],
      errorCode: "JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN",
    });

    const period = await tx.enterpriseFiscalPeriod.findFirst({
      where: {
        organizationId,
        startDate: { lte: input.accountingDate },
        endDate: { gte: input.accountingDate },
        status: { in: ["OPEN", "SOFT_CLOSED"] },
      },
      orderBy: { startDate: "desc" },
    });
    if (!period) throw new EnterpriseAccountingError("FINANCE_PERIOD_CLOSED", 409);

    const existingReversal = await tx.enterpriseJournalReversal.findFirst({
      where: { organizationId, originalEntryId: original.id },
    });
    if (existingReversal) throw new EnterpriseAccountingError("JOURNAL_ENTRY_ALREADY_REVERSED", 409);

    const reversal = await tx.enterpriseJournalEntry.create({
      data: {
        organizationId,
        number: financeReference(`${original.journal.sequencePrefix || original.journal.code || "JE"}-REV`),
        journalId: original.journalId,
        fiscalPeriodId: period.id,
        accountingDate: input.accountingDate,
        documentDate: original.documentDate,
        reference: original.number,
        description: `Contrepassation de ${original.number} — ${input.reason}`,
        sourceModule: "FINANCE_ACCOUNTING",
        sourceEntityType: "EnterpriseJournalEntry",
        sourceEntityId: original.id,
        postingEvent: original.postingEvent,
        postingVersion: original.postingVersion,
        idempotencyKey: `${organizationId}:journal-reversal:${original.id}`,
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
            description: line.description,
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
      include: { lines: true, journal: true, fiscalPeriod: true },
    });

    await tx.enterpriseJournalReversal.create({
      data: {
        organizationId,
        originalEntryId: original.id,
        reversalEntryId: reversal.id,
        reason: input.reason,
        requestedByUserId: actorUserId,
        approvedByUserId: actorUserId,
      },
    });
    await tx.enterpriseJournalEntry.update({
      where: { id: original.id },
      data: { status: "REVERSED", reversedAt: new Date(), revision: { increment: 1 } },
    });
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
