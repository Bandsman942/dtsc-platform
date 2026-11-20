import { Prisma, type EnterpriseJournalEntry, type EnterpriseJournalLine } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";

const fail = (): never => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409); };
const LIMIT = 100;
const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
type Entry = EnterpriseJournalEntry & { lines: EnterpriseJournalLine[] };

/** Exact ordinary same-currency evidence only. A confirmed payment starts as
 * an advance, then the allocation transfers its amount to accounts payable.
 * Never infer cash from an invoice status, or treat an existing advance as a
 * supplier claim. Historical/mixed/FX payments need separate reconciliation. */
export async function proveSupplierReturnPaidAmountTx(tx: Prisma.TransactionClient, input: {
  organizationId: string; invoiceId: string; supplierId: string; businessPartyId: string | null;
  currencyCode: string; amountPaid: Prisma.Decimal; claimAmount: Prisma.Decimal;
}) {
  const { organizationId, invoiceId, supplierId, businessPartyId, currencyCode, amountPaid, claimAmount } = input;
  if (!businessPartyId || !amountPaid.isFinite() || !claimAmount.isFinite() || !claimAmount.gt(0) || claimAmount.gt(amountPaid)) return fail();
  const payable = await tx.enterprisePayable.findFirst({ where: { organizationId, supplierInvoiceId: invoiceId } });
  const config = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { functionalCurrencyCode: true } });
  if (!payable || payable.supplierId !== supplierId || payable.businessPartyId !== businessPartyId ||
      payable.currencyCode !== currencyCode || config?.functionalCurrencyCode !== currencyCode ||
      !payable.allocatedAmount.equals(amountPaid)) return fail();
  const links = await tx.enterprisePayableAllocation.findMany({
    where: { organizationId, payableId: payable.id, sourceType: "PAYMENT", status: "CONFIRMED", reversedAt: null },
    orderBy: { id: "asc" }, take: LIMIT + 1,
  });
  if (!links.length || links.length > LIMIT || links.some(link => !link.amount.gt(0)) ||
      !sum(links.map(link => link.amount)).equals(amountPaid) || new Set(links.map(link => link.sourceId)).size !== links.length) return fail();
  const allocations = await tx.enterprisePaymentAllocation.findMany({
    where: { organizationId, id: { in: links.map(link => link.sourceId) } },
    include: { payment: true },
  });
  if (allocations.length !== links.length) return fail();
  const paymentIds = [...new Set(allocations.map(row => row.paymentId))];
  const [treasury, journalRows, allAllocations, accounts] = await Promise.all([
    tx.enterpriseTreasuryTransaction.findMany({ where: { organizationId, paymentId: { in: paymentIds } }, take: LIMIT + 1 }),
    tx.enterpriseJournalEntry.findMany({ where: { organizationId, OR: [
      { sourceEntityType: "EnterprisePayment", sourceEntityId: { in: paymentIds } },
      { sourceEntityType: "EnterprisePaymentAllocation", sourceEntityId: { in: allocations.map(row => row.id) } },
    ] }, include: { lines: true }, take: 2 * LIMIT + 1 }),
    tx.enterprisePaymentAllocation.findMany({ where: { organizationId, paymentId: { in: paymentIds } }, take: LIMIT + 1 }),
    tx.enterpriseFinancialAccount.findMany({ where: { organizationId, id: { in: allocations.flatMap(row => row.payment.financialAccountId ? [row.payment.financialAccountId] : []) } }, select: { id: true, ledgerAccountId: true, currencyCode: true } }),
  ]);
  if (treasury.length !== paymentIds.length || journalRows.length !== paymentIds.length + allocations.length || allAllocations.length > LIMIT ||
      await tx.enterpriseJournalReversal.count({ where: { organizationId, OR: [{ originalEntryId: { in: journalRows.map(row => row.id) } }, { reversalEntryId: { in: journalRows.map(row => row.id) } }] } })) return fail();
  const journal = (type: string, id: string, event: string, amount: Prisma.Decimal): Entry => {
    const rows = journalRows.filter(row => row.sourceEntityType === type && row.sourceEntityId === id);
    const row = rows[0];
    if (rows.length !== 1 || !row || row.organizationId !== organizationId || row.postingEvent !== event || row.postingVersion !== 1 ||
        row.status !== "POSTED" || !row.postedAt || row.reversedAt || row.reversalOfEntryId ||
        row.functionalCurrencyCode !== currencyCode || !row.totalDebit.equals(amount) || !row.totalCredit.equals(amount) ||
        row.lines.length !== 2 || row.lines.some(line => line.organizationId !== organizationId || line.businessPartyId !== businessPartyId ||
          line.transactionCurrencyCode !== currencyCode || !line.transactionAmount?.equals(amount) || !line.exchangeRate?.equals(1) ||
          !line.functionalAmount.equals(amount))) return fail();
    return row;
  };
  const assertLines = (entry: Entry, debitId: string, creditId: string, amount: Prisma.Decimal) => {
    if (debitId === creditId || !entry.lines.some(line => line.ledgerAccountId === debitId && line.debit.equals(amount) && line.credit.isZero()) ||
        !entry.lines.some(line => line.ledgerAccountId === creditId && line.credit.equals(amount) && line.debit.isZero())) return fail();
  };
  const checked = new Set<string>();
  for (const allocation of allocations) {
    const payment = allocation.payment;
    const link = links.find(row => row.sourceId === allocation.id);
    if (!link || allocation.organizationId !== organizationId || allocation.payableId !== payable.id || allocation.receivableId ||
        allocation.status !== "CONFIRMED" || allocation.reversedAt || !allocation.amount.equals(link.amount) ||
        payment.organizationId !== organizationId || payment.businessPartyId !== businessPartyId ||
        payment.currencyCode !== currencyCode || payment.paymentType !== "SUPPLIER_PAYMENT" || payment.direction !== "OUTBOUND" ||
        !["CONFIRMED", "RECONCILED"].includes(payment.status) || !payment.confirmedAt || !payment.confirmedByUserId || payment.reversedAt ||
        !payment.amount.gt(0) || payment.unallocatedAmount.lt(0) || !payment.financialAccountId ||
        allocation.allocatedAt < payment.confirmedAt) return fail();
    const allocated = journal("EnterprisePaymentAllocation", allocation.id, "PAYMENT_ALLOCATION_CONFIRMED", allocation.amount);
    const [advance, debt] = await Promise.all([
      resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "SUPPLIER_ADVANCES", accountingDate: allocated.accountingDate }),
      resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "ACCOUNTS_PAYABLE", accountingDate: allocated.accountingDate }),
    ]);
    assertLines(allocated, debt.id, advance.id, allocation.amount);
    if (checked.has(payment.id)) continue;
    checked.add(payment.id);
    const account = accounts.find(row => row.id === payment.financialAccountId);
    const movement = treasury.find(row => row.paymentId === payment.id);
    const everyAllocation = allAllocations.filter(row => row.paymentId === payment.id);
    if (!account?.ledgerAccountId || account.currencyCode !== currencyCode || !movement ||
        movement.financialAccountId !== payment.financialAccountId || movement.direction !== "OUTBOUND" ||
        movement.transactionType !== "SUPPLIER_PAYMENT" || movement.status !== "CONFIRMED" || movement.reversedAt ||
        movement.currencyCode !== currencyCode || !movement.amount.equals(payment.amount) ||
        movement.transactionDate.getTime() !== payment.paymentDate.getTime() ||
        everyAllocation.some(row => row.status !== "CONFIRMED" || row.reversedAt || !row.amount.gt(0) || !row.payableId || row.receivableId) ||
        !sum(everyAllocation.map(row => row.amount)).plus(payment.unallocatedAmount).equals(payment.amount)) return fail();
    const paid = journal("EnterprisePayment", payment.id, "SUPPLIER_PAYMENT_CONFIRMED", payment.amount);
    const originalAdvance = await resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "SUPPLIER_ADVANCES", accountingDate: paid.accountingDate });
    assertLines(paid, originalAdvance.id, account.ledgerAccountId, payment.amount);
    if (originalAdvance.id !== advance.id) return fail();
  }
  return { provenPaidAmount: amountPaid, allocationCount: allocations.length, paymentCount: checked.size };
}
