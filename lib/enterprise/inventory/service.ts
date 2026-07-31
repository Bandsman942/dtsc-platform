import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import type {
  inventoryCountCreateSchema,
  inventoryCountDecisionSchema,
  stockMovementCreateSchema,
  stockTransferCreateSchema,
  stockTransferDecisionSchema,
} from "@/lib/enterprise/inventory/schemas";
import { prisma } from "@/lib/prisma";

type StockMovementInput = z.infer<typeof stockMovementCreateSchema>;
type StockTransferCreateInput = z.infer<typeof stockTransferCreateSchema>;
type StockTransferDecisionInput = z.infer<typeof stockTransferDecisionSchema>;
type InventoryCountCreateInput = z.infer<typeof inventoryCountCreateSchema>;
type InventoryCountDecisionInput = z.infer<typeof inventoryCountDecisionSchema>;

function inventoryReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function assertInventoryCoordinates(tx: Prisma.TransactionClient, organizationId: string, input: Pick<StockMovementInput, "inventoryItemId" | "warehouseId" | "storageLocationId" | "stockLotId">) {
  const [inventoryItem, warehouse, storageLocation, stockLot] = await Promise.all([
    tx.enterpriseInventoryItem.findFirst({
      where: { id: input.inventoryItemId, organizationId, status: "ACTIVE", archivedAt: null },
      include: { catalogItem: { select: { id: true, code: true, name: true, trackInventory: true } } },
    }),
    tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
    input.storageLocationId
      ? tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: input.warehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true } })
      : Promise.resolve(null),
    input.stockLotId
      ? tx.enterpriseStockLot.findFirst({ where: { id: input.stockLotId, organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, status: "AVAILABLE", archivedAt: null }, select: { id: true, storageLocationId: true } })
      : Promise.resolve(null),
  ]);
  if (!inventoryItem || !inventoryItem.catalogItem.trackInventory) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);
  if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
  if (input.storageLocationId && !storageLocation) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);
  if (input.stockLotId && !stockLot) throw new EnterpriseDomainError("STOCK_LOT_NOT_FOUND", 404);
  if (stockLot?.storageLocationId && input.storageLocationId && stockLot.storageLocationId !== input.storageLocationId) {
    throw new EnterpriseDomainError("STOCK_LOT_LOCATION_MISMATCH", 409);
  }
  return inventoryItem;
}

export async function applyStockMovementTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, input: StockMovementInput) {
  const existing = await tx.enterpriseStockMovement.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
  if (existing) return { movement: existing, idempotent: true };
  await assertInventoryCoordinates(tx, organizationId, input);

  const balance = await tx.enterpriseInventoryBalance.findFirst({
    where: {
      organizationId,
      inventoryItemId: input.inventoryItemId,
      warehouseId: input.warehouseId,
      storageLocationId: input.storageLocationId || null,
      stockLotId: input.stockLotId || null,
    },
  });
  const currentQuantity = Number(balance?.quantityOnHand || 0);
  const delta = input.direction === "IN" ? input.quantity : -input.quantity;
  const nextQuantity = currentQuantity + delta;
  if (nextQuantity < -0.000001) throw new EnterpriseDomainError("NEGATIVE_STOCK_FORBIDDEN", 409);

  const movement = await tx.enterpriseStockMovement.create({
    data: {
      organizationId,
      inventoryItemId: input.inventoryItemId,
      warehouseId: input.warehouseId,
      storageLocationId: input.storageLocationId || null,
      stockLotId: input.stockLotId || null,
      movementType: input.movementType,
      direction: input.direction,
      quantity: input.quantity,
      balanceAfter: nextQuantity,
      sourceEntityType: input.sourceEntityType || null,
      sourceEntityId: input.sourceEntityId || null,
      sourceLineId: input.sourceLineId || null,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason || null,
      createdByUserId: actorUserId,
    },
  });

  if (balance) {
    const updated = await tx.enterpriseInventoryBalance.updateMany({
      where: { id: balance.id, organizationId, revision: balance.revision },
      data: { quantityOnHand: nextQuantity, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError("INVENTORY_BALANCE_CONFLICT");
  } else {
    await tx.enterpriseInventoryBalance.create({
      data: {
        organizationId,
        inventoryItemId: input.inventoryItemId,
        warehouseId: input.warehouseId,
        storageLocationId: input.storageLocationId || null,
        stockLotId: input.stockLotId || null,
        quantityOnHand: nextQuantity,
      },
    });
  }

  await publishEnterpriseEvent(tx, {
    organizationId,
    entityType: "EnterpriseInventoryItem",
    entityId: input.inventoryItemId,
    eventType: `STOCK_${input.movementType}`,
    summary: `Mouvement ${input.movementType} de ${input.quantity}`,
    actorUserId,
    metadataJson: { movementId: movement.id, warehouseId: input.warehouseId, balanceAfter: nextQuantity },
  });
  return { movement, idempotent: false };
}

export async function applyEnterpriseStockMovement(organizationId: string, actorUserId: string, input: StockMovementInput) {
  return prisma.$transaction(
    (tx) => applyStockMovementTx(tx, organizationId, actorUserId, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createEnterpriseStockTransfer(organizationId: string, actorUserId: string, input: StockTransferCreateInput) {
  if (input.sourceWarehouseId === input.destinationWarehouseId) throw new EnterpriseDomainError("TRANSFER_WAREHOUSES_MUST_DIFFER");
  if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
  return prisma.$transaction(async (tx) => {
    const [source, destination, approver] = await Promise.all([
      tx.enterpriseWarehouse.findFirst({ where: { id: input.sourceWarehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      tx.enterpriseWarehouse.findFirst({ where: { id: input.destinationWarehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      tx.organizationMember.findFirst({ where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }),
    ]);
    if (!source || !destination) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
    if (!approver) throw new EnterpriseDomainError("APPROVER_NOT_MEMBER", 404);
    for (const line of input.lines) {
      await assertInventoryCoordinates(tx, organizationId, {
        inventoryItemId: line.inventoryItemId,
        warehouseId: input.sourceWarehouseId,
        storageLocationId: line.sourceLocationId,
        stockLotId: line.stockLotId,
      });
      if (line.destinationLocationId) {
        const destinationLocation = await tx.enterpriseStorageLocation.findFirst({
          where: { id: line.destinationLocationId, organizationId, warehouseId: input.destinationWarehouseId, status: "ACTIVE", archivedAt: null },
          select: { id: true },
        });
        if (!destinationLocation) throw new EnterpriseDomainError("DESTINATION_LOCATION_NOT_FOUND", 404);
      }
    }
    const transfer = await tx.enterpriseStockTransfer.create({
      data: {
        organizationId,
        reference: inventoryReference("TRF"),
        sourceWarehouseId: input.sourceWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId,
        status: "PENDING_APPROVAL",
        requestedByUserId: actorUserId,
        approvedByUserId: input.approverUserId,
        notes: input.notes || null,
        lines: { create: input.lines.map((line) => ({ organizationId, ...line })) },
      },
      include: { lines: true },
    });
    await tx.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterpriseStockTransfer",
        targetEntityId: transfer.id,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
      },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseStockTransfer",
      entityId: transfer.id,
      eventType: "STOCK_TRANSFER_SUBMITTED",
      summary: `Transfert ${transfer.reference} soumis`,
      actorUserId,
      toStatus: "PENDING_APPROVAL",
    });
    return transfer;
  });
}

export async function decideEnterpriseStockTransfer(organizationId: string, transferId: string, actorUserId: string, input: StockTransferDecisionInput) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.enterpriseStockTransfer.findFirst({
      where: { id: transferId, organizationId, status: "PENDING_APPROVAL", archivedAt: null },
      include: { lines: true },
    });
    if (!transfer) throw new EnterpriseDomainError("STOCK_TRANSFER_NOT_FOUND", 404);
    if (transfer.requestedByUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    if (transfer.approvedByUserId !== actorUserId) throw new EnterpriseDomainError("NOT_TRANSFER_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({
      where: { organizationId, targetEntityType: "EnterpriseStockTransfer", targetEntityId: transfer.id, status: "PENDING", approverUserId: actorUserId },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);

    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseStockTransfer.updateMany({
        where: { id: transfer.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" },
        data: { status: "REJECTED", revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "REJECTED", decisionAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
      await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockTransfer", entityId: transfer.id, eventType: "STOCK_TRANSFER_REJECTED", summary: `Transfert ${transfer.reference} rejeté`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "REJECTED" });
      return tx.enterpriseStockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { lines: true } });
    }

    for (const line of transfer.lines) {
      await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: line.inventoryItemId,
        warehouseId: transfer.sourceWarehouseId,
        storageLocationId: line.sourceLocationId,
        stockLotId: line.stockLotId,
        movementType: "TRANSFER_OUT",
        direction: "OUT",
        quantity: Number(line.quantity),
        sourceEntityType: "EnterpriseStockTransfer",
        sourceEntityId: transfer.id,
        sourceLineId: line.id,
        idempotencyKey: `transfer:${transfer.id}:${line.id}:out`,
        reason: input.comment || null,
      });
      await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: line.inventoryItemId,
        warehouseId: transfer.destinationWarehouseId,
        storageLocationId: line.destinationLocationId,
        stockLotId: null,
        movementType: "TRANSFER_IN",
        direction: "IN",
        quantity: Number(line.quantity),
        sourceEntityType: "EnterpriseStockTransfer",
        sourceEntityId: transfer.id,
        sourceLineId: line.id,
        idempotencyKey: `transfer:${transfer.id}:${line.id}:in`,
        reason: input.comment || null,
      });
    }
    const updated = await tx.enterpriseStockTransfer.updateMany({
      where: { id: transfer.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" },
      data: { status: "COMPLETED", approvedAt: new Date(), dispatchedAt: new Date(), receivedAt: new Date(), dispatchedByUserId: actorUserId, receivedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decisionAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockTransfer", entityId: transfer.id, eventType: "STOCK_TRANSFER_COMPLETED", summary: `Transfert ${transfer.reference} exécuté`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "COMPLETED" });
    return tx.enterpriseStockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { lines: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createEnterpriseInventoryCount(organizationId: string, actorUserId: string, input: InventoryCountCreateInput) {
  if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
  return prisma.$transaction(async (tx) => {
    const [warehouse, approver] = await Promise.all([
      tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      tx.organizationMember.findFirst({ where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }),
    ]);
    if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
    if (!approver) throw new EnterpriseDomainError("APPROVER_NOT_MEMBER", 404);
    const seen = new Set<string>();
    const lines = [];
    for (const line of input.lines) {
      const key = `${line.inventoryItemId}:${line.stockLotId || ""}`;
      if (seen.has(key)) throw new EnterpriseDomainError("INVENTORY_COUNT_LINE_DUPLICATE");
      seen.add(key);
      await assertInventoryCoordinates(tx, organizationId, { inventoryItemId: line.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId, stockLotId: line.stockLotId });
      const balance = await tx.enterpriseInventoryBalance.findFirst({ where: { organizationId, inventoryItemId: line.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, stockLotId: line.stockLotId || null } });
      const expectedQuantity = Number(balance?.quantityOnHand || 0);
      lines.push({ organizationId, inventoryItemId: line.inventoryItemId, stockLotId: line.stockLotId || null, expectedQuantity, countedQuantity: line.countedQuantity, varianceQuantity: line.countedQuantity - expectedQuantity, countedByUserId: actorUserId, countedAt: new Date(), notes: line.notes || null });
    }
    const count = await tx.enterpriseInventoryCount.create({
      data: { organizationId, reference: inventoryReference("CNT"), warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, status: "SUBMITTED", countType: input.countType, startedAt: new Date(), submittedAt: new Date(), requestedByUserId: actorUserId, approvedByUserId: input.approverUserId, notes: input.notes || null, lines: { create: lines } },
      include: { lines: true },
    });
    await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseInventoryCount", targetEntityId: count.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseInventoryCount", entityId: count.id, eventType: "INVENTORY_COUNT_SUBMITTED", summary: `Inventaire ${count.reference} soumis`, actorUserId, toStatus: "SUBMITTED" });
    return count;
  });
}

export async function decideEnterpriseInventoryCount(organizationId: string, countId: string, actorUserId: string, input: InventoryCountDecisionInput) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.enterpriseInventoryCount.findFirst({ where: { id: countId, organizationId, status: "SUBMITTED", archivedAt: null }, include: { lines: true } });
    if (!count) throw new EnterpriseDomainError("INVENTORY_COUNT_NOT_FOUND", 404);
    if (count.requestedByUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    if (count.approvedByUserId !== actorUserId) throw new EnterpriseDomainError("NOT_INVENTORY_COUNT_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseInventoryCount", targetEntityId: count.id, status: "PENDING", approverUserId: actorUserId } });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);

    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseInventoryCount.updateMany({ where: { id: count.id, organizationId, revision: input.revision, status: "SUBMITTED" }, data: { status: "REJECTED", revision: { increment: 1 } } });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "REJECTED", decisionAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
      return tx.enterpriseInventoryCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } });
    }

    for (const line of count.lines) {
      const variance = Number(line.varianceQuantity || 0);
      if (Math.abs(variance) < 0.000001) continue;
      await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: line.inventoryItemId,
        warehouseId: count.warehouseId,
        storageLocationId: count.storageLocationId,
        stockLotId: line.stockLotId,
        movementType: "COUNT_CORRECTION",
        direction: variance > 0 ? "IN" : "OUT",
        quantity: Math.abs(variance),
        sourceEntityType: "EnterpriseInventoryCount",
        sourceEntityId: count.id,
        sourceLineId: line.id,
        idempotencyKey: `inventory-count:${count.id}:${line.id}`,
        reason: input.comment || `Correction inventaire ${count.reference}`,
      });
    }
    const updated = await tx.enterpriseInventoryCount.updateMany({ where: { id: count.id, organizationId, revision: input.revision, status: "SUBMITTED" }, data: { status: "COMPLETED", approvedAt: new Date(), completedAt: new Date(), revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decisionAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseInventoryCount", entityId: count.id, eventType: "INVENTORY_COUNT_COMPLETED", summary: `Inventaire ${count.reference} appliqué`, actorUserId, fromStatus: "SUBMITTED", toStatus: "COMPLETED" });
    return tx.enterpriseInventoryCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
