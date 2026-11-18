import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";

const fail = () => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409); };

/** All payable-changing paths serialize on the same parent invoice, including
 * dispatch. The original debt remains legally open until the credit posts. */
export async function lockSupplierReturnInvoiceTx(tx: Prisma.TransactionClient, organizationId: string, invoiceId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
}

export async function assertSupplierPaymentCapacityTx(tx: Prisma.TransactionClient, organizationId: string, payable: { supplierInvoiceId: string; outstandingAmount: Prisma.Decimal; currencyCode: string }, amount: Prisma.Decimal) {
  const pending = await tx.enterpriseSupplierReturnRequest.findMany({ where: { organizationId, supplierInvoiceId: payable.supplierInvoiceId, status: "DISPATCHED" }, select: { totalCost: true, currencyCode: true } });
  if (!pending.length) return;
  if (pending.some(row => row.currencyCode !== payable.currencyCode)) fail();
  const reserved = pending.reduce((sum, row) => sum.plus(row.totalCost), new Prisma.Decimal(0));
  const available = Prisma.Decimal.max(0, payable.outstandingAmount.minus(reserved));
  if (amount.gt(available)) throw new EnterpriseAccountingError("SUPPLIER_RETURN_PAYABLE_RESERVED", 409, { reservedAmount: reserved.toFixed(), allocatableAmount: available.toFixed(), currencyCode: payable.currencyCode });
}

type CreditEvidence = {
  id: string; supplierInvoiceId: string; currencyCode: string; grandTotal: Prisma.Decimal; subtotal: Prisma.Decimal; taxTotal: Prisma.Decimal;
  creditDate: Date; createdByUserId: string; approvedByUserId: string | null;
};
type CreditLine = { sourceInvoiceItemId: string | null; catalogItemId: string | null; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal };

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
      credit.creditDate.toISOString().slice(0,10) < dispatched.dispatchedAt.toISOString().slice(0,10) ||
      !credit.approvedByUserId || credit.createdByUserId === credit.approvedByUserId ||
      credit.currencyCode !== dispatched.currencyCode || !credit.grandTotal.equals(dispatched.totalCost) || !credit.subtotal.equals(dispatched.totalCost) || !credit.taxTotal.isZero() ||
      items.length !== 1) return fail();
  const item = items[0];
  const [original, movement, event, invoiceJournal] = await Promise.all([
    tx.enterpriseSupplierInvoiceItem.findFirst({ where: { organizationId, supplierInvoiceId: credit.supplierInvoiceId, id: dispatched.supplierInvoiceItemId } }),
    tx.enterpriseStockMovement.findFirst({ where: { organizationId, id: dispatched.dispatchMovementId, sourceEntityType: "EnterpriseSupplierReturnRequest", sourceEntityId: dispatched.id, direction: "OUT", movementType: "SUPPLIER_RETURN_OUT" } }),
    tx.enterpriseInventoryAccountingEvent.findFirst({ where: { organizationId, id: dispatched.dispatchAccountingEventId, stockMovementId: dispatched.dispatchMovementId, eventType: "SUPPLIER_RETURN", status: "POSTED", journalEntryId: { not:null } } }),
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, sourceEntityType:"EnterpriseSupplierInvoice", sourceEntityId:credit.supplierInvoiceId, postingEvent:"SUPPLIER_INVOICE_POSTED",status:"POSTED" }, include: { lines:true } }),
  ]);
  if (!original || !movement || !event || !event.journalEntryId || !invoiceJournal ||
      item.sourceInvoiceItemId !== original.id || item.catalogItemId !== original.catalogItemId || !item.quantity.equals(dispatched.quantity) || !item.unitPrice.equals(dispatched.unitCost) ||
      !item.netAmount.equals(dispatched.totalCost) || !item.totalAmount.equals(dispatched.totalCost) || !item.taxAmount.isZero() ||
      movement.stockLotId !== dispatched.stockLotId || movement.inventoryItemId !== dispatched.inventoryItemId || movement.warehouseId !== dispatched.warehouseId || !movement.quantity.equals(dispatched.quantity) ||
      event.inventoryItemId !== dispatched.inventoryItemId || !event.quantity.equals(dispatched.quantity) || !event.unitCost.equals(dispatched.unitCost) || !event.totalCost.equals(dispatched.totalCost) || event.currencyCode !== dispatched.currencyCode) return fail();
  const [journal, clearing, stock, payable] = await Promise.all([
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, id:event.journalEntryId, sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:event.id,postingEvent:"INVENTORY_SUPPLIER_RETURN_VALUED", status:"POSTED" }, include:{lines:true} }),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"GOODS_RECEIVED_CLEARING",accountingDate:credit.creditDate}),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"INVENTORY",accountingDate:credit.creditDate}),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"ACCOUNTS_PAYABLE",accountingDate:credit.creditDate}),
  ]);
  if (!journal || credit.creditDate.toISOString().slice(0,10) < journal.accountingDate.toISOString().slice(0,10) ||
      journal.functionalCurrencyCode !== credit.currencyCode || invoiceJournal.functionalCurrencyCode !== credit.currencyCode ||
      journal.lines.length !== 2 || !journal.lines.some(l=>l.ledgerAccountId===clearing.id&&l.debit.equals(credit.grandTotal)&&l.credit.isZero()) ||
      !journal.lines.some(l=>l.ledgerAccountId===stock.id&&l.credit.equals(credit.grandTotal)&&l.debit.isZero()) ||
      !invoiceJournal.lines.some(l=>l.ledgerAccountId===payable.id&&l.credit.gte(credit.grandTotal)&&l.debit.isZero()) ||
      !invoiceJournal.lines.some(l=>l.ledgerAccountId===clearing.id&&l.debit.gte(credit.grandTotal)&&l.credit.isZero())) return fail();
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
