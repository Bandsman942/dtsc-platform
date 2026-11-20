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
  const remaining = claim.settlementClaimAmount.minus(refunded);
  const available = remaining.minus(reserved);
  if (remaining.lt(0) || available.lt(0)) return bad();
  return { claim, invoice, credit, siteId: origin.warehouse.siteId, refunded, reserved, remaining, available };
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
