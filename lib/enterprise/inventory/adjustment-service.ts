import { Prisma } from "@prisma/client";
import { valueInventoryIssueTx } from "@/lib/enterprise/accounting/inventory-accounting-service";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { lotExpiryDateKey } from "@/lib/enterprise/inventory/lot-allocation";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { assertInventoryApprovalCandidate, assertInventoryApprovalDecision } from "@/lib/enterprise/inventory/approval";
import { applyStockMovementTx, requireInventoryStockAuthorityTx, assertCommonInventoryCatalogAuthorityTx } from "@/lib/enterprise/inventory/service";
import type { stockAdjustmentCreateSchema, stockAdjustmentDecisionSchema } from "@/lib/enterprise/inventory/schemas";
import { prisma } from "@/lib/prisma";

type StockAdjustmentCreateInput = z.infer<typeof stockAdjustmentCreateSchema>;
type StockAdjustmentDecisionInput = z.infer<typeof stockAdjustmentDecisionSchema>;

function adjustmentReference() {
  return `ADJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function assertAdjustmentCoordinates(tx: Prisma.TransactionClient, organizationId: string, input: Pick<StockAdjustmentCreateInput, "inventoryItemId" | "warehouseId" | "storageLocationId" | "stockLotId" | "lossReason">) {
  const [inventoryItem, warehouse, location, stockLot] = await Promise.all([
    tx.enterpriseInventoryItem.findFirst({ where: { id: input.inventoryItemId, organizationId, status: "ACTIVE", archivedAt: null }, include: { catalogItem: { select: { id: true, trackInventory: true } } } }),
    tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
    input.storageLocationId ? tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: input.warehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true } }) : Promise.resolve(null),
    input.stockLotId ? tx.enterpriseStockLot.findFirst({ where: { id: input.stockLotId, organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, status: input.lossReason ? { in: ["AVAILABLE","BLOCKED","QUARANTINED"] } : "AVAILABLE", archivedAt: null }, select: { id: true, storageLocationId: true, expiryDate: true, status: true } }) : Promise.resolve(null),
  ]);
  if (!inventoryItem || !inventoryItem.catalogItem.trackInventory) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);
  await assertCommonInventoryCatalogAuthorityTx(tx,organizationId,inventoryItem.catalogItem.id);
  if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
  if (input.storageLocationId && !location) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);
  if (input.stockLotId && !stockLot) throw new EnterpriseDomainError("STOCK_LOT_NOT_FOUND", 404);
  if (inventoryItem.lotTracking && !stockLot) throw new EnterpriseDomainError("STOCK_LOT_REQUIRED_FOR_TRACKED_ITEM", 409);
  if (inventoryItem.expiryTracking && !stockLot?.expiryDate) throw new EnterpriseDomainError("STOCK_EXPIRY_DATE_REQUIRED", 409);
  if (stockLot?.storageLocationId && input.storageLocationId && stockLot.storageLocationId !== input.storageLocationId) throw new EnterpriseDomainError("STOCK_LOT_LOCATION_MISMATCH", 409);
  if (input.lossReason) {
    if (!stockLot || !inventoryItem.lotTracking) throw new EnterpriseDomainError("STOCK_LOSS_BATCH_REQUIRED", 409);
    const [pharmacy, sector, org] = await Promise.all([
      tx.pharmacyProductExtension.count({where:{organizationId,catalogItemId:inventoryItem.catalogItem.id}}),
      tx.enterpriseSectorInventoryEvent.count({where:{organizationId,catalogItemId:inventoryItem.catalogItem.id}}),
      tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{timezone:true}}),
    ]);
    if (pharmacy || sector) throw new EnterpriseDomainError("STOCK_RECLASS_SECTOR_AUTHORITY",409);
    const parts = new Intl.DateTimeFormat("en-CA",{timeZone:org.timezone||"UTC",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const today = ["year","month","day"].map(type=>parts.find(part=>part.type===type)?.value).join("-");
    if (input.lossReason === "EXPIRY" && (!stockLot.expiryDate || lotExpiryDateKey(stockLot.expiryDate)>=today)) throw new EnterpriseDomainError("STOCK_LOSS_NOT_EXPIRED",409);
    if (input.lossReason !== "EXPIRY" && stockLot.status === "AVAILABLE") throw new EnterpriseDomainError("STOCK_LOSS_ISOLATE_FIRST",409);
  }
}

export async function createEnterpriseStockAdjustment(organizationId: string, actorUserId: string, input: StockAdjustmentCreateInput) {
  if (input.lossReason && actorUserId === input.approverUserId) throw new EnterpriseDomainError("STOCK_LOSS_INDEPENDENT_APPROVAL",403);
  await assertInventoryApprovalCandidate({ organizationId, requesterUserId: actorUserId, approverUserId: input.approverUserId });
  return prisma.$transaction(async (tx) => {
    const approver = await tx.organizationMember.findFirst({ where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null }, select: { id: true } });
    if (!approver) throw new EnterpriseDomainError("APPROVER_NOT_MEMBER", 404);
    await assertAdjustmentCoordinates(tx, organizationId, input);
    await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, input.warehouseId);
    if (input.lossReason && input.idempotencyKey) {
      const prior = await tx.enterpriseStockAdjustment.findFirst({where:{organizationId,idempotencyKey:input.idempotencyKey}});
      if (prior) {
        if (prior.requestedByUserId !== actorUserId || prior.approvedByUserId !== input.approverUserId || prior.inventoryItemId !== input.inventoryItemId || prior.warehouseId !== input.warehouseId || prior.storageLocationId !== (input.storageLocationId||null) || prior.stockLotId !== input.stockLotId || prior.lossReason !== input.lossReason || !prior.quantity.equals(input.quantity) || prior.reason !== input.reason) throw new EnterpriseDomainError("STOCK_LOSS_IDEMPOTENCY_CONFLICT",409);
        return prior;
      }
      const balance=await tx.enterpriseInventoryBalance.findFirst({where:{organizationId,inventoryItemId:input.inventoryItemId,warehouseId:input.warehouseId,storageLocationId:input.storageLocationId||null,stockLotId:input.stockLotId}});
      if (!balance || balance.quantityOnHand.minus(balance.quantityReserved).lt(input.quantity)) throw new EnterpriseDomainError("NEGATIVE_STOCK_FORBIDDEN",409);
    }
    const adjustment = await tx.enterpriseStockAdjustment.create({
      data: { organizationId, reference: adjustmentReference(), inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, stockLotId: input.stockLotId || null, adjustmentType: input.adjustmentType, ...(input.lossReason ? {lossReason:input.lossReason} : {}), quantity: input.quantity, reason: input.reason, status: "PENDING_APPROVAL", requestedByUserId: actorUserId, approvedByUserId: input.approverUserId, idempotencyKey: input.idempotencyKey || null, submittedAt: new Date() },
    });
    await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseStockAdjustment", targetEntityId: adjustment.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockAdjustment", entityId: adjustment.id, eventType: "STOCK_ADJUSTMENT_SUBMITTED", summary: `Ajustement ${adjustment.reference} soumis`, actorUserId, toStatus: "PENDING_APPROVAL" });
    return adjustment;
  }, {isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function decideEnterpriseStockAdjustment(organizationId: string, adjustmentId: string, actorUserId: string, input: StockAdjustmentDecisionInput) {
  const candidate = await prisma.enterpriseStockAdjustment.findFirst({ where: { id: adjustmentId, organizationId, status: "PENDING_APPROVAL" }, select: { requestedByUserId: true, approvedByUserId: true } });
  if (!candidate) throw new EnterpriseDomainError("STOCK_ADJUSTMENT_NOT_FOUND", 404);
  if (!candidate.approvedByUserId) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
  const decision = await assertInventoryApprovalDecision({ organizationId, requesterUserId: candidate.requestedByUserId, approverUserId: candidate.approvedByUserId, actorUserId });
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.enterpriseStockAdjustment.findFirst({ where: { id: adjustmentId, organizationId, status: "PENDING_APPROVAL" } });
    if (!adjustment) throw new EnterpriseDomainError("STOCK_ADJUSTMENT_NOT_FOUND", 404);
    await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, adjustment.warehouseId);
    if (adjustment.approvedByUserId !== actorUserId) throw new EnterpriseDomainError("NOT_STOCK_ADJUSTMENT_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseStockAdjustment", targetEntityId: adjustment.id, status: "PENDING", approverUserId: actorUserId } });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    const decisionComment = input.comment || (decision.selfApprovalOverride ? "SELF_APPROVAL_OVERRIDE" : null);
    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseStockAdjustment.updateMany({ where: { id: adjustment.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" }, data: { status: "REJECTED", rejectedAt: new Date(), revision: { increment: 1 } } });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "REJECTED", decidedAt: new Date(), decisionComment, revision: { increment: 1 } } });
      await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockAdjustment", entityId: adjustment.id, eventType: "STOCK_ADJUSTMENT_REJECTED", summary: `Ajustement ${adjustment.reference} rejeté`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "REJECTED", metadataJson: { selfApprovalOverride: decision.selfApprovalOverride } });
      return tx.enterpriseStockAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
    }
    if (adjustment.lossReason) {
      if (adjustment.requestedByUserId === actorUserId) throw new EnterpriseDomainError("STOCK_LOSS_INDEPENDENT_APPROVAL",403);
      await assertAdjustmentCoordinates(tx,organizationId,{...adjustment,lossReason:adjustment.lossReason as StockAdjustmentCreateInput["lossReason"]});
    }
    const result = await applyStockMovementTx(tx, organizationId, actorUserId, { inventoryItemId: adjustment.inventoryItemId, warehouseId: adjustment.warehouseId, storageLocationId: adjustment.storageLocationId, stockLotId: adjustment.stockLotId, movementType: adjustment.lossReason ? "LOT_WRITE_OFF" : adjustment.adjustmentType === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", direction: adjustment.adjustmentType === "IN" ? "IN" : "OUT", quantity: Number(adjustment.quantity), sourceEntityType: "EnterpriseStockAdjustment", sourceEntityId: adjustment.id, sourceLineId: null, idempotencyKey: adjustment.lossReason ? `lot-write-off:${adjustment.id}` : adjustment.idempotencyKey || `stock-adjustment:${adjustment.id}`, reason: adjustment.lossReason ? adjustment.reason : input.comment || adjustment.reason }, adjustment.lossReason ? {approvedLotWriteOffId:adjustment.id} : undefined);
    if (adjustment.lossReason) {
      const config=await tx.enterpriseFinanceConfiguration.findUnique({where:{organizationId},select:{automaticPostingEnabled:true}});
      if (config?.automaticPostingEnabled) {
        const layers=await tx.enterpriseInventoryCostLayer.findMany({where:{organizationId,inventoryItemId:adjustment.inventoryItemId,warehouseId:adjustment.warehouseId,remainingQuantity:{gt:0}},distinct:["currencyCode"],select:{currencyCode:true}});
        if (layers.length!==1) throw new EnterpriseDomainError("STOCK_LOSS_VALUATION_REQUIRED",409);
        try { await valueInventoryIssueTx(tx,organizationId,result.movement.id,actorUserId,{currencyCode:layers[0].currencyCode}); }
        catch(error) { if (error instanceof EnterpriseAccountingError) throw new EnterpriseDomainError("STOCK_LOSS_VALUATION_REQUIRED",409); throw error; }
      }
    }
    const updated = await tx.enterpriseStockAdjustment.updateMany({ where: { id: adjustment.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" }, data: { status: "COMPLETED", approvedAt: new Date(), appliedAt: new Date(), revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedAt: new Date(), decisionComment, revision: { increment: 1 } } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockAdjustment", entityId: adjustment.id, eventType: "STOCK_ADJUSTMENT_APPLIED", summary: `Ajustement ${adjustment.reference} appliqué`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "COMPLETED", metadataJson: { selfApprovalOverride: decision.selfApprovalOverride } });
    return tx.enterpriseStockAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
