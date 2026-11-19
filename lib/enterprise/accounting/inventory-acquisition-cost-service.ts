import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { inspectUnconsumedAcquisitionPoolTx } from "@/lib/enterprise/accounting/inventory-acquisition-cost-preflight";
import { deriveNonRecoverableInventoryCostTx } from "@/lib/enterprise/accounting/supplier-return-credit-reconciliation";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { formatEnterpriseBusinessDate, getEnterpriseBusinessContext } from "@/lib/enterprise/business-context";

const fail = () => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED", 409); };

/**
 * Internal write primitive for the canonical invoice posting transaction.
 * No public route, no separate posting event or journal is created here.
 * Requires the journal and historical tax lines just created in the SAME
 * Serializable transaction, while the posting batch is still PROCESSING
 * and the invoice remains APPROVED. Any rejection MUST roll back that
 * transaction, including journal, tax lines, cost and payable changes.
 *
 * Do not call from a repair job, a generic posting retry or an existing
 * POSTED invoice. The canonical posting authority enforces that contract;
 * generic credits/reversals and affected historical projections are guarded.
 */
export async function capitalizeNonRecoverableAcquisitionCostTx(
  tx: Prisma.TransactionClient, organizationId: string, actorUserId: string,
  input: { invoiceId: string; invoiceJournalId: string; postingBatchId: string },
) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${input.invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const invoice = await tx.enterpriseSupplierInvoice.findFirst({
    where: { organizationId, id: input.invoiceId, status: "APPROVED", postedAt: null, archivedAt: null },
    include: { items: { where: { organizationId }, take: 2 }, threeWayMatch: true },
  });
  if (!invoice || !invoice.purchaseId || !invoice.purchaseReceiptId || invoice.assetId || invoice.expenseId ||
      !invoice.approvedAt || !invoice.approvedByUserId || invoice.approvedByUserId === invoice.createdByUserId ||
      invoice.items.length !== 1 || !invoice.amountPaid.isZero() || !invoice.amountCredited.isZero() ||
      !invoice.outstandingAmount.equals(invoice.grandTotal)) return fail();
  const line = invoice.items[0];
  const match = invoice.threeWayMatch;
  if (!line.catalogItemId || line.taxRecoveryRequested || !line.taxAmount.gt(0) ||
      !line.netAmount.equals(invoice.subtotal) || !line.taxAmount.equals(invoice.taxTotal) ||
      !line.totalAmount.equals(invoice.grandTotal) || !invoice.subtotal.plus(invoice.taxTotal).equals(invoice.grandTotal) ||
      !match || match.organizationId !== organizationId || match.purchaseId !== invoice.purchaseId ||
      match.purchaseReceiptId !== invoice.purchaseReceiptId || match.status !== "MATCHED" ||
      !match.currencyMatches || !match.supplierMatches || !match.withinTolerance || match.overrideReason ||
      !match.quantityVariance.isZero() || !match.priceVariance.isZero() || !match.taxVariance.isZero()) return fail();
  const [purchase, competing, movements, batch, invoiceJournal, context, payable, credits, pharmacy, specialized] = await Promise.all([
    tx.enterprisePurchase.findFirst({
      where: { organizationId, id: invoice.purchaseId, supplierId: invoice.supplierId, archivedAt: null, status: { in: ["RECEIVED", "CLOSED"] } },
      include: { items: { where: { organizationId }, take: 2 }, receipts: { where: { organizationId }, take: 2, include: { items: { where: { organizationId }, take: 2 } } } },
    }),
    tx.enterpriseSupplierInvoice.findMany({ where: { organizationId, status: { notIn: ["CANCELLED", "REJECTED"] },
      OR: [{ purchaseId: invoice.purchaseId }, { purchaseReceiptId: invoice.purchaseReceiptId }] }, select: { id: true }, take: 2 }),
    tx.enterpriseStockMovement.findMany({ where: { organizationId, sourceEntityType: "EnterprisePurchaseReceipt", sourceEntityId: invoice.purchaseReceiptId }, take: 2 }),
    tx.enterprisePostingBatch.findFirst({ where: { organizationId, id: input.postingBatchId, status: "PROCESSING",
      postingEvent: "SUPPLIER_INVOICE_POSTED", sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id, postingVersion: 1 } }),
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, id: input.invoiceJournalId, status: "POSTED",
      postingEvent: "SUPPLIER_INVOICE_POSTED", sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id, postingVersion: 1 }, include: { lines: true } }),
    getEnterpriseBusinessContext(tx, organizationId),
    tx.enterprisePayable.findFirst({ where: { organizationId, supplierInvoiceId: invoice.id }, select: { id: true } }),
    tx.enterpriseSupplierCreditNote.count({ where: { organizationId, supplierInvoiceId: invoice.id, status: { notIn: ["CANCELLED", "REJECTED"] } } }),
    tx.pharmacyProductExtension.count({ where: { organizationId, catalogItemId: line.catalogItemId } }),
    tx.enterpriseSectorInventoryEvent.count({ where: { organizationId, catalogItemId: line.catalogItemId } }),
  ]);
  if (!purchase || purchase.items.length !== 1 || purchase.receipts.length !== 1 ||
      competing.length !== 1 || competing[0].id !== invoice.id || movements.length !== 1 ||
      !batch || !invoiceJournal?.postedAt || invoiceJournal.postedByUserId !== actorUserId ||
      batch.idempotencyKey !== invoiceJournal.idempotencyKey ||
      context.functionalCurrencyCode !== invoice.currencyCode || payable || credits || pharmacy || specialized) return fail();
  const receipt = purchase.receipts[0];
  const purchaseItem = purchase.items[0];
  const receiptItem = receipt.items[0];
  const movement = movements[0];
  if (receipt.id !== invoice.purchaseReceiptId || receipt.items.length !== 1 || receiptItem.purchaseItemId !== purchaseItem.id ||
      movement.direction !== "IN" || movement.movementType !== "PURCHASE_RECEIPT" || movement.sourceLineId !== receiptItem.id ||
      !movement.stockLotId || !movement.quantity.equals(receiptItem.quantityReceived) ||
      !receiptItem.quantityReceived.equals(purchaseItem.quantity) || !movement.quantity.equals(line.quantity) ||
      !purchaseItem.unitPrice.equals(line.unitPrice) || !purchaseItem.lineSubtotal.equals(line.netAmount) ||
      !purchaseItem.taxAmount.equals(line.taxAmount) || !purchaseItem.lineTotal.equals(line.totalAmount) ||
      purchase.currency !== invoice.currencyCode || !purchase.subtotalAmount.equals(invoice.subtotal) ||
      !purchase.taxAmount.equals(invoice.taxTotal) || !purchase.totalAmount.equals(invoice.grandTotal)) return fail();
  const [catalogLink, receiptLink, inventoryItem, pool] = await Promise.all([
    tx.enterprisePurchaseItemCatalogLink.findFirst({ where: { organizationId, purchaseItemId: purchaseItem.id, catalogItemId: line.catalogItemId, expectedItemType: "GOODS" } }),
    tx.enterprisePurchaseReceiptOperationalLink.findFirst({ where: { organizationId, purchaseReceiptId: receipt.id, status: "POSTED", warehouseId: movement.warehouseId, storageLocationId: movement.storageLocationId, serviceAccepted: false } }),
    tx.enterpriseInventoryItem.findFirst({ where: { organizationId, id: movement.inventoryItemId, catalogItemId: line.catalogItemId, status: "ACTIVE", archivedAt: null,
      catalogItem: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true } }, select: { id: true } }),
    inspectUnconsumedAcquisitionPoolTx(tx, organizationId, movement.id, invoice.currencyCode),
  ]);
  if (!catalogLink || !receiptLink || !inventoryItem) return fail();
  const { origin, layer, receiptEvent } = pool;
  const day = formatEnterpriseBusinessDate(invoice.invoiceDate, "UTC");
  if (invoice.invoiceDate.getTime() !== new Date(day + "T00:00:00.000Z").getTime() ||
      day !== formatEnterpriseBusinessDate(new Date(), context.timezone) ||
      day < formatEnterpriseBusinessDate(origin.occurredAt, context.timezone) ||
      day < formatEnterpriseBusinessDate(receipt.receivedAt, context.timezone) ||
      origin.occurredAt > invoiceJournal.postedAt || receipt.receivedAt > invoiceJournal.postedAt ||
      invoiceJournal.accountingDate.getTime() !== invoice.invoiceDate.getTime() ||
      invoiceJournal.functionalCurrencyCode !== invoice.currencyCode) return fail();
  const period = await getPostingPeriod(tx, organizationId, invoice.invoiceDate);
  if (period.id !== invoiceJournal.fiscalPeriodId) return fail();
  const receiptJournal = await tx.enterpriseJournalEntry.findFirst({
    where: { organizationId, id: receiptEvent.journalEntryId!, status: "POSTED",
      sourceEntityType: "EnterpriseInventoryAccountingEvent", sourceEntityId: receiptEvent.id, postingEvent: "INVENTORY_RECEIPT_VALUED", postingVersion: 1 },
    include: { lines: true },
  });
  if (!receiptJournal?.postedAt || receiptJournal.postedAt > invoiceJournal.postedAt ||
      formatEnterpriseBusinessDate(receiptJournal.accountingDate, context.timezone) > day ||
      receiptJournal.functionalCurrencyCode !== invoice.currencyCode) return fail();
  const [stock, clearing, payableAccount, supplement, taxLine] = await Promise.all([
    resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "INVENTORY", accountingDate: invoice.invoiceDate }),
    resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "GOODS_RECEIVED_CLEARING", accountingDate: invoice.invoiceDate }),
    resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "ACCOUNTS_PAYABLE", accountingDate: invoice.invoiceDate }),
    deriveNonRecoverableInventoryCostTx(tx, organizationId, line, invoice.currencyCode, receiptEvent, invoice.invoiceDate),
    tx.enterpriseTaxLine.findFirst({ where: { organizationId, sourceEntityType: "EnterpriseSupplierInvoiceItem", sourceEntityId: line.id,
      direction: "INPUT_NONRECOVERABLE", currencyCode: invoice.currencyCode }, select: { id: true, effectiveAt: true } }),
  ]);
  const hasLine = (lines: typeof invoiceJournal.lines, ledgerAccountId: string, debit: Prisma.Decimal, credit: Prisma.Decimal) =>
    lines.some(row => row.ledgerAccountId === ledgerAccountId && row.debit.equals(debit) && row.credit.equals(credit) &&
      row.transactionCurrencyCode === invoice.currencyCode && row.exchangeRate?.equals(1) === true);
  const zero = new Prisma.Decimal(0);
  if (!taxLine?.effectiveAt || taxLine.effectiveAt.getTime() !== invoice.invoiceDate.getTime() ||
      new Set([stock.id, clearing.id, payableAccount.id]).size !== 3 ||
      receiptJournal.lines.length !== 2 || invoiceJournal.lines.length !== 3 ||
      !receiptJournal.totalDebit.equals(supplement.originalTotalCost) || !receiptJournal.totalCredit.equals(supplement.originalTotalCost) ||
      !invoiceJournal.totalDebit.equals(supplement.totalCost) || !invoiceJournal.totalCredit.equals(supplement.totalCost) ||
      !hasLine(receiptJournal.lines, stock.id, supplement.originalTotalCost, zero) ||
      !hasLine(receiptJournal.lines, clearing.id, zero, supplement.originalTotalCost) ||
      !hasLine(invoiceJournal.lines, clearing.id, supplement.originalTotalCost, zero) ||
      !hasLine(invoiceJournal.lines, stock.id, supplement.capitalizedTaxAmount, zero) ||
      !hasLine(invoiceJournal.lines, payableAccount.id, zero, supplement.totalCost)) return fail();

  // A compare-and-set of the exact observed layer also creates a write/write
  // conflict with a concurrent CUMP issue. Serializable is mandatory for
  // detecting phantoms in checked movements, holdings and operations.
  const updated = await tx.enterpriseInventoryCostLayer.updateMany({
    where: { organizationId, id: layer.id, sourceMovementId: origin.id, inventoryItemId: origin.inventoryItemId,
      warehouseId: origin.warehouseId, currencyCode: invoice.currencyCode, valuationMethod: "WEIGHTED_AVERAGE",
      quantity: supplement.quantity, remainingQuantity: supplement.quantity,
      unitCost: supplement.originalUnitCost, totalCost: supplement.originalTotalCost },
    data: { unitCost: supplement.unitCost, totalCost: supplement.totalCost },
  });
  if (updated.count !== 1) return fail();
  return tx.enterpriseInventoryAcquisitionCostSupplement.create({
    data: { organizationId, supplierInvoiceItemId: line.id, costLayerId: layer.id,
      receiptAccountingEventId: receiptEvent.id, taxLineId: taxLine.id, invoiceJournalEntryId: invoiceJournal.id,
      ...supplement, currencyCode: invoice.currencyCode, effectiveAt: invoice.invoiceDate, recordedByUserId: actorUserId },
  });
}
