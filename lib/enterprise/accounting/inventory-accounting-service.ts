import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { idempotencyKey, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

function movementLabel(movement: { id: string; sourceEntityType: string | null; sourceEntityId: string | null }) {
  return movement.sourceEntityType && movement.sourceEntityId
    ? `${movement.sourceEntityType}:${movement.sourceEntityId}`
    : movement.id;
}

export async function valueInventoryReceipt(
  organizationId: string,
  stockMovementId: string,
  actorUserId: string,
  input: { unitCost: string; currencyCode: string },
) {
  const event = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseStockMovement" WHERE id = ${stockMovementId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const movement = await tx.enterpriseStockMovement.findFirst({
      where: { id: stockMovementId, organizationId, direction: "IN", quantity: { gt: 0 } },
    });
    if (!movement) throw new EnterpriseAccountingError("INVENTORY_RECEIPT_MOVEMENT_INVALID", 409);

    const configuration = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
    if (!configuration) throw new EnterpriseAccountingError("FINANCE_CONFIGURATION_REQUIRED", 409);
    if (configuration.inventoryValuationMethod !== "WEIGHTED_AVERAGE") {
      throw new EnterpriseAccountingError("INVENTORY_VALUATION_METHOD_UNSUPPORTED", 409);
    }

    const unitCost = new Prisma.Decimal(input.unitCost);
    if (!unitCost.isPositive()) throw new EnterpriseAccountingError("INVENTORY_UNIT_COST_INVALID", 400);
    const totalCost = money(movement.quantity.times(unitCost));
    const stableKey = idempotencyKey({
      organizationId,
      sourceEntityType: "EnterpriseStockMovement",
      sourceEntityId: movement.id,
      postingEvent: "INVENTORY_RECEIPT_VALUED",
      postingVersion: 1,
    });
    const existing = await tx.enterpriseInventoryAccountingEvent.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: stableKey } },
    });
    if (existing) return existing;

    await tx.enterpriseInventoryCostLayer.create({
      data: {
        organizationId,
        inventoryItemId: movement.inventoryItemId,
        warehouseId: movement.warehouseId,
        sourceMovementId: movement.id,
        valuationMethod: "WEIGHTED_AVERAGE",
        quantity: movement.quantity,
        remainingQuantity: movement.quantity,
        unitCost,
        totalCost,
        currencyCode: input.currencyCode,
        effectiveAt: movement.occurredAt,
      },
    });
    const created = await tx.enterpriseInventoryAccountingEvent.create({
      data: {
        organizationId,
        inventoryItemId: movement.inventoryItemId,
        stockMovementId: movement.id,
        eventType: "RECEIPT",
        quantity: movement.quantity,
        unitCost,
        totalCost,
        currencyCode: input.currencyCode,
        idempotencyKey: stableKey,
        status: "APPROVED",
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseInventoryAccountingEvent",
      entityId: created.id,
      eventType: "INVENTORY_RECEIPT_VALUED",
      summary: `Inventory receipt ${movementLabel(movement)} valued`,
      actorUserId,
      toStatus: "APPROVED",
      metadataJson: {
        stockMovementId: movement.id,
        quantity: movement.quantity.toFixed(),
        unitCost: unitCost.toFixed(),
        totalCost: totalCost.toFixed(),
        currency: input.currencyCode,
      },
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

  const posting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "INVENTORY_RECEIPT_VALUED",
    sourceEntityType: "EnterpriseInventoryAccountingEvent",
    sourceEntityId: event.id,
  });
  await prisma.enterpriseInventoryAccountingEvent.update({
    where: { id: event.id },
    data: { status: "POSTED", journalEntryId: posting.entry.id },
  });
  return { event, posting };
}

export async function valueInventoryIssue(
  organizationId: string,
  stockMovementId: string,
  actorUserId: string,
  input: { currencyCode: string },
) {
  const event = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseStockMovement" WHERE id = ${stockMovementId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const movement = await tx.enterpriseStockMovement.findFirst({
      where: { id: stockMovementId, organizationId, direction: "OUT", quantity: { gt: 0 } },
    });
    if (!movement) throw new EnterpriseAccountingError("INVENTORY_ISSUE_MOVEMENT_INVALID", 409);

    const configuration = await tx.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
    if (!configuration || configuration.inventoryValuationMethod !== "WEIGHTED_AVERAGE") {
      throw new EnterpriseAccountingError("INVENTORY_WEIGHTED_AVERAGE_REQUIRED", 409);
    }

    const stableKey = idempotencyKey({
      organizationId,
      sourceEntityType: "EnterpriseStockMovement",
      sourceEntityId: movement.id,
      postingEvent: "INVENTORY_ISSUE_VALUED",
      postingVersion: 1,
    });
    const existing = await tx.enterpriseInventoryAccountingEvent.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: stableKey } },
    });
    if (existing) return existing;

    const layers = await tx.enterpriseInventoryCostLayer.findMany({
      where: {
        organizationId,
        inventoryItemId: movement.inventoryItemId,
        warehouseId: movement.warehouseId,
        currencyCode: input.currencyCode,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { effectiveAt: "asc" },
    });
    const availableQuantity = sumDecimals(layers.map((layer) => layer.remainingQuantity));
    const issueQuantity = movement.quantity;
    if (issueQuantity.greaterThan(availableQuantity)) {
      throw new EnterpriseAccountingError("INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN", 409, {
        available: availableQuantity.toFixed(),
        requested: issueQuantity.toFixed(),
      });
    }
    if (!availableQuantity.isPositive()) throw new EnterpriseAccountingError("INVENTORY_COST_LAYER_REQUIRED", 409);

    const availableValue = sumDecimals(layers.map((layer) => layer.remainingQuantity.times(layer.unitCost)));
    const weightedUnitCost = money(availableValue.dividedBy(availableQuantity));
    const totalCost = money(issueQuantity.times(weightedUnitCost));
    const remainingRatio = availableQuantity.minus(issueQuantity).dividedBy(availableQuantity);

    for (const layer of layers) {
      const nextQuantity = layer.remainingQuantity.times(remainingRatio).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
      await tx.enterpriseInventoryCostLayer.update({ where: { id: layer.id }, data: { remainingQuantity: nextQuantity } });
    }

    const created = await tx.enterpriseInventoryAccountingEvent.create({
      data: {
        organizationId,
        inventoryItemId: movement.inventoryItemId,
        stockMovementId: movement.id,
        eventType: "ISSUE",
        quantity: issueQuantity,
        unitCost: weightedUnitCost,
        totalCost,
        currencyCode: input.currencyCode,
        idempotencyKey: stableKey,
        status: "APPROVED",
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseInventoryAccountingEvent",
      entityId: created.id,
      eventType: "INVENTORY_ISSUE_VALUED",
      summary: `Inventory issue ${movementLabel(movement)} valued`,
      actorUserId,
      toStatus: "APPROVED",
      metadataJson: {
        stockMovementId: movement.id,
        quantity: issueQuantity.toFixed(),
        unitCost: weightedUnitCost.toFixed(),
        totalCost: totalCost.toFixed(),
        currency: input.currencyCode,
      },
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

  const posting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "INVENTORY_ISSUE_VALUED",
    sourceEntityType: "EnterpriseInventoryAccountingEvent",
    sourceEntityId: event.id,
  });
  await prisma.enterpriseInventoryAccountingEvent.update({
    where: { id: event.id },
    data: { status: "POSTED", journalEntryId: posting.entry.id },
  });
  return { event, posting };
}

export async function getInventoryValuation(organizationId: string, input?: { warehouseId?: string; inventoryItemId?: string }) {
  const layers = await prisma.enterpriseInventoryCostLayer.findMany({
    where: {
      organizationId,
      remainingQuantity: { gt: 0 },
      ...(input?.warehouseId ? { warehouseId: input.warehouseId } : {}),
      ...(input?.inventoryItemId ? { inventoryItemId: input.inventoryItemId } : {}),
    },
    orderBy: [{ inventoryItemId: "asc" }, { warehouseId: "asc" }, { effectiveAt: "asc" }],
  });

  const grouped = new Map<string, {
    inventoryItemId: string;
    warehouseId: string | null;
    currencyCode: string;
    quantity: Prisma.Decimal;
    value: Prisma.Decimal;
  }>();

  for (const layer of layers) {
    const key = `${layer.inventoryItemId}:${layer.warehouseId || ""}:${layer.currencyCode}`;
    const current = grouped.get(key) || {
      inventoryItemId: layer.inventoryItemId,
      warehouseId: layer.warehouseId,
      currencyCode: layer.currencyCode,
      quantity: new Prisma.Decimal(0),
      value: new Prisma.Decimal(0),
    };
    current.quantity = current.quantity.plus(layer.remainingQuantity);
    current.value = current.value.plus(layer.remainingQuantity.times(layer.unitCost));
    grouped.set(key, current);
  }

  return [...grouped.values()].map((row) => ({
    ...row,
    quantity: row.quantity.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
    value: money(row.value),
    weightedAverageUnitCost: row.quantity.isPositive() ? money(row.value.dividedBy(row.quantity)) : new Prisma.Decimal(0),
  }));
}
