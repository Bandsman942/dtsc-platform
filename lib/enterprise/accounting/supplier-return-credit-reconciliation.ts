import { Prisma, type EnterpriseSupplierInvoiceItem } from "@prisma/client";
import { allocateHistoricalCreditLines } from "@/lib/enterprise/accounting/historical-credit-tax";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";
import { formatEnterpriseBusinessDate, getEnterpriseBusinessContext } from "@/lib/enterprise/business-context";

const fail = () => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409); };

/** All payable-changing paths serialize on the same parent invoice, including
 * dispatch. The original debt remains legally open until the credit posts. */
export async function lockSupplierReturnInvoiceTx(tx: Prisma.TransactionClient, organizationId: string, invoiceId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
}

type PayableCapacityInput = { outstandingAmount: Prisma.Decimal; currencyCode: string };
type ReservedReturn = { totalCost: Prisma.Decimal; recoverableTaxAmount: Prisma.Decimal; currencyCode: string };

export function supplierReturnPayableCapacity(payable: PayableCapacityInput, pending: ReservedReturn[]) {
  if (pending.some(row => row.currencyCode !== payable.currencyCode)) return fail();
  const reserved = pending.reduce((sum,row) => sum.plus(row.totalCost).plus(row.recoverableTaxAmount),new Prisma.Decimal(0));
  return { reserved, available:Prisma.Decimal.max(0,payable.outstandingAmount.minus(reserved)) };
}

/** Page-bounded summary, never expose return motives or approval identities
 * to a Finance-only reader. Call inside the same snapshot as the balances. */
export async function supplierReturnFinanceProjectionTx(tx: Prisma.TransactionClient, organizationId: string, invoiceIds: string[]) {
  if (!invoiceIds.length) return new Map<string, { id:string; reference:string; status:string; purchaseId:string; sourceMovementId:string; totalCost:Prisma.Decimal; recoverableTaxAmount:Prisma.Decimal; currencyCode:string; supplierCreditNoteId:string|null }>();
  const rows = await tx.enterpriseSupplierReturnRequest.findMany({where:{organizationId,supplierInvoiceId:{in:invoiceIds},status:{in:["DISPATCHED","RECONCILED"]}},
    select:{id:true,supplierInvoiceId:true,reference:true,status:true,purchaseId:true,sourceMovementId:true,totalCost:true,recoverableTaxAmount:true,currencyCode:true,supplierCreditNoteId:true}});
  return new Map(rows.map(row=>[row.supplierInvoiceId,row]));
}

export async function assertSupplierPaymentCapacityTx(tx: Prisma.TransactionClient, organizationId: string, payable: { supplierInvoiceId: string; outstandingAmount: Prisma.Decimal; currencyCode: string }, amount: Prisma.Decimal) {
  const pending = await tx.enterpriseSupplierReturnRequest.findMany({ where: { organizationId, supplierInvoiceId: payable.supplierInvoiceId, status: "DISPATCHED" }, select: { totalCost: true, recoverableTaxAmount: true, currencyCode: true } });
  if (!pending.length) return;
  const { reserved, available } = supplierReturnPayableCapacity(payable, pending);
  if (amount.gt(available)) throw new EnterpriseAccountingError("SUPPLIER_RETURN_PAYABLE_RESERVED", 409, { reservedAmount: reserved.toFixed(), allocatableAmount: available.toFixed(), currencyCode: payable.currencyCode });
}

/** Financial document dates are civil dates stored at UTC midnight, while
 * physical handover is an instant. Never slice the UTC instant as a business day. */
export async function assertSupplierReturnCreditDateTx(tx: Prisma.TransactionClient, organizationId: string, creditDate: Date, dispatchedAt: Date) {
  const { timezone } = await getEnterpriseBusinessContext(tx, organizationId);
  const date = formatEnterpriseBusinessDate(creditDate, "UTC");
  if (creditDate.getTime() !== new Date(date + "T00:00:00.000Z").getTime() ||
      date < formatEnterpriseBusinessDate(dispatchedAt, timezone) ||
      date > formatEnterpriseBusinessDate(new Date(), timezone)) return fail();
  return date;
}

/** First tax-enabled return tranche: exactly one historical, recoverable,
 * standard VAT application with posted INPUT evidence. Never consult today's
 * rate. Nonrecoverable tax changes inventory cost and is deliberately blocked. */
export async function deriveSupplierReturnTaxTx(tx: Prisma.TransactionClient, organizationId: string, original: EnterpriseSupplierInvoiceItem, currencyCode: string, quantity: Prisma.Decimal, date: Date) {
  if (original.taxAmount.isZero()) return { amount: new Prisma.Decimal(0), breakdown: [] };
  if (!original.taxAmount.gt(0) || !original.taxRecoveryRequested || !Array.isArray(original.taxBreakdownJson) || original.taxBreakdownJson.length !== 1 || original.taxCalculationMode !== "NET") return fail();
  const snapshot = original.taxBreakdownJson[0];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || typeof snapshot.taxCodeId !== "string" ||
      typeof snapshot.rate !== "string" || typeof snapshot.amount !== "string" || typeof snapshot.base !== "string" ||
      snapshot.treatment !== "STANDARD" || snapshot.basisMode !== "NET" || typeof snapshot.effectiveAt !== "string") return fail();
  const applications = await tx.enterpriseTaxLine.findMany({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoiceItem",sourceEntityId:original.id},include:{taxCode:{select:{category:true}}}});
  const posted=applications[0];
  if (applications.length!==1 || posted.direction!=="INPUT" || posted.taxCode.category!=="VAT" ||
      posted.taxCodeId!==snapshot.taxCodeId || posted.currencyCode!==currencyCode || posted.taxTreatment!=="STANDARD" || posted.basisMode!=="NET" ||
      posted.jurisdiction!==snapshot.jurisdiction || posted.templateVersion!==snapshot.templateVersion ||
      posted.evidenceReference!==snapshot.evidenceReference || posted.applicationOrder!==snapshot.applicationOrder ||
      !posted.effectiveAt || posted.effectiveAt.toISOString()!==snapshot.effectiveAt ||
      !posted.taxAmount.equals(original.taxAmount) || !posted.taxAmount.equals(snapshot.amount) ||
      !posted.taxableAmount.equals(original.netAmount) || !posted.taxableAmount.equals(snapshot.base) || !posted.taxRate.equals(snapshot.rate)) return fail();
  const [credit]=allocateHistoricalCreditLines([original],[],[{sourceInvoiceItemId:original.id,description:original.description,quantity:quantity.toFixed(),unitPrice:original.unitPrice.toFixed()}],date);
  return {amount:credit.taxAmount,breakdown:credit.taxBreakdown};
}

type CreditEvidence = {
  id: string; supplierInvoiceId: string; currencyCode: string; grandTotal: Prisma.Decimal; subtotal: Prisma.Decimal; taxTotal: Prisma.Decimal;
  creditDate: Date; createdByUserId: string; approvedByUserId: string | null;
};
type CreditLine = { sourceInvoiceItemId: string | null; catalogItemId: string | null; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal; taxRecoveryRequested: boolean; taxBreakdownJson: Prisma.JsonValue | null };

/** The restricted workflow matches one supplier-issued credit to the exact
 * dispatch value, line, quantity, original accounts and posted source journal.
 * It never treats an unrelated commercial discount as a stock reversal. */
export async function verifySupplierReturnCreditTx(tx: Prisma.TransactionClient, organizationId: string, credit: CreditEvidence, items: CreditLine[]) {
  const dispatched = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, supplierInvoiceId: credit.supplierInvoiceId, status: "DISPATCHED" } });
  if (!dispatched) {
    // Finalized return evidence cannot be posted again at a new posting version.
    const finalized = await tx.enterpriseSupplierReturnRequest.findFirst({where:{organizationId,supplierInvoiceId:credit.supplierInvoiceId,status:"RECONCILED"}});
    if (finalized) return fail();
    return null;
  }
  if (dispatched.supplierCreditNoteId !== credit.id || !dispatched.supplierCreditReference || !dispatched.dispatchedAt || !dispatched.dispatchMovementId || !dispatched.dispatchAccountingEventId ||
      !credit.approvedByUserId || credit.createdByUserId === credit.approvedByUserId ||
      credit.currencyCode !== dispatched.currencyCode || !credit.grandTotal.equals(dispatched.totalCost.plus(dispatched.recoverableTaxAmount)) || !credit.subtotal.equals(dispatched.totalCost) || !credit.taxTotal.equals(dispatched.recoverableTaxAmount) ||
      items.length !== 1) return fail();
  const creditBusinessDate = await assertSupplierReturnCreditDateTx(tx, organizationId, credit.creditDate, dispatched.dispatchedAt);
  const item = items[0];
  const [original, movement, event, invoiceJournal] = await Promise.all([
    tx.enterpriseSupplierInvoiceItem.findFirst({ where: { organizationId, supplierInvoiceId: credit.supplierInvoiceId, id: dispatched.supplierInvoiceItemId } }),
    tx.enterpriseStockMovement.findFirst({ where: { organizationId, id: dispatched.dispatchMovementId, sourceEntityType: "EnterpriseSupplierReturnRequest", sourceEntityId: dispatched.id, direction: "OUT", movementType: "SUPPLIER_RETURN_OUT" } }),
    tx.enterpriseInventoryAccountingEvent.findFirst({ where: { organizationId, id: dispatched.dispatchAccountingEventId, stockMovementId: dispatched.dispatchMovementId, eventType: "SUPPLIER_RETURN", status: "POSTED", journalEntryId: { not:null } } }),
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, sourceEntityType:"EnterpriseSupplierInvoice", sourceEntityId:credit.supplierInvoiceId, postingEvent:"SUPPLIER_INVOICE_POSTED",status:"POSTED" }, include: { lines:true } }),
  ]);
  if (!original || !movement || !event || !event.journalEntryId || !invoiceJournal ||
      item.sourceInvoiceItemId !== original.id || item.catalogItemId !== original.catalogItemId || !item.quantity.equals(dispatched.quantity) || !item.unitPrice.equals(dispatched.unitCost) ||
      !item.netAmount.equals(dispatched.totalCost) || !item.totalAmount.equals(credit.grandTotal) || !item.taxAmount.equals(dispatched.recoverableTaxAmount) ||
      movement.stockLotId !== dispatched.stockLotId || movement.inventoryItemId !== dispatched.inventoryItemId || movement.warehouseId !== dispatched.warehouseId || !movement.quantity.equals(dispatched.quantity) ||
      event.inventoryItemId !== dispatched.inventoryItemId || !event.quantity.equals(dispatched.quantity) || !event.unitCost.equals(dispatched.unitCost) || !event.totalCost.equals(dispatched.totalCost) || event.currencyCode !== dispatched.currencyCode) return fail();
  const tax = await deriveSupplierReturnTaxTx(tx, organizationId, original, credit.currencyCode, dispatched.quantity, credit.creditDate);
  if (!tax.amount.equals(dispatched.recoverableTaxAmount)) return fail();
  if (tax.amount.gt(0) || original.taxAmount.gt(0)) {
    if (!item.taxRecoveryRequested || !Array.isArray(item.taxBreakdownJson) || item.taxBreakdownJson.length!==tax.breakdown.length) return fail();
    const expected=tax.breakdown[0], actual=item.taxBreakdownJson[0];
    if (!expected || !actual || typeof actual!=="object" || Array.isArray(actual) || Object.entries(expected).some(([key,value])=>actual[key]!==value)) return fail();
  }
  const [journal, clearing, stock, payable] = await Promise.all([
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, id:event.journalEntryId, sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:event.id,postingEvent:"INVENTORY_SUPPLIER_RETURN_VALUED", status:"POSTED" }, include:{lines:true} }),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"GOODS_RECEIVED_CLEARING",accountingDate:credit.creditDate}),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"INVENTORY",accountingDate:credit.creditDate}),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"ACCOUNTS_PAYABLE",accountingDate:credit.creditDate}),
  ]);
  if (!journal || creditBusinessDate < formatEnterpriseBusinessDate(journal.accountingDate, "UTC") ||
      journal.functionalCurrencyCode !== credit.currencyCode || invoiceJournal.functionalCurrencyCode !== credit.currencyCode ||
      journal.lines.length !== 2 || !journal.lines.some(l=>l.ledgerAccountId===clearing.id&&l.debit.equals(dispatched.totalCost)&&l.credit.isZero()) ||
      !journal.lines.some(l=>l.ledgerAccountId===stock.id&&l.credit.equals(dispatched.totalCost)&&l.debit.isZero()) ||
      !invoiceJournal.lines.some(l=>l.ledgerAccountId===payable.id&&l.credit.gte(credit.grandTotal)&&l.debit.isZero()) ||
      !invoiceJournal.lines.some(l=>l.ledgerAccountId===clearing.id&&l.debit.gte(dispatched.totalCost)&&l.credit.isZero())) return fail();
  if (original.taxAmount.gt(0)) {
    const taxAccount=await resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"TAX_RECEIVABLE",accountingDate:credit.creditDate});
    if (new Set([taxAccount.id,stock.id,clearing.id,payable.id]).size!==4 ||
        invoiceJournal.lines.length!==3 ||
        !invoiceJournal.lines.some(l=>l.ledgerAccountId===taxAccount.id&&l.debit.equals(original.taxAmount)&&l.credit.isZero())) return fail();
  }
  return dispatched;
}

/** Called only after the real credit, journal and payable allocation have
 * been posted in the same transaction. */
export async function completeSupplierReturnCreditTx(tx: Prisma.TransactionClient, organizationId: string, credit: CreditEvidence, journalEntryId: string, actorUserId: string) {
  const linked = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, supplierCreditNoteId: credit.id, supplierInvoiceId:credit.supplierInvoiceId } });
  if (!linked) return;
  if (linked.status !== "DISPATCHED") return fail();
  const updated = await tx.enterpriseSupplierReturnRequest.updateMany({ where:{organizationId,id:linked.id,status:"DISPATCHED",revision:linked.revision,supplierCreditNoteId:credit.id},
    data:{status:"RECONCILED",reconciledAt:new Date(),reconciledByUserId:actorUserId,creditJournalEntryId:journalEntryId,revision:{increment:1}} });
  if (updated.count !== 1) return fail();
}
