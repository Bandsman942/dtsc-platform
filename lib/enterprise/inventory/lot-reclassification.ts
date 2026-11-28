import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseDomainError, EnterpriseDomainConflictError } from "@/lib/enterprise/common/errors";
import { assertInventoryApprovalCandidate, assertInventoryApprovalDecision } from "@/lib/enterprise/inventory/approval";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { requireInventoryStockAuthorityTx } from "@/lib/enterprise/inventory/service";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";

const target = "EnterpriseStockLotReclassification";
const entry = z.object({
  lotNumber: z.string().trim().min(1).max(120),
  productionDate: z.iso.date().nullable(),
  expiryDate: z.iso.date().nullable(),
  quantity: z.string().regex(/^\d{1,15}(\.\d{1,6})?$/),
}).strict();
const allocationsSchema = z.array(entry).min(1).max(100);
export const lotReclassificationSchema = z.object({
  sourceBalanceId: z.string().min(1).max(191),
  sourceBalanceRevision: z.number().int().positive(),
  itemRevision: z.number().int().positive(),
  approverUserId: z.string().min(1).max(191),
  allocations: allocationsSchema,
  reason: z.string().trim().min(5).max(2000),
  idempotencyKey: z.string().trim().min(8).max(180),
}).strict();
type RequestInput = z.infer<typeof lotReclassificationSchema>;
type Allocation = z.infer<typeof entry>;
const zero = () => new Prisma.Decimal(0);
const date = (value: string | null) => value ? new Date(value + "T00:00:00.000Z") : null;

export function validateLotReclassificationAllocations(allocations: Allocation[], expected: Prisma.Decimal, expiryRequired: boolean) {
  const seen = new Set<string>();
  let total = zero();
  for (const batch of allocations) {
    const amount = new Prisma.Decimal(batch.quantity);
    if (seen.has(batch.lotNumber) || amount.lte(0) || amount.decimalPlaces() > 6 || (!batch.expiryDate && expiryRequired)
      || (batch.productionDate && batch.expiryDate && batch.productionDate > batch.expiryDate)) {
      throw new EnterpriseDomainError("STOCK_RECLASS_ALLOCATION_INVALID", 400);
    }
    seen.add(batch.lotNumber);
    total = total.plus(amount);
  }
  if (!expected.gt(0) || !total.equals(expected)) throw new EnterpriseDomainError("STOCK_RECLASS_QUANTITY_MISMATCH", 409);
  return total;
}

export async function requireLotReclassificationOrganizationWideScope(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const membership = await tx.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { id: true } });
  if (!membership) throw new EnterpriseDomainError("STOCK_RECLASS_PERMISSION_DENIED", 403);
  try {
    if ((await retailInventoryVisibleSites(organizationId, userId, tx)).isolationEnabled) throw new EnterpriseDomainError("STOCK_RECLASS_PERMISSION_DENIED", 403);
  } catch {
    throw new EnterpriseDomainError("STOCK_RECLASS_PERMISSION_DENIED", 403);
  }
}

async function validateSourceTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string, input: { sourceBalanceId: string; sourceBalanceRevision: number; itemRevision: number; allocations: Allocation[] }) {
  const source = await tx.enterpriseInventoryBalance.findFirst({ where: { organizationId, id: input.sourceBalanceId, stockLotId: null }, include: { inventoryItem: { include: { catalogItem: { select: { id: true, name: true, code: true, trackInventory: true, status: true, archivedAt: true } } } }, warehouse: { select: { name: true, code: true, status: true, archivedAt: true } }, storageLocation: { select: { name: true, code: true, status: true, archivedAt: true } } } });
  if (!source || source.inventoryItem.archivedAt || source.inventoryItem.status !== "ACTIVE" || !source.inventoryItem.catalogItem.trackInventory || source.inventoryItem.catalogItem.status !== "ACTIVE" || source.inventoryItem.catalogItem.archivedAt || source.warehouse.status !== "ACTIVE" || source.warehouse.archivedAt || (source.storageLocation && (source.storageLocation.status !== "ACTIVE" || source.storageLocation.archivedAt))) throw new EnterpriseDomainError("STOCK_RECLASS_SOURCE_INVALID", 404);
  await requireLotReclassificationOrganizationWideScope(tx, organizationId, actorUserId);
  await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, source.warehouseId);
  if (source.revision !== input.sourceBalanceRevision || source.inventoryItem.revision !== input.itemRevision || !source.quantityOnHand.gt(0)) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
  const coordinates = { organizationId, inventoryItemId: source.inventoryItemId, warehouseId: source.warehouseId };
  const [duplicate, reservations, holds, adjustment, transfer, count, pharmacy, sector] = await Promise.all([
    tx.enterpriseInventoryBalance.count({ where: { ...coordinates, stockLotId: null, storageLocationId: source.storageLocationId } }),
    tx.enterpriseInventoryReservation.count({ where: { ...coordinates, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    readActiveRetailInvoiceStockHoldsTx(tx, { organizationId, warehouseId: source.warehouseId, inventoryItemIds: [source.inventoryItemId] }),
    tx.enterpriseStockAdjustment.count({ where: { ...coordinates, status: "PENDING_APPROVAL" } }),
    tx.enterpriseStockTransfer.count({ where: { organizationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "IN_TRANSIT"] }, OR: [{ sourceWarehouseId: source.warehouseId }, { destinationWarehouseId: source.warehouseId }], lines: { some: { inventoryItemId: source.inventoryItemId } } } }),
    tx.enterpriseInventoryCount.count({ where: { organizationId, warehouseId: source.warehouseId, status: { in: ["DRAFT", "IN_PROGRESS", "SUBMITTED", "APPROVED"] }, lines: { some: { inventoryItemId: source.inventoryItemId } } } }),
    tx.pharmacyProductExtension.count({ where: { organizationId, catalogItemId: source.inventoryItem.catalogItemId } }),
    tx.enterpriseSectorInventoryEvent.count({ where: { organizationId, catalogItemId: source.inventoryItem.catalogItemId } }),
  ]);
  if (pharmacy || sector) throw new EnterpriseDomainError("STOCK_RECLASS_SECTOR_AUTHORITY", 409);
  if (duplicate !== 1 || !source.quantityReserved.isZero() || reservations || holds.length || adjustment || transfer || count) throw new EnterpriseDomainError("STOCK_RECLASS_OPEN_OPERATIONS", 409);
  validateLotReclassificationAllocations(input.allocations, source.quantityOnHand, source.inventoryItem.expiryTracking);
  return source;
}

async function retryConflict<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(err.code)) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
    throw err;
  }
}

export async function submitStockLotReclassification(organizationId: string, actorUserId: string, input: RequestInput) {
  if (actorUserId === input.approverUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 403);
  await assertInventoryApprovalCandidate({ organizationId, requesterUserId: actorUserId, approverUserId: input.approverUserId });
  // This workflow is decided exclusively from the common Approvals workspace.
  // Reject unavailable routes before persisting a request that nobody can process.
  const approvalAccess = await Promise.all([actorUserId, input.approverUserId].map((userId) =>
    resolveEnterpriseModuleCapabilities({ organizationId, userId, moduleCode: "VALIDATIONS" }),
  ));
  if (approvalAccess.some((access) => !access.canRead || !access.canSubmit)) {
    throw new EnterpriseDomainError("STOCK_RECLASS_VALIDATIONS_REQUIRED", 403);
  }
  return retryConflict(() => prisma.$transaction(async (tx) => {
    await requireLotReclassificationOrganizationWideScope(tx, organizationId, actorUserId);
    await requireLotReclassificationOrganizationWideScope(tx, organizationId, input.approverUserId);
    const existing = await tx.enterpriseStockLotReclassification.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: target, targetEntityId: existing.id, archivedAt: null } });
      if (!approval || existing.requestedByUserId !== actorUserId || existing.sourceBalanceId !== input.sourceBalanceId || existing.sourceBalanceRevision !== input.sourceBalanceRevision || existing.itemRevision !== input.itemRevision || approval.approverUserId !== input.approverUserId || existing.reason !== input.reason || JSON.stringify(allocationsSchema.parse(existing.allocations)) !== JSON.stringify(input.allocations)) throw new EnterpriseDomainConflictError("STOCK_RECLASS_IDEMPOTENCY_COLLISION");
      return { request: existing, approval, idempotent: true };
    }
    const source = await validateSourceTx(tx, organizationId, actorUserId, input);
    const pending = await tx.enterpriseStockLotReclassification.findFirst({ where: { organizationId, sourceBalanceId: source.id, status: "PENDING_APPROVAL" }, select: { id: true } });
    if (pending) throw new EnterpriseDomainConflictError("STOCK_RECLASS_ALREADY_PENDING");
    const request = await tx.enterpriseStockLotReclassification.create({ data: { organizationId, reference: "LOT-REG-" + randomUUID().slice(0, 12).toUpperCase(), sourceBalanceId: source.id, sourceBalanceRevision: source.revision, inventoryItemId: source.inventoryItemId, itemRevision: source.inventoryItem.revision, warehouseId: source.warehouseId, storageLocationId: source.storageLocationId, quantity: source.quantityOnHand, allocations: input.allocations, reason: input.reason, requestedByUserId: actorUserId, idempotencyKey: input.idempotencyKey } });
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: target, targetEntityId: request.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId, status: "PENDING" } });
    await tx.enterpriseEntityLink.create({ data: { organizationId, sourceModule: "INVENTORY_LOGISTICS", sourceEntityType: target, sourceEntityId: request.id, targetModule: "VALIDATIONS", targetEntityType: "EnterpriseApproval", targetEntityId: approval.id, linkType: "REQUIRES_APPROVAL", createdById: actorUserId } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: target, entityId: request.id, eventType: "STOCK_LOT_RECLASS_SUBMITTED", summary: request.reference, actorUserId, toStatus: "PENDING_APPROVAL" });
    return { request, approval, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export async function decideStockLotReclassification(args: { organizationId: string; approvalId: string; actorUserId: string; action: "APPROVE" | "REJECT" | "CANCEL"; revision: number; decisionComment?: string | null }) {
  const { organizationId, actorUserId, approvalId } = args;
  const candidate = await prisma.enterpriseApproval.findFirst({ where: { organizationId, id: approvalId, targetEntityType: target, status: "PENDING", archivedAt: null } });
  if (!candidate) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
  if (args.action !== "CANCEL") {
    if (candidate.requestedByUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 403);
    await assertInventoryApprovalDecision({ organizationId, requesterUserId: candidate.requestedByUserId, approverUserId: candidate.approverUserId, actorUserId });
  } else if (candidate.requestedByUserId !== actorUserId) throw new EnterpriseDomainError("STOCK_RECLASS_PERMISSION_DENIED", 403);
  if (args.action === "REJECT" && !args.decisionComment?.trim()) throw new EnterpriseDomainError("STOCK_RECLASS_REASON_REQUIRED", 400);
  return retryConflict(() => prisma.$transaction(async (tx) => {
    await requireLotReclassificationOrganizationWideScope(tx, organizationId, actorUserId);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, id: approvalId, targetEntityType: target, status: "PENDING", archivedAt: null, revision: args.revision } });
    if (!approval || (args.action === "CANCEL" ? approval.requestedByUserId !== actorUserId : approval.approverUserId !== actorUserId || approval.requestedByUserId === actorUserId)) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
    const request = await tx.enterpriseStockLotReclassification.findFirst({ where: { organizationId, id: approval.targetEntityId, status: "PENDING_APPROVAL" } });
    if (!request || request.requestedByUserId !== approval.requestedByUserId) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
    if (args.action === "APPROVE") {
      const allocations = allocationsSchema.parse(request.allocations);
      const source = await validateSourceTx(tx, organizationId, actorUserId, { ...request, allocations });
      if (source.inventoryItemId !== request.inventoryItemId || source.warehouseId !== request.warehouseId || source.storageLocationId !== request.storageLocationId || !source.quantityOnHand.equals(request.quantity)) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
      const coordinates = { organizationId, inventoryItemId: source.inventoryItemId, warehouseId: source.warehouseId, storageLocationId: source.storageLocationId };
      // This is a single zero-sum physical reclassification. No public stock
      // movement API accepts these types. Old cost layers and journals remain
      // untouched; the accounting endpoints reject valuation of both legs.
      const updated = await tx.enterpriseInventoryBalance.updateMany({ where: { organizationId, id: source.id, revision: source.revision, stockLotId: null }, data: { quantityOnHand: zero(), revision: { increment: 1 } } });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
      await tx.enterpriseStockMovement.create({ data: { ...coordinates, stockLotId: null, movementType: "LOT_RECLASSIFICATION_OUT", direction: "OUT", quantity: source.quantityOnHand, balanceAfter: zero(), sourceEntityType: target, sourceEntityId: request.id, idempotencyKey: "lot-reclass:" + request.id + ":out", reason: request.reason, createdByUserId: actorUserId } });
      for (const batch of allocations) {
        const productionDate = date(batch.productionDate), expiryDate = date(batch.expiryDate);
        let lot = await tx.enterpriseStockLot.findFirst({ where: { organizationId, inventoryItemId: source.inventoryItemId, warehouseId: source.warehouseId, lotNumber: batch.lotNumber } });
        if (lot) {
          if (lot.archivedAt || lot.status !== "AVAILABLE" || lot.productionDate?.getTime() !== productionDate?.getTime() || lot.expiryDate?.getTime() !== expiryDate?.getTime() || (lot.storageLocationId && lot.storageLocationId !== source.storageLocationId)) throw new EnterpriseDomainConflictError("STOCK_RECLASS_LOT_CONFLICT");
        } else {
          lot = await tx.enterpriseStockLot.create({ data: { ...coordinates, lotNumber: batch.lotNumber, productionDate, expiryDate, createdByUserId: actorUserId } });
        }
        const balances = await tx.enterpriseInventoryBalance.findMany({ where: { ...coordinates, stockLotId: lot.id }, take: 2 });
        if (balances.length > 1) throw new EnterpriseDomainConflictError("STOCK_RECLASS_LOT_CONFLICT");
        const balance = balances[0];
        const quantity = new Prisma.Decimal(batch.quantity);
        const next = (balance?.quantityOnHand || zero()).plus(quantity);
        if (balance) {
          const result = await tx.enterpriseInventoryBalance.updateMany({ where: { organizationId, id: balance.id, revision: balance.revision }, data: { quantityOnHand: next, revision: { increment: 1 } } });
          if (result.count !== 1) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
        } else await tx.enterpriseInventoryBalance.create({ data: { ...coordinates, stockLotId: lot.id, quantityOnHand: quantity } });
        await tx.enterpriseStockMovement.create({ data: { ...coordinates, stockLotId: lot.id, movementType: "LOT_RECLASSIFICATION_IN", direction: "IN", quantity, balanceAfter: next, sourceEntityType: target, sourceEntityId: request.id, sourceLineId: lot.id, idempotencyKey: "lot-reclass:" + request.id + ":" + lot.id, reason: request.reason, createdByUserId: actorUserId } });
      }
    }
    const status = args.action === "APPROVE" ? "COMPLETED" : args.action === "REJECT" ? "REJECTED" : "CANCELLED";
    const approvalStatus = args.action === "APPROVE" ? "APPROVED" : status;
    const now = new Date();
    const updated = await tx.enterpriseStockLotReclassification.updateMany({ where: { organizationId, id: request.id, status: "PENDING_APPROVAL", revision: request.revision }, data: { status, decidedAt: now, revision: { increment: 1 } } });
    const decided = await tx.enterpriseApproval.updateMany({ where: { organizationId, id: approval.id, status: "PENDING", revision: args.revision }, data: { status: approvalStatus, decidedAt: now, decisionComment: args.decisionComment || null, revision: { increment: 1 } } });
    if (updated.count !== 1 || decided.count !== 1) throw new EnterpriseDomainConflictError("STOCK_RECLASS_SOURCE_CHANGED");
    await publishEnterpriseEvent(tx, { organizationId, entityType: target, entityId: request.id, eventType: "STOCK_LOT_RECLASS_" + status, summary: request.reference, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: status, metadataJson: { approvalId: approval.id, quantity: request.quantity.toFixed(), reason: args.decisionComment || null } });
    return { requestId: request.id, status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}
