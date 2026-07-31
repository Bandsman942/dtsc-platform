import { Prisma } from "@prisma/client";
import { valueInventoryIssue, valueInventoryReceipt } from "@/lib/enterprise/accounting/inventory-accounting-service";
import { money } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { sectorIdempotencyKey } from "@/lib/enterprise/sector-convergence/sync-service";

export type PharmacyInventoryAccountingEventType =
  | "PHARMACY_PURCHASE_RECEIPT_VALUED"
  | "PHARMACY_SALE_STOCK_ISSUE"
  | "PHARMACY_CUSTOMER_RETURN"
  | "PHARMACY_SUPPLIER_RETURN"
  | "PHARMACY_LOSS"
  | "PHARMACY_EXPIRY_WRITE_OFF"
  | "PHARMACY_ADJUSTMENT"
  | "PHARMACY_RECALL_WRITE_OFF";

function eventDirection(eventType: PharmacyInventoryAccountingEventType, sourceDirection: string) {
  if (["PHARMACY_PURCHASE_RECEIPT_VALUED", "PHARMACY_CUSTOMER_RETURN"].includes(eventType)) return "IN" as const;
  if (["PHARMACY_SALE_STOCK_ISSUE", "PHARMACY_SUPPLIER_RETURN", "PHARMACY_LOSS", "PHARMACY_EXPIRY_WRITE_OFF", "PHARMACY_RECALL_WRITE_OFF"].includes(eventType)) return "OUT" as const;
  if (sourceDirection === "IN" || sourceDirection === "OUT") return sourceDirection;
  throw new EnterpriseSectorConvergenceError("PHARMACY_ADJUSTMENT_DIRECTION_INVALID", 409);
}

function commonMovementType(eventType: PharmacyInventoryAccountingEventType) {
  return {
    PHARMACY_PURCHASE_RECEIPT_VALUED: "RECEIPT",
    PHARMACY_SALE_STOCK_ISSUE: "SALE_ISSUE",
    PHARMACY_CUSTOMER_RETURN: "CUSTOMER_RETURN",
    PHARMACY_SUPPLIER_RETURN: "SUPPLIER_RETURN",
    PHARMACY_LOSS: "LOSS",
    PHARMACY_EXPIRY_WRITE_OFF: "EXPIRY",
    PHARMACY_ADJUSTMENT: "ADJUSTMENT",
    PHARMACY_RECALL_WRITE_OFF: "RECALL",
  }[eventType];
}

export async function projectPharmacyInventoryAccountingEvent(
  organizationId: string,
  sourceMovementId: string,
  eventType: PharmacyInventoryAccountingEventType,
  actorUserId: string,
  input: { warehouseId: string; storageLocationId?: string; currencyCode?: string; unitCost?: string; eventVersion?: number },
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "PHARMACY", domainCode: "INVENTORY_ACCOUNTING", flag: SECTOR_CONVERGENCE_FLAGS.PHARMACY_INVENTORY_ACCOUNTING });
    if (!enabled) throw new EnterpriseSectorConvergenceError("PHARMACY_INVENTORY_ACCOUNTING_DISABLED", 409);
  }
  const eventVersion = input.eventVersion || 1;
  const idempotencyKey = sectorIdempotencyKey({ organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyStockMovement", sourceEntityId: sourceMovementId, eventType, eventVersion });
  const existing = await prisma.enterpriseSectorInventoryEvent.findFirst({ where: { organizationId, idempotencyKey } });
  if (existing?.status === "POSTED") return { event: existing, idempotent: true };
  const source = await prisma.pharmacyStockMovement.findFirst({ where: { id: sourceMovementId, organizationId, status: "APPLIED" }, include: { batch: true } });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_STOCK_MOVEMENT_NOT_ACCOUNTABLE", 409);
  const mapping = await prisma.pharmacyProductExtension.findFirst({ where: { organizationId, pharmacyProductId: source.productId } });
  if (!mapping) throw new EnterpriseSectorConvergenceError("PHARMACY_PRODUCT_MAPPING_REQUIRED", 409);
  const inventoryItem = await prisma.enterpriseInventoryItem.findFirst({ where: { organizationId, catalogItemId: mapping.catalogItemId, status: "ACTIVE", archivedAt: null } });
  if (!inventoryItem) throw new EnterpriseSectorConvergenceError("COMMON_INVENTORY_ITEM_REQUIRED", 409);
  const warehouse = await prisma.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null } });
  if (!warehouse) throw new EnterpriseSectorConvergenceError("COMMON_WAREHOUSE_INVALID", 409);
  if (input.storageLocationId) {
    const location = await prisma.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: warehouse.id, status: "ACTIVE", archivedAt: null } });
    if (!location) throw new EnterpriseSectorConvergenceError("COMMON_STORAGE_LOCATION_INVALID", 409);
  }
  const direction = eventDirection(eventType, source.direction);
  const currencyCode = input.currencyCode || source.batch?.currency;
  if (!currencyCode) throw new EnterpriseSectorConvergenceError("PHARMACY_INVENTORY_CURRENCY_REQUIRED", 409);
  const explicitUnitCost = input.unitCost ? money(input.unitCost) : null;
  const sourceUnitCost = source.batch?.purchasePrice ? money(source.batch.purchasePrice) : null;
  const unitCost = explicitUnitCost || sourceUnitCost;
  if (direction === "IN" && (!unitCost || !unitCost.isPositive())) throw new EnterpriseSectorConvergenceError("PHARMACY_INVENTORY_UNIT_COST_REQUIRED", 409);

  const projected = await prisma.$transaction(async (tx) => {
    const current = await tx.enterpriseSectorInventoryEvent.findFirst({ where: { organizationId, idempotencyKey } });
    if (current) {
      const movement = await tx.enterpriseStockMovement.findFirst({ where: { organizationId, idempotencyKey: `${idempotencyKey}:movement` } });
      if (!movement) throw new EnterpriseSectorConvergenceError("SECTOR_INVENTORY_PROJECTION_INCOMPLETE", 409);
      return { event: current, movement };
    }
    const movement = await tx.enterpriseStockMovement.create({
      data: {
        organizationId,
        inventoryItemId: inventoryItem.id,
        warehouseId: warehouse.id,
        storageLocationId: input.storageLocationId || null,
        movementType: commonMovementType(eventType),
        direction,
        quantity: source.quantity,
        occurredAt: source.createdAt,
        sourceEntityType: "PharmacyStockMovement",
        sourceEntityId: source.id,
        sourceLineId: source.batchId,
        idempotencyKey: `${idempotencyKey}:movement`,
        reason: "Non-authoritative Pharmacy accounting projection",
        createdByUserId: actorUserId,
      },
    });
    const event = await tx.enterpriseSectorInventoryEvent.create({
      data: {
        organizationId,
        sector: "PHARMACY",
        sourceMovementId: source.id,
        sourceBatchId: source.batchId,
        sourceProductId: source.productId,
        catalogItemId: mapping.catalogItemId,
        inventoryItemId: inventoryItem.id,
        eventType,
        eventVersion,
        direction,
        quantity: source.quantity,
        unitCost,
        totalValue: unitCost ? money(source.quantity.times(unitCost)) : null,
        currencyCode,
        idempotencyKey,
        status: "APPROVED",
        createdByUserId: actorUserId,
      },
    });
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseSectorInventoryEvent", entityId: event.id, eventType, summary: `Pharmacy accounting projection ${eventType}`, actorUserId, toStatus: "APPROVED", metadataJson: { sourceMovementId: source.id, batchId: source.batchId, quantity: source.quantity.toFixed(), regulatoryQuantityAuthority: "PHARMACY" } } });
    return { event, movement };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  try {
    if (["PHARMACY_PURCHASE_RECEIPT_VALUED", "PHARMACY_CUSTOMER_RETURN"].includes(eventType)) {
      const result = await valueInventoryReceipt(organizationId, projected.movement.id, actorUserId, { unitCost: unitCost!.toFixed(), currencyCode });
      const updated = await prisma.enterpriseSectorInventoryEvent.update({ where: { id: projected.event.id }, data: { status: "POSTED", valuationId: result.event.id, journalEntryId: result.posting.entry.id, completedAt: new Date() } });
      return { event: updated, commonInventoryEvent: result.event, posting: result.posting, idempotent: false };
    }
    if (["PHARMACY_SALE_STOCK_ISSUE", "PHARMACY_SUPPLIER_RETURN"].includes(eventType)) {
      const result = await valueInventoryIssue(organizationId, projected.movement.id, actorUserId, { currencyCode });
      const updated = await prisma.enterpriseSectorInventoryEvent.update({ where: { id: projected.event.id }, data: { status: "POSTED", valuationId: result.event.id, journalEntryId: result.posting.entry.id, unitCost: result.event.unitCost, totalValue: result.event.totalCost, completedAt: new Date() } });
      return { event: updated, commonInventoryEvent: result.event, posting: result.posting, idempotent: false };
    }
    const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: eventType, sourceEntityType: "EnterpriseSectorInventoryEvent", sourceEntityId: projected.event.id });
    const updated = await prisma.enterpriseSectorInventoryEvent.update({ where: { id: projected.event.id }, data: { status: "POSTED", journalEntryId: posting.entry.id, completedAt: new Date() } });
    return { event: updated, posting, idempotent: false };
  } catch (error) {
    await prisma.enterpriseSectorInventoryEvent.update({ where: { id: projected.event.id }, data: { status: "FAILED", errorCode: "PHARMACY_INVENTORY_ACCOUNTING_FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error" } });
    throw error;
  }
}
