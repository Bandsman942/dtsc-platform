import { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { requireInventoryStockAuthorityTx } from "@/lib/enterprise/inventory/service";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { money, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { allocateHistoricalCreditLines } from "@/lib/enterprise/accounting/historical-credit-tax";
import { deriveCapitalizedSupplierReturnTx, deriveSupplierReturnTaxTx, readPriorReconciledSupplierReturnCreditsTx } from "@/lib/enterprise/accounting/supplier-return-credit-reconciliation";

export type SupplierReturnCoordinates = {
  inventoryItemId: string; warehouseId: string; storageLocationId?: string | null; stockLotId?: string | null;
  quantity: Prisma.Decimal.Value; supplierReturnSourceMovementId: string;
};

function blocked(code: string): never { throw new EnterpriseDomainError(code, 409); }

/** The first supported return is deliberately narrow: an identified, isolated
 * lot from a unique original receipt in its original warehouse, with a
 * posted matching supplier invoice and equal current/original unit costs.
 * Never guess allocation across suppliers, currencies or transferred stock.
 * Only proven historical independent recoverable standard VAT is supported.
 * Run this again in the same serializable transaction as any future dispatch. */
export async function inspectSupplierReturnTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, input: SupplierReturnCoordinates) {
  await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, input.warehouseId);
  const qty = new Prisma.Decimal(input.quantity);
  if (!qty.gt(0) || qty.decimalPlaces() > 3 || !input.stockLotId) blocked("SUPPLIER_RETURN_QUANTITY_INVALID");
  const origin = await tx.enterpriseStockMovement.findFirst({
    where: { organizationId, id: input.supplierReturnSourceMovementId, movementType: "PURCHASE_RECEIPT", direction: "IN",
      sourceEntityType: "EnterprisePurchaseReceipt", inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId,
      storageLocationId: input.storageLocationId || null, stockLotId: input.stockLotId },
    include: { inventoryItem: { include: { catalogItem: { select: { id: true, trackInventory: true, status: true, archivedAt: true } } } },
      stockLot: true, warehouse: { select: { status: true, archivedAt: true } } },
  });
  if (!origin?.stockLot || !origin.sourceEntityId || !origin.sourceLineId || origin.inventoryItem.status !== "ACTIVE" ||
    origin.inventoryItem.archivedAt || !origin.inventoryItem.lotTracking || !origin.inventoryItem.catalogItem.trackInventory ||
    origin.inventoryItem.catalogItem.status !== "ACTIVE" || origin.inventoryItem.catalogItem.archivedAt ||
    origin.stockLot.archivedAt || origin.warehouse.status !== "ACTIVE" || origin.warehouse.archivedAt) blocked("SUPPLIER_RETURN_ORIGIN_INVALID");
  if (!["BLOCKED", "QUARANTINED"].includes(origin.stockLot.status)) blocked("SUPPLIER_RETURN_ISOLATE_FIRST");
  const catalogItemId = origin.inventoryItem.catalogItemId;
  const coordinates = { organizationId, inventoryItemId: origin.inventoryItemId, warehouseId: origin.warehouseId };
  const [reservations, holds, pendingAdjustment, transfer, count] = await Promise.all([
    tx.enterpriseInventoryReservation.count({ where: { ...coordinates, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    readActiveRetailInvoiceStockHoldsTx(tx, { organizationId, warehouseId: origin.warehouseId, inventoryItemIds: [origin.inventoryItemId] }),
    tx.enterpriseStockAdjustment.count({ where: { ...coordinates, status: "PENDING_APPROVAL" } }),
    tx.enterpriseStockTransfer.count({ where: { organizationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "IN_TRANSIT"] }, OR: [{ sourceWarehouseId: origin.warehouseId }, { destinationWarehouseId: origin.warehouseId }], lines: { some: { inventoryItemId: origin.inventoryItemId } } } }),
    tx.enterpriseInventoryCount.count({ where: { organizationId, warehouseId: origin.warehouseId, status: { in: ["DRAFT", "IN_PROGRESS", "SUBMITTED", "APPROVED"] }, lines: { some: { inventoryItemId: origin.inventoryItemId } } } }),
  ]);
  if (reservations || holds.length || pendingAdjustment || transfer || count) blocked("SUPPLIER_RETURN_OPEN_OPERATIONS");
  const [pharmacy, sector, receipt, receiptLink, lotMovements, balance, physical, config, layers, receiptValue] = await Promise.all([
    tx.pharmacyProductExtension.count({ where: { organizationId, catalogItemId } }),
    tx.enterpriseSectorInventoryEvent.count({ where: { organizationId, catalogItemId } }),
    tx.enterprisePurchaseReceipt.findFirst({ where: { organizationId, id: origin.sourceEntityId }, include: { purchase: true, items: { where: { id: origin.sourceLineId }, include: { purchaseItem: true } } } }),
    tx.enterprisePurchaseReceiptOperationalLink.findFirst({ where: { organizationId, purchaseReceiptId: origin.sourceEntityId, status: "POSTED", warehouseId: origin.warehouseId } }),
    tx.enterpriseStockMovement.groupBy({ by: ["direction", "movementType"], where: { organizationId, stockLotId: origin.stockLotId }, _sum: { quantity: true }, _count: { _all: true } }),
    tx.enterpriseInventoryBalance.findMany({ where: { organizationId, inventoryItemId: origin.inventoryItemId, warehouseId: origin.warehouseId, stockLotId: origin.stockLotId, storageLocationId: origin.storageLocationId }, select: { quantityOnHand: true, quantityReserved: true }, take: 2 }),
    tx.enterpriseInventoryBalance.aggregate({ where: { organizationId, inventoryItemId: origin.inventoryItemId, warehouseId: origin.warehouseId }, _sum: { quantityOnHand: true } }),
    tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId }, select: { automaticPostingEnabled: true, inventoryValuationMethod: true, functionalCurrencyCode: true } }),
    tx.enterpriseInventoryCostLayer.findMany({ where: { organizationId, inventoryItemId: origin.inventoryItemId, warehouseId: origin.warehouseId, remainingQuantity: { gt: 0 } } }),
    tx.enterpriseInventoryAccountingEvent.findFirst({ where: { organizationId, stockMovementId: origin.id, eventType: "RECEIPT", status: "POSTED", journalEntryId: { not: null } } }),
  ]);
  if (pharmacy || sector) blocked("STOCK_RECLASS_SECTOR_AUTHORITY");
  const receiptItem = receipt?.items[0];
  if (!receipt || !receiptItem || !receiptLink || !receipt.purchase.supplierId || receipt.purchase.archivedAt ||
    receipt.purchase.status === "CANCELLED" || receipt.purchase.status === "REJECTED" || origin.quantity.gt(receiptItem.quantityReceived)) blocked("SUPPLIER_RETURN_ORIGIN_INVALID");
  // The whole local lot must have one incoming receipt. Transferred, mixed and
  // re-entered batches need an explicit provenance allocation workflow.
  const incoming = lotMovements.filter((row) => row.direction === "IN");
  const outgoing = lotMovements.filter((row) => row.direction === "OUT");
  if (incoming.length !== 1 || incoming[0].movementType !== "PURCHASE_RECEIPT" || incoming[0]._count._all !== 1 ||
    !new Prisma.Decimal(incoming[0]._sum.quantity || 0).equals(origin.quantity) ||
    outgoing.some((row) => row.movementType !== "SUPPLIER_RETURN_OUT")) blocked("SUPPLIER_RETURN_PROVENANCE_AMBIGUOUS");
  const alreadyReturned = sumDecimals(outgoing.map((row) => row._sum.quantity || 0));
  const remaining = origin.quantity.minus(alreadyReturned);
  if (balance.length !== 1 || !balance[0].quantityOnHand.equals(remaining) || qty.gt(remaining) ||
    !balance[0].quantityReserved.isZero() || qty.gt(balance[0].quantityOnHand.minus(balance[0].quantityReserved))) blocked("SUPPLIER_RETURN_QUANTITY_INVALID");
  if (!config?.automaticPostingEnabled || config.inventoryValuationMethod !== "WEIGHTED_AVERAGE" || !receiptValue ||
    !receiptValue.quantity.equals(origin.quantity) || receiptValue.currencyCode !== config.functionalCurrencyCode ||
    receiptValue.currencyCode !== receipt.purchase.currency || !receiptValue.unitCost.gt(0) ||
    !receiptValue.totalCost.equals(money(origin.quantity.times(receiptValue.unitCost)))) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  const originLayer = layers.find((layer) => layer.sourceMovementId === origin.id);
  const supplement = originLayer ? await tx.enterpriseInventoryAcquisitionCostSupplement.findFirst({
    where: { organizationId, costLayerId: originLayer.id },
  }) : null;
  const unitCost = supplement?.unitCost || receiptValue.unitCost;
  if (supplement) {
    // Sequential capitalized returns may consume only the original receipt
    // and previously coordinated returns. Mixed pools, issues and transfers
    // still require a separate provenance and cost reconciliation.
    const [poolMovements,poolLayers] = await Promise.all([
      tx.enterpriseStockMovement.count({ where: coordinates }),
      tx.enterpriseInventoryCostLayer.count({ where: coordinates }),
    ]);
    const priorMovementCount=outgoing.reduce((sum,row)=>sum+row._count._all,0);
    if (poolMovements !== 1+priorMovementCount || poolLayers !== 1 ||
        !originLayer?.remainingQuantity.equals(remaining) ||
        !supplement.originalUnitCost.equals(receiptValue.unitCost) ||
        !supplement.originalTotalCost.equals(receiptValue.totalCost)) blocked("SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED");
  }
  if (!originLayer || !originLayer.quantity.equals(origin.quantity) || originLayer.remainingQuantity.lt(qty) ||
    !originLayer.totalCost.equals(supplement?.totalCost || receiptValue.totalCost) || !layers.length ||
    layers.some((layer) => layer.currencyCode !== receiptValue.currencyCode || !layer.unitCost.equals(unitCost) || layer.valuationMethod !== "WEIGHTED_AVERAGE") ||
    !sumDecimals(layers.map((layer) => layer.remainingQuantity)).equals(physical._sum.quantityOnHand || 0)) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  const [journal, invoices, itemLink] = await Promise.all([
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, id: receiptValue.journalEntryId!, status: "POSTED", postingEvent: "INVENTORY_RECEIPT_VALUED", sourceEntityType: "EnterpriseInventoryAccountingEvent", sourceEntityId: receiptValue.id }, include: { lines: true } }),
    tx.enterpriseSupplierInvoice.findMany({ where: { organizationId, purchaseReceiptId: receipt.id, purchaseId: receipt.purchaseId, supplierId: receipt.purchase.supplierId,
      archivedAt: null, status: { notIn: ["CANCELLED", "REJECTED"] } }, include: { items: true, threeWayMatch: true }, take: 2 }),
    tx.enterprisePurchaseItemCatalogLink.findFirst({ where: { organizationId, purchaseItemId: receiptItem.purchaseItemId, catalogItemId, expectedItemType: "GOODS" } }),
  ]);
  if (!journal || !itemLink) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  if (invoices.length !== 1) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED");
  const invoice = invoices[0];
  const invoiceItems = invoice.items.filter((line) => line.catalogItemId === catalogItemId);
  if (!["POSTED", "PARTIALLY_PAID", "PAID"].includes(invoice.status) || !invoice.postedAt || invoice.currencyCode !== receiptValue.currencyCode ||
    invoice.threeWayMatch?.status !== "MATCHED" ||
    invoice.items.length !== 1 || invoiceItems.length !== 1 || !invoiceItems[0].quantity.equals(receiptItem.quantityReceived) ||
    !invoiceItems[0].unitPrice.equals(receiptValue.unitCost) || !receiptItem.purchaseItem.unitPrice.equals(receiptValue.unitCost) ||
    !invoiceItems[0].netAmount.equals(money(receiptItem.quantityReceived.times(receiptValue.unitCost)))) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED");
  const [invoiceJournal, credits] = await Promise.all([
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id, postingEvent: "SUPPLIER_INVOICE_POSTED", status: "POSTED" }, include: { lines: true } }),
    tx.enterpriseSupplierCreditNote.count({ where: { organizationId, supplierInvoiceId: invoice.id, status: { notIn: ["CANCELLED", "REJECTED"] } } }),
  ]);
  if (!invoiceJournal || !invoice.subtotal.equals(invoiceItems[0].netAmount) || !invoice.taxTotal.equals(invoiceItems[0].taxAmount) || !invoice.taxTotal.equals(receiptItem.purchaseItem.taxAmount) || !invoice.grandTotal.equals(invoice.subtotal.plus(invoice.taxTotal))) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED");
  let prior: Awaited<ReturnType<typeof readPriorReconciledSupplierReturnCreditsTx>> = [];
  try {
    if(credits || invoice.amountCredited.gt(0) || !alreadyReturned.isZero()){
      prior=await readPriorReconciledSupplierReturnCreditsTx(tx,organizationId,{
        supplierInvoiceId:invoice.id,sourceMovementId:origin.id,originCostLayerId:originLayer.id,
        receiptAccountingEventId:receiptValue.id,original:invoiceItems[0],currencyCode:invoice.currencyCode,
      });
      if(prior.length!==credits || !sumDecimals(prior.map(line=>line.quantity)).equals(alreadyReturned) ||
          !sumDecimals(prior.map(line=>line.totalAmount)).equals(invoice.amountCredited)) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED");
    }
  } catch(error) { if(error instanceof EnterpriseAccountingError) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED"); throw error; }
  // Nonrecoverable VAT is part of stock acquisition cost. The invoice
  // journal can already debit INVENTORY without a matching cost supplement
  // on the receipt layer. Never infer that the tax is in CUMP from a journal.
  // A historical reconciliation and capitalized-cost proof are required first.
  const nonrecoverable = invoice.taxTotal.gt(0) && !invoiceItems[0].taxRecoveryRequested;
  if (nonrecoverable !== Boolean(supplement)) blocked("SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED");
  if (invoice.taxTotal.lt(0) || (invoice.taxTotal.gt(0) && !nonrecoverable && (!invoice.taxRecoveryVerifiedAt || !invoice.taxRecoveryVerifiedByUserId))) blocked("SUPPLIER_RETURN_TAX_PROOF_REQUIRED");
  // The return must reverse the very same stock and clearing accounts, not a
  // newly remapped account or a sales/expense journal. VAT must be recorded
  // in the historical INPUT register and recoverable tax account.
  let recoverableTaxAmount = new Prisma.Decimal(0);
  let nonrecoverableTaxAmount = new Prisma.Decimal(0);
  try {
    const date = new Date();
    if (supplement) {
      nonrecoverableTaxAmount = (await deriveCapitalizedSupplierReturnTx(tx, organizationId, invoiceItems[0], supplement, {
        originCostLayerId: originLayer.id, receiptAccountingEventId: receiptValue.id, invoiceJournalEntryId: invoiceJournal.id,
        currencyCode: invoice.currencyCode, quantity: qty,
      }, date, prior)).tax.amount;
    } else if (invoice.taxTotal.gt(0)) {
      try { recoverableTaxAmount = (await deriveSupplierReturnTaxTx(tx, organizationId, invoiceItems[0], invoice.currencyCode, qty, date, prior)).amount; }
      catch (error) { if (error instanceof EnterpriseAccountingError) blocked("SUPPLIER_RETURN_TAX_PROOF_REQUIRED"); throw error; }
    }
    const [stockAccount, clearingAccount, payableAccount] = await Promise.all([
      resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "INVENTORY", accountingDate: date }),
      resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "GOODS_RECEIVED_CLEARING", accountingDate: date }),
      resolveSemanticPostingAccount(tx, { organizationId, mappingKey: "ACCOUNTS_PAYABLE", accountingDate: date }),
    ]);
    const balanced = (lines: typeof journal.lines, debitId: string, creditId: string, amount: Prisma.Decimal) =>
      lines.length === 2 && lines.some((line) => line.ledgerAccountId === debitId && line.debit.equals(amount) && line.credit.isZero()) &&
      lines.some((line) => line.ledgerAccountId === creditId && line.credit.equals(amount) && line.debit.isZero());
    if (!balanced(journal.lines, stockAccount.id, clearingAccount.id, receiptValue.totalCost) ||
        journal.functionalCurrencyCode !== invoice.currencyCode || invoiceJournal.functionalCurrencyCode !== invoice.currencyCode) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
    if (invoice.taxTotal.isZero()) {
      if (!balanced(invoiceJournal.lines, clearingAccount.id, payableAccount.id, invoice.subtotal)) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
    } else {
      const taxAccount=supplement ? stockAccount : await resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"TAX_RECEIVABLE",accountingDate:date});
      if(new Set([stockAccount.id,clearingAccount.id,payableAccount.id,taxAccount.id]).size!==(supplement ? 3 : 4) ||
        invoiceJournal.lines.length!==3 ||
        !invoiceJournal.lines.some(l=>l.ledgerAccountId===clearingAccount.id&&l.debit.equals(invoice.subtotal)&&l.credit.isZero()) ||
        !invoiceJournal.lines.some(l=>l.ledgerAccountId===taxAccount.id&&l.debit.equals(invoice.taxTotal)&&l.credit.isZero()) ||
        !invoiceJournal.lines.some(l=>l.ledgerAccountId===payableAccount.id&&l.credit.equals(invoice.grandTotal)&&l.debit.isZero())) blocked("SUPPLIER_RETURN_TAX_PROOF_REQUIRED");
    }
  } catch (error) {
    if (error instanceof EnterpriseAccountingError) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
    throw error;
  }
  const totalCost = money(qty.times(unitCost));
  // The prospective credit and physical valuation must still agree after
  // cumulative residual tax/net rounding. Never dispatch a residual that
  // cannot be settled by the current exact-cost posting contract.
  try {
    const [next]=allocateHistoricalCreditLines([invoiceItems[0]],prior,[{sourceInvoiceItemId:invoiceItems[0].id,description:invoiceItems[0].description,quantity:qty.toFixed(),unitPrice:receiptValue.unitCost.toFixed()}],new Date());
    if(!next.netAmount.equals(money(qty.times(receiptValue.unitCost))) || !next.taxAmount.equals(supplement?nonrecoverableTaxAmount:recoverableTaxAmount) || !next.totalAmount.equals(totalCost.plus(recoverableTaxAmount))) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  } catch(error) { if(error instanceof EnterpriseAccountingError) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED"); throw error; }
  if (!totalCost.gt(0) || totalCost.plus(recoverableTaxAmount).gt("99999999999999.999999")) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  return { origin, receipt, receiptItem, invoice, invoiceItem: invoiceItems[0], originLayer, receiptValue,
    remaining, currencyCode: receiptValue.currencyCode, unitCost, creditUnitPrice: receiptValue.unitCost, totalCost, recoverableTaxAmount, nonrecoverableTaxAmount, creditTotal: money(totalCost.plus(recoverableTaxAmount)) };
}

/** No stock-only or global DTSC role may authorize a financial return. */
export async function assertSupplierReturnAccess(organizationId: string, userId: string, approve: boolean) {
  const checks = await Promise.all([
    resolveEnterpriseModuleAccess({ organizationId, userId, moduleCode: "SUPPLIERS_PURCHASES", action: approve ? "approve" : "write" }),
    resolveEnterpriseModuleAccess({ organizationId, userId, moduleCode: "INVENTORY_LOGISTICS", action: approve ? "manage" : "write" }),
    resolveEnterpriseModuleAccess({ organizationId, userId, moduleCode: "FINANCE_INVENTORY", action: approve ? "manage" : "read" }),
    resolveEnterpriseModuleAccess({ organizationId, userId, moduleCode: "FINANCE_PAYABLES", action: "read" }),
  ]);
  if (checks.some((check) => !check.allowed)) throw new EnterpriseDomainError("SUPPLIER_RETURN_PERMISSION_DENIED", 403);
}
