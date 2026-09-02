import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import type { stockAdjustmentCreateSchema, stockAdjustmentDecisionSchema } from "@/lib/enterprise/inventory/schemas";
import { prisma } from "@/lib/prisma";

type StockAdjustmentCreateInput = z.infer<typeof stockAdjustmentCreateSchema>;
type StockAdjustmentDecisionInput = z.infer<typeof stockAdjustmentDecisionSchema>;

function adjustmentReference() {
  return `ADJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function assertAdjustmentCoordinates(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: Pick<StockAdjustmentCreateInput, "inventoryItemId" | "warehouseId" | "storageLocationId" | "stockLotId">,
) {
  const [inventoryItem, warehouse, location, stockLot] = await Promise.all([
    tx.enterpriseInventoryItem.findFirst({
      where: { id: input.inventoryItemId, organizationId, status: "ACTIVE", archivedAt: null },
      include: { catalogItem: { select: { trackInventory: true } } },
    }),
    tx.enterpriseWarehouse.findFirst({
      where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    }),
    input.storageLocationId
      ? tx.enterpriseStorageLocation.findFirst({
          where: {
            id: input.storageLocationId,
            organizationId,
            warehouseId: input.warehouseId,
            status: "ACTIVE",
            archivedAt: null,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.stockLotId
      ? tx.enterpriseStockLot.findFirst({
          where: {
            id: input.stockLotId,
            organizationId,
            inventoryItemId: input.inventoryItemId,
            warehouseId: input.warehouseId,
            status: "AVAILABLE",
            archivedAt: null,
          },
          select: { id: true, storageLocationId: true },
        })
      : Promise.resolve(null),
  ]);
  if (!inventoryItem || !inventoryItem.catalogItem.trackInventory) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);
  if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
  if (input.storageLocationId && !location) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);
  if (input.stockLotId && !stockLot) throw new EnterpriseDomainError("STOCK_LOT_NOT_FOUND", 404);
  if (stockLot?.storageLocationId && input.storageLocationId && stockLot.storageLocationId !== input.storageLocationId) {
    throw new EnterpriseDomainError("STOCK_LOT_LOCATION_MISMATCH", 409);
  }
}

export async function createEnterpriseStockAdjustment(
  organizationId: string,
  actorUserId: string,
  input: StockAdjustmentCreateInput,
) {
  if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
  return prisma.$transaction(async (tx) => {
    const approver = await tx.organizationMember.findFirst({
      where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null },
      select: { id: true },
    });
    if (!approver) throw new EnterpriseDomainError("APPROVER_NOT_MEMBER", 404);
    await assertAdjustmentCoordinates(tx, organizationId, input);

    const adjustment = await tx.enterpriseStockAdjustment.create({
      data: {
        organizationId,
        reference: adjustmentReference(),
        inventoryItemId: input.inventoryItemId,
        warehouseId: input.warehouseId,
        storageLocationId: input.storageLocationId || null,
        stockLotId: input.stockLotId || null,
        adjustmentType: input.adjustmentType,
        quantity: input.quantity,
        reason: input.reason,
        status: "PENDING_APPROVAL",
        requestedByUserId: actorUserId,
        approvedByUserId: input.approverUserId,
        idempotencyKey: input.idempotencyKey || null,
        submittedAt: new Date(),
      },
    });
    await tx.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterpriseStockAdjustment",
        targetEntityId: adjustment.id,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
      },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseStockAdjustment",
      entityId: adjustment.id,
      eventType: "STOCK_ADJUSTMENT_SUBMITTED",
      summary: `Ajustement ${adjustment.reference} soumis`,
      actorUserId,
      toStatus: "PENDING_APPROVAL",
    });
    return adjustment;
  });
}

export async function decideEnterpriseStockAdjustment(
  organizationId: string,
  adjustmentId: string,
  actorUserId: string,
  input: StockAdjustmentDecisionInput,
) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.enterpriseStockAdjustment.findFirst({
      where: { id: adjustmentId, organizationId, status: "PENDING_APPROVAL" },
    });
    if (!adjustment) throw new EnterpriseDomainError("STOCK_ADJUSTMENT_NOT_FOUND", 404);
    if (adjustment.requestedByUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    if (adjustment.approvedByUserId !== actorUserId) throw new EnterpriseDomainError("NOT_STOCK_ADJUSTMENT_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({
      where: {
        organizationId,
        targetEntityType: "EnterpriseStockAdjustment",
        targetEntityId: adjustment.id,
        status: "PENDING",
        approverUserId: actorUserId,
      },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);

    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseStockAdjustment.updateMany({
        where: { id: adjustment.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" },
        data: { status: "REJECTED", rejectedAt: new Date(), revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({
        where: { id: approval.id },
        data: { status: "REJECTED", decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } },
      });
      await publishEnterpriseEvent(tx, {
        organizationId,
        entityType: "EnterpriseStockAdjustment",
        entityId: adjustment.id,
        eventType: "STOCK_ADJUSTMENT_REJECTED",
        summary: `Ajustement ${adjustment.reference} rejeté`,
        actorUserId,
        fromStatus: "PENDING_APPROVAL",
        toStatus: "REJECTED",
      });
      return tx.enterpriseStockAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
    }

    await applyStockMovementTx(tx, organizationId, actorUserId, {
      inventoryItemId: adjustment.inventoryItemId,
      warehouseId: adjustment.warehouseId,
      storageLocationId: adjustment.storageLocationId,
      stockLotId: adjustment.stockLotId,
      movementType: adjustment.adjustmentType === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      direction: adjustment.adjustmentType === "IN" ? "IN" : "OUT",
      quantity: Number(adjustment.quantity),
      sourceEntityType: "EnterpriseStockAdjustment",
      sourceEntityId: adjustment.id,
      sourceLineId: null,
      idempotencyKey: adjustment.idempotencyKey || `stock-adjustment:${adjustment.id}`,
      reason: input.comment || adjustment.reason,
    });
    const updated = await tx.enterpriseStockAdjustment.updateMany({
      where: { id: adjustment.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" },
      data: { status: "COMPLETED", approvedAt: new Date(), appliedAt: new Date(), revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({
      where: { id: approval.id },
      data: { status: "APPROVED", decidedAt: new Date(), decisionComment: input.comment || null, revision: { increment: 1 } },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseStockAdjustment",
      entityId: adjustment.id,
      eventType: "STOCK_ADJUSTMENT_APPLIED",
      summary: `Ajustement ${adjustment.reference} appliqué`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "COMPLETED",
    });
    return tx.enterpriseStockAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
