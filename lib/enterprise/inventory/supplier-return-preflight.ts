import { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { requireInventoryStockAuthorityTx } from "@/lib/enterprise/inventory/service";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { money, sumDecimals } from "@/lib/enterprise/accounting/helpers";

export type SupplierReturnCoordinates = {
  inventoryItemId: string; warehouseId: string; storageLocationId?: string | null; stockLotId?: string | null;
  quantity: Prisma.Decimal.Value; supplierReturnSourceMovementId: string;
};

function blocked(code: string): never { throw new EnterpriseDomainError(code, 409); }

/** The first supported return is deliberately narrow: an identified, isolated
 * lot from a unique original receipt in its original warehouse, with a
 * posted matching supplier invoice and equal current/original unit costs.
 * Never guess allocation across suppliers, currencies, tax or transferred stock.
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
    receipt.purchase.status === "CANCELLED" || receipt.purchase.status === "REJECTED" || receiptItem.purchaseItem.taxAmount.gt(0)) blocked("SUPPLIER_RETURN_ORIGIN_INVALID");
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
    qty.gt(balance[0].quantityOnHand.minus(balance[0].quantityReserved))) blocked("SUPPLIER_RETURN_QUANTITY_INVALID");
  if (!config?.automaticPostingEnabled || config.inventoryValuationMethod !== "WEIGHTED_AVERAGE" || !receiptValue ||
    !receiptValue.quantity.equals(origin.quantity) || receiptValue.currencyCode !== config.functionalCurrencyCode ||
    receiptValue.currencyCode !== receipt.purchase.currency || !receiptValue.unitCost.gt(0) ||
    !receiptValue.totalCost.equals(money(origin.quantity.times(receiptValue.unitCost)))) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  const originLayer = layers.find((layer) => layer.sourceMovementId === origin.id);
  if (!originLayer || !originLayer.quantity.equals(origin.quantity) || originLayer.remainingQuantity.lt(qty) ||
    !originLayer.totalCost.equals(receiptValue.totalCost) || !layers.length ||
    layers.some((layer) => layer.currencyCode !== receiptValue.currencyCode || !layer.unitCost.equals(receiptValue.unitCost) || layer.valuationMethod !== "WEIGHTED_AVERAGE") ||
    !sumDecimals(layers.map((layer) => layer.remainingQuantity)).equals(physical._sum.quantityOnHand || 0)) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  const [journal, invoices, itemLink] = await Promise.all([
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, id: receiptValue.journalEntryId!, status: "POSTED", postingEvent: "INVENTORY_RECEIPT_VALUED", sourceEntityType: "EnterpriseInventoryAccountingEvent", sourceEntityId: receiptValue.id } }),
    tx.enterpriseSupplierInvoice.findMany({ where: { organizationId, purchaseReceiptId: receipt.id, purchaseId: receipt.purchaseId, supplierId: receipt.purchase.supplierId,
      archivedAt: null, status: { notIn: ["CANCELLED", "REJECTED"] } }, include: { items: true, threeWayMatch: true }, take: 2 }),
    tx.enterprisePurchaseItemCatalogLink.findFirst({ where: { organizationId, purchaseItemId: receiptItem.purchaseItemId, catalogItemId, expectedItemType: "GOODS" } }),
  ]);
  if (!journal || !itemLink) blocked("SUPPLIER_RETURN_VALUATION_REQUIRED");
  if (invoices.length !== 1) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED");
  const invoice = invoices[0];
  const invoiceItems = invoice.items.filter((line) => line.catalogItemId === catalogItemId);
  if (!["POSTED", "PARTIALLY_PAID", "PAID"].includes(invoice.status) || !invoice.postedAt || invoice.currencyCode !== receiptValue.currencyCode ||
    invoice.taxTotal.gt(0) || invoice.threeWayMatch?.status !== "MATCHED" || invoice.amountCredited.gt(0) ||
    invoiceItems.length !== 1 || !invoiceItems[0].quantity.equals(receiptItem.quantityReceived) ||
    !invoiceItems[0].unitPrice.equals(receiptValue.unitCost) || !receiptItem.purchaseItem.unitPrice.equals(receiptValue.unitCost) ||
    !invoiceItems[0].netAmount.equals(money(receiptItem.quantityReceived.times(receiptValue.unitCost))) || invoiceItems[0].taxAmount.gt(0)) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED");
  const [invoiceJournal, credits] = await Promise.all([
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id, postingEvent: "SUPPLIER_INVOICE_POSTED", status: "POSTED" } }),
    tx.enterpriseSupplierCreditNote.count({ where: { organizationId, supplierInvoiceId: invoice.id, status: { notIn: ["CANCELLED", "REJECTED"] } } }),
  ]);
  if (!invoiceJournal || credits) blocked("SUPPLIER_RETURN_INVOICE_REQUIRED");
  return { origin, receipt, receiptItem, invoice, invoiceItem: invoiceItems[0], originLayer, receiptValue,
    remaining, currencyCode: receiptValue.currencyCode, unitCost: receiptValue.unitCost, totalCost: money(qty.times(receiptValue.unitCost)) };
}

/** No stock-only or global DTSC role may authorize a financial return. */
export async function assertSupplierReturnAccess(organizationId: string, userId: string, approve: boolean) {
  const checks = await Promise.all([
    resolveEnterpriseModuleAccess({ organizationId, userId, moduleCode: "SUPPLIERS_PURCHASES", action: approve ? "approve" : "write" }),
    resolveEnterpriseModuleAccess({ organizationId, userId, moduleCode: "FINANCE_INVENTORY", action: approve ? "manage" : "read" }),
    resolveEnterpriseModuleAccess({ organizationId, userId, moduleCode: "FINANCE_PAYABLES", action: "read" }),
  ]);
  if (checks.some((check) => !check.allowed)) throw new EnterpriseDomainError("SUPPLIER_RETURN_PERMISSION_DENIED", 403);
}
