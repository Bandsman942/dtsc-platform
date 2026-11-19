import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";

const fail = () => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED", 409); };

/**
 * Read-only preflight for a proposed acquisition-cost supplement, not permission
 * to mutate or post. An untouched physical lot alone cannot prove its CUMP layer
 * was not consumed by a different lot. The initial supported pool has exactly
 * one movement and one layer across its entire history, including zero layers
 * and other currencies. Future broader admission needs explicit proof.
 * Re-run in the same Serializable transaction as any eventual posting and
 * supplement write. The caller must still prove the matched purchase/invoice,
 * tax record, receipt and invoice journals, period and effective date.
 */
export async function inspectUnconsumedAcquisitionPoolTx(
  tx: Prisma.TransactionClient, organizationId: string,
  sourceMovementId: string, currencyCode: string,
) {
  const origin = await tx.enterpriseStockMovement.findFirst({
    where: { organizationId, id: sourceMovementId, direction: "IN", movementType: "PURCHASE_RECEIPT",
      sourceEntityType: "EnterprisePurchaseReceipt", quantity: { gt: 0 } },
  });
  if (!origin || !origin.sourceEntityId || !origin.sourceLineId || !origin.quantity.gt(0)) return fail();
  const scope = { organizationId, inventoryItemId: origin.inventoryItemId, warehouseId: origin.warehouseId };
  const [movements, layers, balances, receiptEvent, config, reservations, holds, adjustments, transfers, counts] = await Promise.all([
    tx.enterpriseStockMovement.findMany({ where: scope, select: { id: true }, take: 2 }),
    tx.enterpriseInventoryCostLayer.findMany({ where: scope, take: 2 }),
    tx.enterpriseInventoryBalance.findMany({ where: scope, take: 2 }),
    tx.enterpriseInventoryAccountingEvent.findFirst({ where: { organizationId, inventoryItemId: origin.inventoryItemId,
      stockMovementId: origin.id, eventType: "RECEIPT", status: "POSTED", journalEntryId: { not: null } } }),
    tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId },
      select: { automaticPostingEnabled: true, inventoryValuationMethod: true, functionalCurrencyCode: true } }),
    tx.enterpriseInventoryReservation.count({ where: { ...scope, status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    readActiveRetailInvoiceStockHoldsTx(tx, { organizationId, warehouseId: origin.warehouseId, inventoryItemIds: [origin.inventoryItemId] }),
    tx.enterpriseStockAdjustment.count({ where: { ...scope, status: "PENDING_APPROVAL" } }),
    tx.enterpriseStockTransfer.count({ where: { organizationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "IN_TRANSIT"] },
      OR: [{ sourceWarehouseId: origin.warehouseId }, { destinationWarehouseId: origin.warehouseId }],
      lines: { some: { inventoryItemId: origin.inventoryItemId } } } }),
    tx.enterpriseInventoryCount.count({ where: { organizationId, warehouseId: origin.warehouseId,
      status: { in: ["DRAFT", "IN_PROGRESS", "SUBMITTED", "APPROVED"] }, lines: { some: { inventoryItemId: origin.inventoryItemId } } } }),
  ]);
  if (movements.length !== 1 || movements[0].id !== origin.id || layers.length !== 1 || balances.length !== 1 ||
      !receiptEvent?.journalEntryId || !config?.automaticPostingEnabled || config.inventoryValuationMethod !== "WEIGHTED_AVERAGE" ||
      config.functionalCurrencyCode !== currencyCode || reservations || holds.length || adjustments || transfers || counts) return fail();
  const layer = layers[0];
  const balance = balances[0];
  if (layer.sourceMovementId !== origin.id || layer.currencyCode !== currencyCode || layer.valuationMethod !== "WEIGHTED_AVERAGE" ||
      layer.effectiveAt.getTime() !== origin.occurredAt.getTime() || !layer.quantity.equals(origin.quantity) ||
      !layer.remainingQuantity.equals(origin.quantity) || !layer.unitCost.gt(0) ||
      !layer.quantity.times(layer.unitCost).equals(layer.totalCost) ||
      balance.stockLotId !== origin.stockLotId || balance.storageLocationId !== origin.storageLocationId ||
      !balance.quantityOnHand.equals(origin.quantity) || !balance.quantityReserved.isZero() ||
      receiptEvent.currencyCode !== currencyCode || !receiptEvent.quantity.equals(origin.quantity) ||
      !receiptEvent.unitCost.equals(layer.unitCost) || !receiptEvent.totalCost.equals(layer.totalCost)) return fail();
  const existing = await tx.enterpriseInventoryAcquisitionCostSupplement.findFirst({
    where: { organizationId, OR: [{ costLayerId: layer.id }, { receiptAccountingEventId: receiptEvent.id }] }, select: { id: true },
  });
  if (existing) return fail(); // only the future posting authority may establish an exact replay.
  return { origin, layer, receiptEvent };
}
