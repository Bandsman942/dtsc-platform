import { Prisma, type EnterprisePayment } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { resolveSupplierReturnClaimAccountTx } from "@/lib/enterprise/accounting/supplier-return-settlement";
import { proveSupplierReturnPaidAmountTx } from "@/lib/enterprise/accounting/supplier-return-payment-proof";
import type { PostingBuilder } from "@/lib/enterprise/accounting/posting-types";

export const SUPPLIER_RETURN_REFUND_TYPE = "SUPPLIER_RETURN_REFUND";
const EVENT = "SUPPLIER_RETURN_REFUND_CONFIRMED";
const bad = (): never => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_EVIDENCE_REQUIRED", 409); };
const zero = () => new Prisma.Decimal(0);
const LIMIT = 100;

// Called inside the same serializable transaction as each refund reservation
// or confirmation. The canonical payment rows are the only settlement register.
export async function lockSupplierClaimRefundTx(tx: Prisma.TransactionClient, organizationId: string, claimId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierReturnRequest" WHERE id = ${claimId} AND "organizationId" = ${organizationId} FOR UPDATE`);
}

export async function readSupplierClaimRefundEvidenceTx(
  tx: Prisma.TransactionClient, organizationId: string, claimId: string, excludePaymentId?: string,
  excludeCompensationId?: string,
) {
  const claim = await tx.enterpriseSupplierReturnRequest.findFirst({
    where: { organizationId, id: claimId, status: "RECONCILED" },
  });
  if (!claim) throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_CLAIM_NOT_FOUND", 404);
  if (!claim.settlementClaimAmount?.gt(0) || !claim.settlementPayableAmount ||
      !claim.settlementClaimAccountId || !claim.supplierCreditNoteId || !claim.creditJournalEntryId ||
      !claim.reconciledAt || !claim.dispatchMovementId ||
      !claim.settlementClaimAmount.plus(claim.settlementPayableAmount).equals(claim.totalCost.plus(claim.recoverableTaxAmount))) return bad();
  const [invoice, credit, journal, origin, config] = await Promise.all([
    tx.enterpriseSupplierInvoice.findFirst({ where: { organizationId, id: claim.supplierInvoiceId } }),
    tx.enterpriseSupplierCreditNote.findFirst({ where: { organizationId, id: claim.supplierCreditNoteId, supplierInvoiceId: claim.supplierInvoiceId, status: "POSTED" } }),
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, id: claim.creditJournalEntryId, sourceEntityType: "EnterpriseSupplierCreditNote", sourceEntityId: claim.supplierCreditNoteId, postingEvent: "SUPPLIER_CREDIT_NOTE_POSTED", postingVersion: 1, status: "POSTED" }, include: { lines: true } }),
    tx.enterpriseStockMovement.findFirst({ where: { organizationId, id: claim.sourceMovementId, warehouseId: claim.warehouseId }, select: { warehouse: { select: { siteId: true } } } }),
    tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { functionalCurrencyCode: true } }),
  ]);
  if (!invoice?.businessPartyId || !credit?.postedAt || !journal?.postedAt || !origin ||
      invoice.supplierId !== claim.supplierId || invoice.currencyCode !== claim.currencyCode ||
      invoice.outstandingAmount.lt(0) || credit.currencyCode !== claim.currencyCode ||
      !credit.grandTotal.equals(claim.totalCost.plus(claim.recoverableTaxAmount)) ||
      config?.functionalCurrencyCode !== claim.currencyCode || journal.functionalCurrencyCode !== claim.currencyCode ||
      journal.reversedAt || journal.reversalOfEntryId || !journal.totalDebit.equals(credit.grandTotal) || !journal.totalCredit.equals(credit.grandTotal) ||
      await tx.enterpriseJournalReversal.count({ where: { organizationId, OR: [{ originalEntryId: journal.id }, { reversalEntryId: journal.id }] } })) return bad();
  const claimLines = journal.lines.filter(line => line.ledgerAccountId === claim.settlementClaimAccountId);
  if (claimLines.length !== 1 || claimLines[0].businessPartyId !== invoice.businessPartyId ||
      !claimLines[0].debit.equals(claim.settlementClaimAmount) || !claimLines[0].credit.isZero() ||
      claimLines[0].transactionCurrencyCode !== claim.currencyCode || !claimLines[0].exchangeRate?.equals(1)) return bad();
  await proveSupplierReturnPaidAmountTx(tx, { organizationId, invoiceId: invoice.id, supplierId: claim.supplierId,
    businessPartyId: invoice.businessPartyId, currencyCode: claim.currencyCode, amountPaid: invoice.amountPaid,
    claimAmount: claim.settlementClaimAmount });
  const rows = await tx.enterprisePayment.findMany({
    where: { organizationId, supplierReturnClaimId: claim.id, status: { not: "CANCELLED" },
      ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}) },
    orderBy: { id: "asc" }, take: LIMIT + 1,
  });
  if (rows.length > LIMIT) return bad();
  let refunded = zero();
  let reserved = zero();
  for (const payment of rows) {
    if (payment.paymentType !== SUPPLIER_RETURN_REFUND_TYPE || payment.direction !== "INBOUND" ||
        payment.methodType !== "BANK_TRANSFER" || !payment.financialAccountId || !payment.reference ||
        payment.businessPartyId !== invoice.businessPartyId || payment.currencyCode !== claim.currencyCode ||
        !payment.amount.gt(0) || !payment.unallocatedAmount.isZero() || payment.reversedAt ||
        payment.paymentDate < credit.creditDate) return bad();
    if (["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(payment.status)) {
      if (payment.confirmedAt) return bad();
      reserved = reserved.plus(payment.amount);
      continue;
    }
    if (!["CONFIRMED", "RECONCILED"].includes(payment.status) || !payment.confirmedAt || !payment.confirmedByUserId) return bad();
    const [bank, treasury, entries] = await Promise.all([
      tx.enterpriseFinancialAccount.findFirst({ where: { organizationId, id: payment.financialAccountId } }),
      tx.enterpriseTreasuryTransaction.findMany({ where: { organizationId, paymentId: payment.id }, take: 2 }),
      tx.enterpriseJournalEntry.findMany({ where: { organizationId, sourceEntityType: "EnterprisePayment", sourceEntityId: payment.id }, include: { lines: true }, take: 2 }),
    ]);
    const movement = treasury[0], entry = entries[0];
    if (treasury.length !== 1 || entries.length !== 1 || !bank?.ledgerAccountId ||
        movement.financialAccountId !== bank.id || movement.status !== "CONFIRMED" || movement.reversedAt ||
        movement.transactionType !== SUPPLIER_RETURN_REFUND_TYPE || movement.direction !== "INBOUND" ||
        movement.currencyCode !== claim.currencyCode || !movement.amount.equals(payment.amount) ||
        movement.transactionDate.getTime() !== payment.paymentDate.getTime() ||
        entry.status !== "POSTED" || !entry.postedAt || entry.reversedAt || entry.reversalOfEntryId ||
        entry.postingEvent !== EVENT || entry.postingVersion !== 1 || entry.functionalCurrencyCode !== claim.currencyCode ||
        !entry.totalDebit.equals(payment.amount) || !entry.totalCredit.equals(payment.amount) || entry.lines.length !== 2 ||
        bank.ledgerAccountId === claim.settlementClaimAccountId ||
        !entry.lines.some(line => line.ledgerAccountId === bank.ledgerAccountId && line.debit.equals(payment.amount) && line.credit.isZero()) ||
        !entry.lines.some(line => line.ledgerAccountId === claim.settlementClaimAccountId && line.credit.equals(payment.amount) && line.debit.isZero()) ||
        entry.lines.some(line => line.businessPartyId !== invoice.businessPartyId || line.transactionCurrencyCode !== claim.currencyCode || !line.exchangeRate?.equals(1)) ||
        await tx.enterpriseJournalReversal.count({ where: { organizationId, OR: [{ originalEntryId: entry.id }, { reversalEntryId: entry.id }] } })) return bad();
    refunded = refunded.plus(payment.amount);
  }
  const compensations = await tx.enterpriseSupplierClaimCompensation.findMany({
    where: { organizationId, claimId: claim.id, status: { in: ["PENDING_APPROVAL", "APPROVED", "POSTED"] },
      ...(excludeCompensationId ? { id: { not: excludeCompensationId } } : {}) },
    orderBy: { id: "asc" }, take: LIMIT + 1,
  });
  if (compensations.length > LIMIT) return bad();
  let compensated = zero(), compensationReserved = zero();
  for (const offset of compensations) {
    if (!offset.amount.isFinite() || !offset.amount.gt(0) || offset.amount.decimalPlaces() > 6 ||
        offset.currencyCode !== claim.currencyCode || offset.sourceCreditJournalId !== journal.id ||
        offset.claimAccountId !== claim.settlementClaimAccountId || !offset.submittedAt ||
        !offset.approverUserId || offset.approverUserId === offset.requestedByUserId) return bad();
    if (["PENDING_APPROVAL", "APPROVED"].includes(offset.status)) {
      if (offset.postedAt || offset.postingJournalEntryId) return bad();
      compensationReserved = compensationReserved.plus(offset.amount);
      continue;
    }
    // No balancing entry, allocation, or account proof means no claim reduction.
    const [entries, allocation, payable] = await Promise.all([
      tx.enterpriseJournalEntry.findMany({ where: { organizationId, sourceEntityType: "EnterpriseSupplierClaimCompensation", sourceEntityId: offset.id }, include: { lines: true }, take: 2 }),
      tx.enterprisePayableAllocation.findMany({ where: { organizationId, sourceType: "SUPPLIER_CLAIM_COMPENSATION", sourceId: offset.id }, take: 2 }),
      tx.enterprisePayable.findFirst({ where: { organizationId, id: offset.payableId } }),
    ]);
    const entry = entries[0], alloc = allocation[0];
    if (offset.status !== "POSTED" || !offset.approvedAt || !offset.approvedByUserId || !offset.postedAt ||
        !offset.postedByUserId || !offset.postingJournalEntryId ||
        !payable || payable.businessPartyId !== invoice.businessPartyId || payable.currencyCode !== claim.currencyCode ||
        entries.length !== 1 || allocation.length !== 1 || !alloc || alloc.payableId !== offset.payableId ||
        alloc.status !== "CONFIRMED" || alloc.reversedAt || !alloc.amount.equals(offset.amount) ||
        !entry || entry.id !== offset.postingJournalEntryId || entry.status !== "POSTED" || !entry.postedAt ||
        entry.reversedAt || entry.reversalOfEntryId || entry.postingEvent !== "SUPPLIER_CLAIM_COMPENSATION_POSTED" ||
        entry.postingVersion !== 1 || entry.functionalCurrencyCode !== claim.currencyCode ||
        !entry.totalDebit.equals(offset.amount) || !entry.totalCredit.equals(offset.amount) || entry.lines.length !== 2 ||
        !entry.lines.some(line => line.ledgerAccountId === offset.payableAccountId && line.debit.equals(offset.amount) && line.credit.isZero()) ||
        !entry.lines.some(line => line.ledgerAccountId === offset.claimAccountId && line.credit.equals(offset.amount) && line.debit.isZero()) ||
        entry.lines.some(line => line.businessPartyId !== invoice.businessPartyId || line.transactionCurrencyCode !== claim.currencyCode ||
          !line.exchangeRate?.equals(1) || !line.transactionAmount?.equals(offset.amount)) ||
        await tx.enterpriseJournalReversal.count({ where: { organizationId, OR: [{ originalEntryId: entry.id }, { reversalEntryId: entry.id }] } })) return bad();
    compensated = compensated.plus(offset.amount);
  }
  const remaining = claim.settlementClaimAmount.minus(refunded).minus(compensated);
  reserved = reserved.plus(compensationReserved);
  const available = remaining.minus(reserved);
  if (remaining.lt(0) || available.lt(0)) return bad();
  return { claim, invoice, credit, siteId: origin.warehouse.siteId, refunded, compensated, compensationReserved, reserved, remaining, available };
}

type RefundIntent = {
  supplierReturnClaimId?: string | null; direction: string; methodType: string; currencyCode: string;
  financialAccountId?: string | null; businessPartyId?: string | null; amount: Prisma.Decimal.Value;
  paymentDate: Date; reference?: string | null;
  idempotencyKey?: string | null; employeeId?: string | null; payrollRunId?: string | null;
  expenseId?: string | null; cashSessionId?: string | null; paymentMethodId?: string | null;
};

export async function assertSupplierClaimRefundIntentTx(
  tx: Prisma.TransactionClient, organizationId: string, actorUserId: string | null,
  input: RefundIntent, excludePaymentId?: string,
) {
  const amount = new Prisma.Decimal(input.amount);
  if (!input.supplierReturnClaimId || !input.financialAccountId || !input.reference?.trim() ||
      !input.idempotencyKey || input.direction !== "INBOUND" || input.methodType !== "BANK_TRANSFER" ||
      input.employeeId || input.payrollRunId || input.expenseId || input.cashSessionId || input.paymentMethodId ||
      !amount.isFinite() || !amount.gt(0) || amount.decimalPlaces() > 6) return bad();
  const evidence = await readSupplierClaimRefundEvidenceTx(tx, organizationId, input.supplierReturnClaimId, excludePaymentId);
  if (input.currencyCode !== evidence.claim.currencyCode || input.businessPartyId !== evidence.invoice.businessPartyId ||
      input.paymentDate < evidence.credit.creditDate || amount.gt(evidence.available)) {
    throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_AMOUNT_INVALID", 409);
  }
  const bank = await tx.enterpriseFinancialAccount.findFirst({
    where: { organizationId, id: input.financialAccountId, accountType: "BANK", status: "ACTIVE", archivedAt: null, currencyCode: input.currencyCode },
  });
  if (!bank?.ledgerAccountId || bank.ledgerAccountId === evidence.claim.settlementClaimAccountId ||
      (bank.siteId && bank.siteId !== evidence.siteId)) return bad();
  if (actorUserId) {
    const scope = await retailFinanceReadSiteScope(organizationId, actorUserId, "COLLECT_PAYMENT", tx);
    if (scope !== null && (!evidence.siteId || !scope.includes(evidence.siteId) || !bank.siteId || !scope.includes(bank.siteId))) {
      throw new EnterpriseAccountingError("SUPPLIER_RETURN_REFUND_ACCESS_FORBIDDEN", 403);
    }
  }
  let accountId: string;
  try { accountId = await resolveSupplierReturnClaimAccountTx(tx, organizationId, input.currencyCode, input.paymentDate); }
  catch { return bad(); }
  if (accountId !== evidence.claim.settlementClaimAccountId) return bad();
  return { ...evidence, bank, accountId, amount };
}

export async function assertSupplierClaimRefundAssignedApprovalTx(
  tx: Prisma.TransactionClient, organizationId: string, payment: EnterprisePayment,
) {
  if (!payment.approvedByUserId || payment.approvedByUserId === payment.initiatedByUserId) return bad();
  const approval = await tx.enterpriseApproval.findFirst({ where: {
    organizationId, targetEntityType: "EnterprisePayment", targetEntityId: payment.id,
    status: "APPROVED", archivedAt: null, requestedByUserId: payment.initiatedByUserId,
    approverUserId: payment.approvedByUserId,
  } });
  if (!approval) return bad();
}

export const buildSupplierClaimRefundPosting: PostingBuilder = async (tx, input) => {
  if (input.sourceEntityType !== "EnterprisePayment") return bad();
  const payment = await tx.enterprisePayment.findFirst({
    where: { organizationId: input.organizationId, id: input.sourceEntityId,
      paymentType: SUPPLIER_RETURN_REFUND_TYPE, status: "CONFIRMED" },
  });
  if (!payment?.confirmedByUserId || !payment.confirmedAt || !payment.unallocatedAmount.isZero()) return bad();
  await assertSupplierClaimRefundAssignedApprovalTx(tx, input.organizationId, payment);
  const proof = await assertSupplierClaimRefundIntentTx(tx, input.organizationId, payment.confirmedByUserId, payment, payment.id);
  const treasury = await tx.enterpriseTreasuryTransaction.findMany({ where: { organizationId: input.organizationId, paymentId: payment.id }, take: 2 });
  if (treasury.length !== 1 || treasury[0].status !== "CONFIRMED" || treasury[0].transactionType !== SUPPLIER_RETURN_REFUND_TYPE ||
      treasury[0].financialAccountId !== proof.bank.id || treasury[0].direction !== "INBOUND" ||
      treasury[0].currencyCode !== payment.currencyCode || !treasury[0].amount.equals(payment.amount) ||
      treasury[0].transactionDate.getTime() !== payment.paymentDate.getTime()) return bad();
  const common = { transactionCurrencyCode: payment.currencyCode, transactionAmount: payment.amount, businessPartyId: payment.businessPartyId };
  return {
    organizationId: input.organizationId, journalType: "BANK", accountingDate: payment.paymentDate,
    documentDate: payment.paymentDate, reference: payment.reference, description: "Supplier return refund " + payment.number,
    sourceModule: "FINANCE_PAYMENTS", sourceEntityType: "EnterprisePayment", sourceEntityId: payment.id, currencyCode: payment.currencyCode,
    lines: [
      { ...common, accountMappingKey: "ACCOUNT_ID:" + proof.bank.ledgerAccountId, description: payment.number, debit: payment.amount },
      { ...common, accountMappingKey: "SUPPLIER_RETURN_CLAIMS", description: payment.number, credit: payment.amount },
    ],
  };
};

/** Lot 1G.1: read-only capacity for the first non-cash compensation.
 * No reservation, approval or posting is authorized by this result.
 * Initial scope: a newly posted, entirely unpaid and uncredited supplier
 * invoice, with exact original debt evidence in the same functional currency.
 * Future writes must re-run all checks under both claim and target locks. */
export async function readSupplierClaimCompensationTargetTx(
  tx: Prisma.TransactionClient, organizationId: string,
  proof: Awaited<ReturnType<typeof readSupplierClaimRefundEvidenceTx>>,
  payableId: string,
  intent?: { amount: string; accountingDate: string },
) {
  return (await readSupplierClaimCompensationEvidenceTx(tx, organizationId, proof, payableId, intent)).preview;
}

// Internal evidence for a frozen draft. Public read-only projection never
// reveals ledger identifiers or historical journal identifiers.
export async function readSupplierClaimCompensationEvidenceTx(
  tx: Prisma.TransactionClient, organizationId: string,
  proof: Awaited<ReturnType<typeof readSupplierClaimRefundEvidenceTx>>,
  payableId: string, intent?: { amount: string; accountingDate: string },
  excludeCompensationId?: string,
) {
  const reject = (): never => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409); };
  if (proof.claim.organizationId !== organizationId || !proof.invoice.businessPartyId ||
      !proof.available.isFinite() || proof.available.lt(0) || !proof.claim.settlementClaimAccountId) return reject();
  const payable = await tx.enterprisePayable.findFirst({
    where: { organizationId, id: payableId },
    include: { supplierInvoice: true },
  });
  if (!payable) return reject();
  const target = payable.supplierInvoice;
  if (target.id === proof.invoice.id || target.organizationId !== organizationId ||
      target.supplierId !== proof.claim.supplierId || payable.supplierId !== target.supplierId ||
      target.businessPartyId !== proof.invoice.businessPartyId || payable.businessPartyId !== target.businessPartyId ||
      target.currencyCode !== proof.claim.currencyCode || payable.currencyCode !== target.currencyCode ||
      target.status !== "POSTED" || target.archivedAt || !target.postedAt ||
      target.invoiceDate < proof.credit.creditDate || payable.status !== "OPEN" ||
      !target.grandTotal.isFinite() || !target.grandTotal.gt(0) || target.grandTotal.decimalPlaces() > 6 ||
      !target.amountPaid.isZero() || !target.amountCredited.isZero() ||
      !payable.allocatedAmount.isZero() || !payable.creditedAmount.isZero() ||
      !target.grandTotal.equals(payable.originalAmount) || !target.grandTotal.equals(target.outstandingAmount) ||
      !target.outstandingAmount.equals(payable.outstandingAmount)) return reject();
  const [allocations, paymentAllocations, returns, credits, journals] = await Promise.all([
    tx.enterprisePayableAllocation.count({ where: { organizationId, payableId } }),
    tx.enterprisePaymentAllocation.count({ where: { organizationId, payableId } }),
    tx.enterpriseSupplierReturnRequest.count({ where: { organizationId, supplierInvoiceId: target.id } }),
    tx.enterpriseSupplierCreditNote.count({ where: { organizationId, supplierInvoiceId: target.id } }),
    tx.enterpriseJournalEntry.findMany({
      where: { organizationId, sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: target.id },
      include: { lines: true }, take: 2,
    }),
  ]);
  const entry = journals[0];
  if (allocations || paymentAllocations || returns || credits || journals.length !== 1 ||
      entry.status !== "POSTED" || !entry.postedAt || entry.reversedAt || entry.reversalOfEntryId ||
      entry.postingVersion !== 1 || entry.postingEvent !== "SUPPLIER_INVOICE_POSTED" ||
      entry.functionalCurrencyCode !== target.currencyCode ||
      !entry.totalDebit.equals(target.grandTotal) || !entry.totalCredit.equals(target.grandTotal) ||
      await tx.enterpriseJournalReversal.count({ where: { organizationId, OR: [{ originalEntryId: entry.id }, { reversalEntryId: entry.id }] } })) return reject();
  const { resolveSemanticPostingAccount } = await import("@/lib/enterprise/accounting/semantic-account-resolver");
  const debt = await resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "ACCOUNTS_PAYABLE", accountingDate: entry.accountingDate });
  if (debt.id === proof.claim.settlementClaimAccountId) return reject();
  const lines = entry.lines.filter(line => line.ledgerAccountId === debt.id);
  if (lines.length !== 1 || lines[0].businessPartyId !== target.businessPartyId ||
      !lines[0].debit.isZero() || !lines[0].credit.equals(target.grandTotal) ||
      lines[0].transactionCurrencyCode !== target.currencyCode || !lines[0].exchangeRate?.equals(1) ||
      !lines[0].transactionAmount?.equals(target.grandTotal) || !lines[0].functionalAmount.equals(target.grandTotal) ||
      entry.lines.some(line => line.ledgerAccountId === proof.claim.settlementClaimAccountId)) return reject();
  const otherReservations = await tx.enterpriseSupplierClaimCompensation.findMany({
    where: { organizationId, payableId, status: { in: ["PENDING_APPROVAL", "APPROVED"] },
      ...(excludeCompensationId ? { id: { not: excludeCompensationId } } : {}) },
    select: { id: true, amount: true, currencyCode: true, targetInvoiceJournalId: true, payableAccountId: true },
    take: LIMIT + 1,
  });
  if (otherReservations.length > LIMIT || otherReservations.some(row =>
      row.currencyCode !== payable.currencyCode || !row.amount.isFinite() || !row.amount.gt(0) ||
      row.targetInvoiceJournalId !== entry.id || row.payableAccountId !== debt.id)) return reject();
  const targetReserved = otherReservations.reduce((sum,row)=>sum.plus(row.amount),zero());
  if (targetReserved.gt(payable.outstandingAmount)) return reject();
  const targetAvailable = payable.outstandingAmount.minus(targetReserved);
  const maximum = Prisma.Decimal.min(proof.available, targetAvailable);
  const plan = intent ? await readSupplierClaimCompensationPostingPlanTx(tx, organizationId, {
    ...intent, currencyCode: target.currencyCode, maximum, openPayable: targetAvailable,
    unreservedClaim: proof.available, targetInvoiceDate: target.invoiceDate, creditDate: proof.credit.creditDate,
    historicalDebtAccountId: debt.id, claimAccountId: proof.claim.settlementClaimAccountId,
  }) : undefined;
  return {
    evidence: { targetInvoiceId: target.id, targetInvoiceJournalId: entry.id, payableAccountId: debt.id },
    preview: {
      payableId: payable.id, invoiceReference: target.number, currencyCode: target.currencyCode,
      openPayable: payable.outstandingAmount, targetReserved, targetAvailable, unreservedClaim: proof.available, maximum,
      executionAvailable: false as const,
      ...(plan ? { plan } : {}),
    },
  };
}

/** An exact proposed non-cash posting, still read-only. Revalidate under
 * the claim and target invoice locks before reservation, review or posting.
 * No customer-managed fiscal calendar is provisioned on this GET path. */
async function readSupplierClaimCompensationPostingPlanTx(
  tx: Prisma.TransactionClient, organizationId: string,
  input: { amount: string; accountingDate: string; currencyCode: string; maximum: Prisma.Decimal;
    openPayable: Prisma.Decimal; unreservedClaim: Prisma.Decimal; targetInvoiceDate: Date;
    creditDate: Date; historicalDebtAccountId: string; claimAccountId: string },
) {
  const reject = (): never => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_COMPENSATION_PLAN_INVALID", 409); };
  const { isValidEnterpriseActivityCivilDate } = await import("@/lib/enterprise/enterprise-activity-civil-date");
  // Validate the civil day before encoding it as the canonical UTC-midnight
  // database date. Today's limit still uses the organization's timezone.
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(input.amount) ||
      !isValidEnterpriseActivityCivilDate(input.accountingDate)) return reject();
  const amount = new Prisma.Decimal(input.amount);
  const accountingDate = new Date(input.accountingDate + "T00:00:00.000Z");
  if (!amount.isFinite() || !amount.gt(0) || amount.gt(input.maximum) ||
      !Number.isFinite(accountingDate.getTime()) ||
      accountingDate < input.creditDate || accountingDate < input.targetInvoiceDate) return reject();
  const { getEnterpriseBusinessContext, formatEnterpriseBusinessDate } = await import("@/lib/enterprise/business-context");
  const { EnterpriseDomainError } = await import("@/lib/enterprise/common/errors");
  const context = await getEnterpriseBusinessContext(tx, organizationId).catch((error: unknown) => {
    if (error instanceof EnterpriseDomainError) return reject();
    throw error;
  });
  if (context.functionalCurrencyCode !== input.currencyCode ||
      input.accountingDate > formatEnterpriseBusinessDate(new Date(), context.timezone)) return reject();
  const { getPostingPeriod } = await import("@/lib/enterprise/accounting/periods");
  const { assertFinanceReady } = await import("@/lib/enterprise/accounting/configuration-service");
  const { resolveSemanticPostingAccount } = await import("@/lib/enterprise/accounting/semantic-account-resolver");
  const configuration = await assertFinanceReady(tx, organizationId, {
    asOf: accountingDate, requiredMappingKeys: ["ACCOUNTS_PAYABLE", "SUPPLIER_RETURN_CLAIMS"],
    requiredJournalTypes: ["GENERAL"],
  });
  if (configuration.functionalCurrencyCode !== input.currencyCode || !configuration.automaticPostingEnabled) return reject();
  const [period, journal, debt, claimAccountId] = await Promise.all([
    getPostingPeriod(tx, organizationId, accountingDate),
    tx.enterpriseJournal.findFirst({ where: { organizationId, journalType: "GENERAL", isActive: true },
      orderBy: { createdAt: "asc" }, select: { id: true } }),
    resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "ACCOUNTS_PAYABLE", accountingDate }),
    resolveSupplierReturnClaimAccountTx(tx, organizationId, input.currencyCode, accountingDate).catch((error: unknown) => {
      if (error instanceof EnterpriseDomainError) return reject();
      throw error;
    }),
  ]);
  if (period.status !== "OPEN" || !journal ||
      debt.id !== input.historicalDebtAccountId || claimAccountId !== input.claimAccountId ||
      debt.id === claimAccountId) return reject();
  return {
    accountingDate: input.accountingDate, amount,
    debitPayable: amount, creditSupplierClaim: amount,
    payableAfter: input.openPayable.minus(amount),
    unreservedClaimAfter: input.unreservedClaim.minus(amount),
    treasuryImpact: zero(), executionAvailable: false as const,
  };
}
