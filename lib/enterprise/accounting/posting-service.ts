import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PostingEvent } from "@/lib/enterprise/accounting/constants";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertFinanceReady } from "@/lib/enterprise/accounting/configuration-service";
import { resolveExchangeRate, snapshotExchangeRate } from "@/lib/enterprise/accounting/currency";
import { financeReference, idempotencyKey, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { getPostingBuilderV2 } from "@/lib/enterprise/accounting/posting-registry-v2";
import type { PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";

async function prepareFunctionalLines(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    accountingDate: Date;
    functionalCurrencyCode: string;
    lines: PostingLineDraft[];
  },
) {
  const cache = new Map<string, Prisma.Decimal>();
  const prepared = [];
  for (const line of input.lines) {
    const account = await resolveSemanticPostingAccount(tx, {
      organizationId: input.organizationId,
      mappingKey: line.accountMappingKey,
      accountingDate: input.accountingDate,
    });
    const debitTransaction = new Prisma.Decimal(line.debit || 0);
    const creditTransaction = new Prisma.Decimal(line.credit || 0);
    const debitPositive = debitTransaction.gt(0);
    const creditPositive = creditTransaction.gt(0);
    if (debitTransaction.lt(0) || creditTransaction.lt(0) || debitPositive === creditPositive) {
      throw new EnterpriseAccountingError("POSTING_LINE_INVALID", 409, {
        mappingKey: line.accountMappingKey,
        debit: debitTransaction.toFixed(),
        credit: creditTransaction.toFixed(),
      });
    }
    const currencyPair = `${line.transactionCurrencyCode}:${input.functionalCurrencyCode}`;
    let rate = cache.get(currencyPair);
    if (!rate) {
      rate = await resolveExchangeRate(tx, {
        organizationId: input.organizationId,
        sourceCurrencyCode: line.transactionCurrencyCode,
        targetCurrencyCode: input.functionalCurrencyCode,
        rateDate: input.accountingDate,
      });
      cache.set(currencyPair, rate);
      await snapshotExchangeRate(tx, {
        organizationId: input.organizationId,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        sourceCurrencyCode: line.transactionCurrencyCode,
        targetCurrencyCode: input.functionalCurrencyCode,
        rateDate: input.accountingDate,
        rate,
        source: line.transactionCurrencyCode === input.functionalCurrencyCode ? "FUNCTIONAL" : "ENTERPRISE_RATE",
      });
    }
    const debit = money(debitTransaction.times(rate));
    const credit = money(creditTransaction.times(rate));
    prepared.push({
      ledgerAccountId: account.id,
      businessPartyId: line.businessPartyId || null,
      projectId: line.projectId || null,
      departmentId: line.departmentId || null,
      siteId: line.siteId || null,
      assetId: line.assetId || null,
      inventoryItemId: line.inventoryItemId || null,
      description: line.description,
      debit,
      credit,
      transactionCurrencyCode: line.transactionCurrencyCode,
      transactionAmount: new Prisma.Decimal(line.transactionAmount),
      exchangeRate: rate,
      functionalAmount: debit.gt(0) ? debit : credit,
    });
  }
  const totalDebit = money(sumDecimals(prepared.map((line) => line.debit)));
  const totalCredit = money(sumDecimals(prepared.map((line) => line.credit)));
  if (!totalDebit.equals(totalCredit)) throw new EnterpriseAccountingError("POSTING_NOT_BALANCED", 409, { totalDebit: totalDebit.toFixed(), totalCredit: totalCredit.toFixed() });
  return { lines: prepared, totalDebit, totalCredit };
}

export async function postBusinessEvent(
  organizationId: string,
  actorUserId: string,
  input: {
    postingEvent: PostingEvent;
    sourceEntityType: string;
    sourceEntityId: string;
    postingVersion?: number;
  },
) {
  const version = input.postingVersion || 1;
  const stableKey = idempotencyKey({ organizationId, ...input, postingVersion: version });
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${stableKey}))`);
      const existingBatch = await tx.enterprisePostingBatch.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: stableKey } },
      });
      if (existingBatch?.status === "COMPLETED") {
        const existingEntry = await tx.enterpriseJournalEntry.findFirst({ where: { organizationId, idempotencyKey: stableKey }, include: { lines: true } });
        if (!existingEntry) throw new EnterpriseAccountingError("POSTING_BATCH_ENTRY_MISSING", 409);
        return { batch: existingBatch, entry: existingEntry, idempotent: true };
      }
      if (existingBatch?.status === "PROCESSING") throw new EnterpriseAccountingError("POSTING_ALREADY_PROCESSING", 409);
      const configuration = await assertFinanceReady(tx, organizationId);
      const batch = existingBatch
        ? await tx.enterprisePostingBatch.update({ where: { id: existingBatch.id }, data: { status: "PROCESSING", errorCode: null, errorMessage: null } })
        : await tx.enterprisePostingBatch.create({
            data: {
              organizationId,
              reference: financeReference("POST"),
              postingEvent: input.postingEvent,
              sourceEntityType: input.sourceEntityType,
              sourceEntityId: input.sourceEntityId,
              postingVersion: version,
              idempotencyKey: stableKey,
              status: "PROCESSING",
              createdByUserId: actorUserId,
            },
          });
      const builder = getPostingBuilderV2(input.postingEvent);
      const document = await builder(tx, { organizationId, sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId });
      if (document.organizationId !== organizationId || document.sourceEntityId !== input.sourceEntityId) {
        throw new EnterpriseAccountingError("POSTING_SOURCE_SCOPE_MISMATCH", 409);
      }
      const [period, journal] = await Promise.all([
        getPostingPeriod(tx, organizationId, document.accountingDate, { allowSoftClosed: true }),
        tx.enterpriseJournal.findFirst({ where: { organizationId, journalType: document.journalType, isActive: true }, orderBy: { createdAt: "asc" } }),
      ]);
      if (!journal) throw new EnterpriseAccountingError("POSTING_JOURNAL_REQUIRED", 409, { journalType: document.journalType });
      const prepared = await prepareFunctionalLines(tx, {
        organizationId,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        accountingDate: document.accountingDate,
        functionalCurrencyCode: configuration.functionalCurrencyCode,
        lines: document.lines,
      });
      const entry = await tx.enterpriseJournalEntry.create({
        data: {
          organizationId,
          number: financeReference(journal.sequencePrefix || journal.code || "JE"),
          journalId: journal.id,
          fiscalPeriodId: period.id,
          accountingDate: document.accountingDate,
          documentDate: document.documentDate || null,
          reference: document.reference || null,
          description: document.description,
          sourceModule: document.sourceModule,
          sourceEntityType: document.sourceEntityType,
          sourceEntityId: document.sourceEntityId,
          postingEvent: input.postingEvent,
          postingVersion: version,
          idempotencyKey: stableKey,
          status: "POSTED",
          totalDebit: prepared.totalDebit,
          totalCredit: prepared.totalCredit,
          functionalCurrencyCode: configuration.functionalCurrencyCode,
          preparedByUserId: actorUserId,
          approvedByUserId: actorUserId,
          postedByUserId: actorUserId,
          postedAt: new Date(),
          lines: { create: prepared.lines },
        },
        include: { lines: true, journal: true, fiscalPeriod: true },
      });
      const completedBatch = await tx.enterprisePostingBatch.update({ where: { id: batch.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await publishFinanceEvent(tx, {
        organizationId,
        entityType: input.sourceEntityType,
        entityId: input.sourceEntityId,
        eventType: input.postingEvent,
        summary: `${input.postingEvent} posted as ${entry.number}`,
        actorUserId,
        toStatus: "POSTED",
        metadataJson: { journalEntryId: entry.id, postingVersion: version, total: prepared.totalDebit.toFixed(), currency: configuration.functionalCurrencyCode },
      });
      return { batch: completedBatch, entry, idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  } catch (error) {
    if (error instanceof EnterpriseAccountingError) throw error;
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown posting error";
    await prisma.enterprisePostingBatch.updateMany({
      where: { organizationId, idempotencyKey: stableKey, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", errorCode: "POSTING_FAILED", errorMessage: message },
    }).catch(() => undefined);
    throw error;
  }
}
