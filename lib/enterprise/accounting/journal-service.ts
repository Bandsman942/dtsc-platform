import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { convertToFunctionalCurrency, getFinanceConfiguration } from "@/lib/enterprise/accounting/currency";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { assertPeriodMatchesEntry } from "@/lib/enterprise/accounting/periods";
import type { journalEntryCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type JournalEntryCreateInput = z.infer<typeof journalEntryCreateSchema>;

function validateBalancedLines(lines: Array<{ debit: Prisma.Decimal.Value; credit: Prisma.Decimal.Value }>, tolerance = new Prisma.Decimal("0.000001")) {
  const debit = sumDecimals(lines.map((line) => line.debit));
  const credit = sumDecimals(lines.map((line) => line.credit));
  if (debit.minus(credit).abs().greaterThan(tolerance)) {
    throw new EnterpriseAccountingError("JOURNAL_ENTRY_UNBALANCED", 409, { debit: debit.toFixed(), credit: credit.toFixed() });
  }
  if (!debit.isPositive()) throw new EnterpriseAccountingError("JOURNAL_ENTRY_EMPTY", 400);
  return { debit: money(debit), credit: money(credit) };
}

async function assertAccountsPostable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountIds: string[],
  options?: { manualEntry?: boolean },
) {
  const accounts = await tx.enterpriseLedgerAccount.findMany({
    where: { organizationId, id: { in: [...new Set(accountIds)] }, isActive: true, archivedAt: null },
  });
  if (accounts.length !== new Set(accountIds).size) throw new EnterpriseAccountingError("JOURNAL_ACCOUNT_INVALID", 409);
  if (options?.manualEntry && accounts.some((account) => !account.allowDirectPosting)) {
    throw new EnterpriseAccountingError("JOURNAL_DIRECT_POSTING_FORBIDDEN", 409);
  }
  return new Map(accounts.map((account) => [account.id, account]));
}

export async function createJournalEntryDraft(
  organizationId: string,
  actorUserId: string,
  input: JournalEntryCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const [journal, configuration] = await Promise.all([
      tx.enterpriseJournal.findFirst({ where: { id: input.journalId, organizationId, isActive: true } }),
      getFinanceConfiguration(tx, organizationId),
    ]);
    if (!journal) throw new EnterpriseAccountingError("JOURNAL_NOT_FOUND", 404);
    await assertPeriodMatchesEntry(tx, organizationId, input.fiscalPeriodId, input.accountingDate, { allowSoftClosed: true });
    await assertAccountsPostable(tx, organizationId, input.lines.map((line) => line.ledgerAccountId), { manualEntry: !input.sourceEntityId });

    const transactionCurrency = input.lines.find((line) => line.transactionCurrencyCode)?.transactionCurrencyCode || configuration.functionalCurrencyCode;
    const conversion = await convertToFunctionalCurrency(tx, {
      organizationId,
      sourceEntityType: input.sourceEntityType || "EnterpriseJournalEntryDraft",
      sourceEntityId: input.sourceEntityId || input.idempotencyKey || financeReference("FX"),
      currencyCode: transactionCurrency,
      amount: "1",
      accountingDate: input.accountingDate,
    });
    const preparedLines = input.lines.map((line) => {
      const debit = money(line.debit);
      const credit = money(line.credit);
      const amount = debit.isPositive() ? debit : credit;
      const lineCurrency = line.transactionCurrencyCode || transactionCurrency;
      if (lineCurrency !== transactionCurrency) throw new EnterpriseAccountingError("JOURNAL_MULTIPLE_TRANSACTION_CURRENCIES", 409);
      const exchangeRate = line.exchangeRate ? new Prisma.Decimal(line.exchangeRate) : conversion.exchangeRate;
      return {
        ...line,
        debit: money(debit.times(exchangeRate)),
        credit: money(credit.times(exchangeRate)),
        transactionCurrencyCode: lineCurrency,
        transactionAmount: line.transactionAmount ? new Prisma.Decimal(line.transactionAmount) : amount,
        exchangeRate,
        functionalAmount: money(amount.times(exchangeRate)),
      };
    });
    const totals = validateBalancedLines(preparedLines);
    const number = financeReference(journal.sequencePrefix || journal.code || "JE");
    const entry = await tx.enterpriseJournalEntry.create({
      data: {
        organizationId,
        number,
        journalId: journal.id,
        fiscalPeriodId: input.fiscalPeriodId,
        accountingDate: input.accountingDate,
        documentDate: input.documentDate || null,
        reference: input.reference || null,
        description: input.description,
        sourceModule: input.sourceModule || null,
        sourceEntityType: input.sourceEntityType || null,
        sourceEntityId: input.sourceEntityId || null,
        postingEvent: input.postingEvent || null,
        postingVersion: input.postingVersion,
        idempotencyKey: input.idempotencyKey || null,
        status: journal.requiresApproval ? "DRAFT" : "APPROVED",
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        functionalCurrencyCode: configuration.functionalCurrencyCode,
        preparedByUserId: actorUserId,
        lines: {
          create: preparedLines.map((line) => ({
            organizationId,
            ledgerAccountId: line.ledgerAccountId,
            businessPartyId: line.businessPartyId || null,
            projectId: line.projectId || null,
            departmentId: line.departmentId || null,
            siteId: line.siteId || null,
            assetId: line.assetId || null,
            inventoryItemId: line.inventoryItemId || null,
            description: line.description || null,
            debit: line.debit,
            credit: line.credit,
            transactionCurrencyCode: line.transactionCurrencyCode,
            transactionAmount: line.transactionAmount,
            exchangeRate: line.exchangeRate,
            functionalAmount: line.functionalAmount,
            analyticReference: line.analyticReference || null,
          })),
        },
      },
      include: { lines: true, journal: true, fiscalPeriod: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseJournalEntry",
      entityId: entry.id,
      eventType: "JOURNAL_ENTRY_CREATED",
      summary: `Journal entry ${entry.number} created`,
      actorUserId,
      toStatus: entry.status,
      metadataJson: { journalType: journal.journalType, total: totals.debit.toFixed(), currency: configuration.functionalCurrencyCode },
    });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionJournalEntry(
  organizationId: string,
  entryId: string,
  actorUserId: string,
  input: { action: "SUBMIT" | "APPROVE" | "REJECT" | "POST" | "CANCEL"; reason?: string; revision: number },
) {
  if (input.action === "POST") return postJournalEntry(organizationId, entryId, actorUserId, input.revision);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id = ${entryId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const entry = await tx.enterpriseJournalEntry.findFirst({ where: { id: entryId, organizationId }, include: { journal: true } });
    if (!entry) throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_FOUND", 404);
    if (entry.revision !== input.revision) throw new EnterpriseAccountingError("JOURNAL_ENTRY_REVISION_CONFLICT", 409, { currentRevision: entry.revision });
    if (["POSTED", "REVERSED"].includes(entry.status)) throw new EnterpriseAccountingError("POSTED_ENTRY_IMMUTABLE", 409);
    const transitions: Record<typeof input.action, { from: string[]; to: string }> = {
      SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL" },
      APPROVE: { from: ["PENDING_APPROVAL"], to: "APPROVED" },
      REJECT: { from: ["PENDING_APPROVAL"], to: "REJECTED" },
      CANCEL: { from: ["DRAFT", "REJECTED"], to: "CANCELLED" },
      POST: { from: [], to: "POSTED" },
    };
    const transition = transitions[input.action];
    if (!transition.from.includes(entry.status)) throw new EnterpriseAccountingError("JOURNAL_ENTRY_TRANSITION_INVALID", 409);
    if (input.action === "APPROVE") assertIndependentActor({ actorUserId, relatedUserIds: [entry.preparedByUserId], errorCode: "JOURNAL_ENTRY_SELF_APPROVAL_FORBIDDEN" });
    const updated = await tx.enterpriseJournalEntry.update({
      where: { id: entry.id },
      data: {
        status: transition.to,
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
      fromStatus: entry.status,
      toStatus: transition.to,
      metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined,
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function postJournalEntry(organizationId: string, entryId: string, actorUserId: string, revision?: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id = ${entryId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const entry = await tx.enterpriseJournalEntry.findFirst({
      where: { id: entryId, organizationId },
      include: { lines: true, journal: true },
    });
    if (!entry) throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_FOUND", 404);
    if (entry.status === "POSTED") return entry;
    if (revision && entry.revision !== revision) throw new EnterpriseAccountingError("JOURNAL_ENTRY_REVISION_CONFLICT", 409, { currentRevision: entry.revision });
    if (entry.status !== "APPROVED") throw new EnterpriseAccountingError("JOURNAL_ENTRY_NOT_APPROVED", 409);
    await assertPeriodMatchesEntry(tx, organizationId, entry.fiscalPeriodId, entry.accountingDate, { allowSoftClosed: true });
    await assertAccountsPostable(tx, organizationId, entry.lines.map((line) => line.ledgerAccountId), { manualEntry: !entry.sourceEntityId });
    const totals = validateBalancedLines(entry.lines);
    if (!totals.debit.equals(entry.totalDebit) || !totals.credit.equals(entry.totalCredit)) {
      throw new EnterpriseAccountingError("JOURNAL_ENTRY_TOTALS_CHANGED", 409);
    }
    assertIndependentActor({ actorUserId, relatedUserIds: entry.journal.requiresApproval ? [entry.preparedByUserId] : [], errorCode: "JOURNAL_ENTRY_SELF_POST_FORBIDDEN" });
    const posted = await tx.enterpriseJournalEntry.update({
      where: { id: entry.id },
      data: { status: "POSTED", postedByUserId: actorUserId, postedAt: new Date(), revision: { increment: 1 } },
      include: { lines: true, journal: true, fiscalPeriod: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseJournalEntry",
      entityId: entry.id,
      eventType: "JOURNAL_ENTRY_POSTED",
      summary: `Journal entry ${entry.number} posted`,
      actorUserId,
      fromStatus: entry.status,
      toStatus: "POSTED",
      metadataJson: { debit: totals.debit.toFixed(), credit: totals.credit.toFixed(), currency: entry.functionalCurrencyCode },
    });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function listJournalEntries(organizationId: string, input: { page: number; pageSize: number; status?: string; search?: string }) {
  const where: Prisma.EnterpriseJournalEntryWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { OR: [
      { number: { contains: input.search, mode: "insensitive" } },
      { reference: { contains: input.search, mode: "insensitive" } },
      { description: { contains: input.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseJournalEntry.findMany({
      where,
      orderBy: [{ accountingDate: "desc" }, { createdAt: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { journal: true, fiscalPeriod: true, _count: { select: { lines: true } } },
    }),
    prisma.enterpriseJournalEntry.count({ where }),
  ]);
  return { items, pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) } };
}
