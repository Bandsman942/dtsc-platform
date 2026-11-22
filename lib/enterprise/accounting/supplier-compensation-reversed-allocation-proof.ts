import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

const reject = (): never => {
  throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409);
};

/**
 * A reversed offset does not consume current debt capacity, but its historical
 * allocation MUST NOT be silently ignored. Prove the canonical offset journal,
 * immutable domain-inverse record, opposite journal, supplier and accounts
 * before permitting a new offset against the restored payable.
 *
 * Active/unknown allocations (including ordinary payments and supplier credits)
 * are intentionally not accepted by this pristine-target preflight.
 */
export async function assertReversedSupplierCompensationAllocationsTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    payableId: string;
    targetInvoiceJournalId: string;
    businessPartyId: string;
    supplierId: string;
    currencyCode: string;
    payableAccountId: string;
    limit?: number;
  },
) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 100));
  const allocations = await tx.enterprisePayableAllocation.findMany({
    where: { organizationId: input.organizationId, payableId: input.payableId },
    take: limit + 1, orderBy: { id: "asc" },
  });
  if (allocations.length > limit) return reject();
  if (!allocations.length) return;

  if (allocations.some(a => a.sourceType !== "SUPPLIER_CLAIM_COMPENSATION" ||
      !a.sourceId || a.status !== "REVERSED" || !a.reversedAt ||
      !a.amount.isFinite() || !a.amount.gt(0))) return reject();

  const ids = allocations.map(a => a.sourceId);
  const offsets = await tx.enterpriseSupplierClaimCompensation.findMany({
    where: { organizationId: input.organizationId, id: { in: ids }, payableId: input.payableId, status: "REVERSED" },
    include: { claim: { select: { supplierId: true, currencyCode: true } } },
  });
  if (offsets.length !== allocations.length) return reject();
  const byId = new Map(offsets.map(row => [row.id, row]));
  const journals = await tx.enterpriseJournalEntry.findMany({
    where: { organizationId: input.organizationId,
      id: { in: offsets.flatMap(row =>
        [row.postingJournalEntryId, row.reversalJournalEntryId].filter((id): id is string => Boolean(id))) },
    }, include: { lines: true }, take: 2 * limit + 1,
  });
  if (journals.length !== offsets.length * 2) return reject();
  const byJournal = new Map(journals.map(entry => [entry.id, entry]));
  const reversals = await tx.enterpriseJournalReversal.findMany({
    where: { organizationId: input.organizationId,
      originalEntryId: { in: offsets.flatMap(row => row.postingJournalEntryId ? [row.postingJournalEntryId] : []) } },
    take: limit + 1,
  });
  if (reversals.length !== offsets.length) return reject();
  const byOriginal = new Map(reversals.map(entry => [entry.originalEntryId, entry]));

  const exactLine = (lines: typeof journals[number]["lines"], accountId: string,
    debit: Prisma.Decimal, credit: Prisma.Decimal, amount: Prisma.Decimal) =>
    lines.some(line => line.ledgerAccountId === accountId &&
      line.businessPartyId === input.businessPartyId &&
      line.transactionCurrencyCode === input.currencyCode &&
      line.exchangeRate?.equals(1) &&
      line.transactionAmount?.equals(amount) && line.functionalAmount.equals(amount) &&
      line.debit.equals(debit) && line.credit.equals(credit));

  for (const allocation of allocations) {
    const offset = byId.get(allocation.sourceId);
    if (!offset || !offset.postingJournalEntryId || !offset.reversalJournalEntryId ||
        !offset.postedAt || !offset.postedByUserId || !offset.reversedAt ||
        !offset.reversedByUserId || !offset.reversalReason || offset.reversalReason.trim().length < 8 ||
        !offset.amount.equals(allocation.amount) ||
        offset.accountingDate.getTime() !== allocation.allocationDate.getTime() ||
        offset.postedByUserId !== allocation.createdByUserId ||
        Math.abs(allocation.reversedAt!.getTime() - offset.reversedAt.getTime()) > 60_000 ||
        offset.reversedByUserId === offset.requestedByUserId ||
        offset.reversedByUserId === offset.approverUserId ||
        offset.reversedByUserId === offset.postedByUserId ||
        offset.currencyCode !== input.currencyCode ||
        offset.claim.supplierId !== input.supplierId ||
        offset.claim.currencyCode !== input.currencyCode ||
        offset.targetInvoiceJournalId !== input.targetInvoiceJournalId ||
        offset.payableAccountId !== input.payableAccountId ||
        offset.claimAccountId === offset.payableAccountId) return reject();
    const original = byJournal.get(offset.postingJournalEntryId);
    const inverse = byJournal.get(offset.reversalJournalEntryId);
    const record = byOriginal.get(offset.postingJournalEntryId);
    if (!original || !inverse || !record ||
        record.reversalEntryId !== inverse.id || record.reason !== offset.reversalReason ||
        record.requestedByUserId !== offset.reversedByUserId ||
        record.approvedByUserId !== offset.reversedByUserId ||
        original.status !== "REVERSED" || !original.reversedAt ||
        original.reversalOfEntryId || original.sourceEntityType !== "EnterpriseSupplierClaimCompensation" ||
        original.sourceEntityId !== offset.id ||
        original.postingEvent !== "SUPPLIER_CLAIM_COMPENSATION_POSTED" ||
        original.accountingDate.getTime() !== offset.accountingDate.getTime() ||
        original.functionalCurrencyCode !== input.currencyCode ||
        !original.totalDebit.equals(offset.amount) || !original.totalCredit.equals(offset.amount) ||
        original.lines.length !== 2 ||
        inverse.status !== "POSTED" || !inverse.postedAt || inverse.reversedAt ||
        inverse.reversalOfEntryId !== original.id || inverse.postingEvent !== "REVERSAL" ||
        inverse.functionalCurrencyCode !== input.currencyCode ||
        !inverse.totalDebit.equals(offset.amount) || !inverse.totalCredit.equals(offset.amount) ||
        inverse.lines.length !== 2 ||
        !exactLine(original.lines, offset.payableAccountId, offset.amount, new Prisma.Decimal(0), offset.amount) ||
        !exactLine(original.lines, offset.claimAccountId, new Prisma.Decimal(0), offset.amount, offset.amount) ||
        !exactLine(inverse.lines, offset.payableAccountId, new Prisma.Decimal(0), offset.amount, offset.amount) ||
        !exactLine(inverse.lines, offset.claimAccountId, offset.amount, new Prisma.Decimal(0), offset.amount))
      return reject();
  }
}
