import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { assertEnterpriseApprovalCandidate, assertEnterpriseApprovalDecision } from "@/lib/enterprise/approval-assignment";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { ManufacturingConflictError, ManufacturingDomainError } from "@/lib/enterprise/manufacturing/errors";
import {
  assertActiveManufacturingMember,
  assertManufacturingOrganization,
  currentInventoryQuantity,
  manufacturingDecimal,
  manufacturingNullable,
  manufacturingReference,
  requireManufacturingAsset,
  requireManufacturingCatalogItem,
  requireManufacturingEmployee,
  requireManufacturingInventoryItem,
  requireManufacturingSalesOrderLine,
  requireManufacturingTimesheetEntry,
  requireManufacturingWarehouse,
  type ManufacturingTransaction,
  withManufacturingSerializable,
} from "@/lib/enterprise/manufacturing/shared";
import type {
  manufacturingExecutionRecordSchema,
  manufacturingMaterialConsumptionSchema,
  manufacturingOrderDecisionSchema,
  manufacturingOrderLifecycleSchema,
  manufacturingOrderSubmitSchema,
  manufacturingOutputReceiptSchema,
  manufacturingProductionOrderCreateSchema,
  manufacturingQualityCheckSchema,
  manufacturingScrapSchema,
  manufacturingShortagePurchaseSchema,
} from "@/lib/enterprise/manufacturing/validators";
import { createEnterprisePurchase } from "@/lib/enterprise/procurement/purchase-service";
import { addEnterpriseOperationalEvent } from "@/lib/enterprise/procurement/shared";
import { prisma } from "@/lib/prisma";

type ProductionOrderCreateInput = z.infer<typeof manufacturingProductionOrderCreateSchema>;
type OrderSubmitInput = z.infer<typeof manufacturingOrderSubmitSchema>;
type OrderDecisionInput = z.infer<typeof manufacturingOrderDecisionSchema>;
type OrderLifecycleInput = z.infer<typeof manufacturingOrderLifecycleSchema>;
type MaterialConsumptionInput = z.infer<typeof manufacturingMaterialConsumptionSchema>;
type OutputReceiptInput = z.infer<typeof manufacturingOutputReceiptSchema>;
type ExecutionRecordInput = z.infer<typeof manufacturingExecutionRecordSchema>;
type QualityCheckInput = z.infer<typeof manufacturingQualityCheckSchema>;
type ScrapInput = z.infer<typeof manufacturingScrapSchema>;
type ShortagePurchaseInput = z.infer<typeof manufacturingShortagePurchaseSchema>;

function nonNegative(value: Prisma.Decimal) {
  return value.isNegative() ? manufacturingDecimal(0) : value;
}

async function requireProductionOrder(tx: ManufacturingTransaction, organizationId: string, orderId: string) {
  const order = await tx.enterpriseProductionOrder.findFirst({
    where: { id: orderId, organizationId, archivedAt: null },
    include: {
      bom: { include: { lines: { orderBy: { sequence: "asc" } } } },
      routing: { include: { operations: { orderBy: { sequence: "asc" } } } },
      requirements: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) throw new ManufacturingDomainError("Ordre de production introuvable.", 404, "PRODUCTION_ORDER_NOT_FOUND");
  return order;
}

async function refreshMaterialRequirementsTx(tx: ManufacturingTransaction, organizationId: string, productionOrderId: string) {
  const requirements = await tx.enterpriseProductionMaterialRequirement.findMany({
    where: { organizationId, productionOrderId },
    orderBy: { createdAt: "asc" },
  });
  const refreshed = [];
  for (const requirement of requirements) {
    const remaining = nonNegative(requirement.requiredQuantity.sub(requirement.consumedQuantity));
    const available = await currentInventoryQuantity(tx, organizationId, requirement.inventoryItemId, requirement.warehouseId);
    const shortage = nonNegative(remaining.sub(available));
    const status = remaining.lte(0)
      ? "CONSUMED"
      : shortage.gt(0)
        ? "SHORTAGE"
        : requirement.consumedQuantity.gt(0)
          ? "PARTIALLY_CONSUMED"
          : "AVAILABLE";
    const updated = await tx.enterpriseProductionMaterialRequirement.update({
      where: { id: requirement.id },
      data: { shortageQuantity: shortage, status, revision: { increment: 1 } },
    });
    refreshed.push({ ...updated, availableQuantity: available });
  }
  return refreshed;
}

async function validateExecutionReferences(
  tx: ManufacturingTransaction,
  organizationId: string,
  order: Awaited<ReturnType<typeof requireProductionOrder>>,
  input: { routingOperationId?: string | null; workCenterId?: string | null; employeeId?: string | null; assetId?: string | null; timesheetEntryId?: string | null },
) {
  const employee = await requireManufacturingEmployee(tx, organizationId, input.employeeId);
  const asset = await requireManufacturingAsset(tx, organizationId, input.assetId);
  const timesheetEntry = await requireManufacturingTimesheetEntry(tx, organizationId, input.timesheetEntryId, employee?.id || null);
  const routingOperationId = manufacturingNullable(input.routingOperationId);
  const workCenterId = manufacturingNullable(input.workCenterId);
  let operation = null;
  if (routingOperationId) {
    if (!order.routingId) throw new ManufacturingDomainError("Cet ordre ne possède pas de gamme de production.", 409, "PRODUCTION_ORDER_ROUTING_REQUIRED");
    operation = await tx.enterpriseManufacturingRoutingOperation.findFirst({
      where: { id: routingOperationId, organizationId, routingId: order.routingId },
      select: { id: true, workCenterId: true, code: true, name: true },
    });
    if (!operation) throw new ManufacturingDomainError("L’opération sélectionnée ne fait pas partie de la gamme de cet ordre.", 400, "PRODUCTION_OPERATION_INVALID");
  }
  let workCenter = null;
  const effectiveWorkCenterId = workCenterId || operation?.workCenterId || null;
  if (effectiveWorkCenterId) {
    workCenter = await tx.enterpriseManufacturingWorkCenter.findFirst({
      where: { id: effectiveWorkCenterId, organizationId, archivedAt: null, status: "ACTIVE" },
      select: { id: true, assetId: true, siteId: true, code: true, name: true },
    });
    if (!workCenter) throw new ManufacturingDomainError("Le centre de travail sélectionné est invalide ou inactif.", 400, "PRODUCTION_WORK_CENTER_INVALID");
    if (workCenterId && operation?.workCenterId && workCenterId !== operation.workCenterId) {
      throw new ManufacturingDomainError("Le centre de travail ne correspond pas à l’opération de la gamme.", 409, "PRODUCTION_OPERATION_WORK_CENTER_MISMATCH");
    }
    if (asset && workCenter.assetId && asset.id !== workCenter.assetId) {
      throw new ManufacturingDomainError("L’équipement ne correspond pas à celui du centre de travail.", 409, "PRODUCTION_WORK_CENTER_ASSET_MISMATCH");
    }
  }
  return { employee, asset, timesheetEntry, operation, workCenter };
}

export async function listProductionOrders(organizationId: string, limit = 100) {
  return prisma.enterpriseProductionOrder.findMany({
    where: { organizationId, archivedAt: null },
    include: {
      bom: { select: { id: true, code: true, name: true, version: true } },
      routing: { select: { id: true, code: true, name: true, version: true } },
      requirements: { orderBy: { createdAt: "asc" } },
      executions: { orderBy: { createdAt: "desc" }, take: 20 },
      qualityChecks: { orderBy: { createdAt: "desc" }, take: 20 },
      scraps: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(250, Math.max(1, limit)),
  });
}

export async function createProductionOrder(organizationId: string, actorUserId: string, input: ProductionOrderCreateInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    if (input.idempotencyKey) {
      const existing = await tx.enterpriseProductionOrder.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    const now = new Date();
    const bom = await tx.enterpriseBillOfMaterial.findFirst({
      where: {
        id: input.bomId,
        organizationId,
        status: "ACTIVE",
        archivedAt: null,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
        AND: [{ OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] }],
      },
      include: { lines: { orderBy: { sequence: "asc" } } },
    });
    if (!bom) throw new ManufacturingDomainError("Seule une nomenclature active et applicable peut être utilisée.", 409, "PRODUCTION_BOM_ACTIVE_REQUIRED");
    if (!bom.lines.length) throw new ManufacturingDomainError("La nomenclature ne contient aucun composant.", 409, "PRODUCTION_BOM_EMPTY");
    await requireManufacturingCatalogItem(tx, organizationId, bom.catalogItemId, { inventoryTracked: true });
    await requireManufacturingInventoryItem(tx, organizationId, bom.catalogItemId);
    const materialWarehouse = await requireManufacturingWarehouse(tx, organizationId, input.materialWarehouseId);
    const outputWarehouse = await requireManufacturingWarehouse(tx, organizationId, input.outputWarehouseId);
    let routingId: string | null = null;
    if (input.routingId) {
      const routing = await tx.enterpriseManufacturingRouting.findFirst({
        where: { id: input.routingId, organizationId, status: "ACTIVE", archivedAt: null },
        select: { id: true, catalogItemId: true },
      });
      if (!routing) throw new ManufacturingDomainError("La gamme sélectionnée n’est pas active.", 409, "PRODUCTION_ROUTING_ACTIVE_REQUIRED");
      if (routing.catalogItemId && routing.catalogItemId !== bom.catalogItemId) {
        throw new ManufacturingDomainError("La gamme sélectionnée est définie pour un autre produit.", 409, "PRODUCTION_ROUTING_ITEM_MISMATCH");
      }
      routingId = routing.id;
    }
    await requireManufacturingSalesOrderLine(tx, organizationId, input.salesOrderId, input.salesOrderItemId, bom.catalogItemId);

    const requirementDrafts = [];
    for (const line of bom.lines) {
      const inventoryItem = await requireManufacturingInventoryItem(tx, organizationId, line.catalogItemId);
      const baseQuantity = line.quantity.div(bom.outputQuantity).mul(input.plannedQuantity);
      const requiredQuantity = baseQuantity.mul(new Prisma.Decimal(1).add(line.scrapRate.div(100))).toDecimalPlaces(3);
      requirementDrafts.push({
        organizationId,
        bomLineId: line.id,
        catalogItemId: line.catalogItemId,
        inventoryItemId: inventoryItem.id,
        warehouseId: materialWarehouse.id,
        requiredQuantity,
        consumedQuantity: manufacturingDecimal(0),
        shortageQuantity: manufacturingDecimal(0),
        status: "PLANNED",
      });
    }

    const order = await tx.enterpriseProductionOrder.create({
      data: {
        organizationId,
        reference: manufacturingReference("MO"),
        title: input.title,
        bomId: bom.id,
        routingId,
        outputCatalogItemId: bom.catalogItemId,
        salesOrderId: manufacturingNullable(input.salesOrderId),
        salesOrderItemId: manufacturingNullable(input.salesOrderItemId),
        materialWarehouseId: materialWarehouse.id,
        outputWarehouseId: outputWarehouse.id,
        status: "DRAFT",
        priority: input.priority,
        plannedQuantity: manufacturingDecimal(input.plannedQuantity),
        plannedStartAt: input.plannedStartAt || null,
        plannedEndAt: input.plannedEndAt || null,
        requestedByUserId: actorUserId,
        notes: manufacturingNullable(input.notes),
        idempotencyKey: manufacturingNullable(input.idempotencyKey),
        requirements: { create: requirementDrafts },
      },
      include: { requirements: true },
    });
    await addEnterpriseOperationalEvent(tx, {
      organizationId,
      entityType: "EnterpriseProductionOrder",
      entityId: order.id,
      eventType: "PRODUCTION_ORDER_CREATED",
      summary: `Ordre de production ${order.reference} créé en brouillon.`,
      actorUserId,
      toStatus: "DRAFT",
      metadata: { outputCatalogItemId: order.outputCatalogItemId, plannedQuantity: order.plannedQuantity.toString(), materialWarehouseId: materialWarehouse.id, outputWarehouseId: outputWarehouse.id },
    });
    return order;
  });
}

export async function submitProductionOrder(organizationId: string, orderId: string, actorUserId: string, input: OrderSubmitInput) {
  await assertEnterpriseApprovalCandidate({ organizationId, requesterUserId: actorUserId, approverUserId: input.approverUserId, moduleCode: "PRODUCTION_ORDERS" });
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const order = await requireProductionOrder(tx, organizationId, orderId);
    if (order.status !== "DRAFT") throw new ManufacturingDomainError("Seul un ordre en brouillon peut être soumis.", 409, "PRODUCTION_ORDER_NOT_SUBMITTABLE");
    const changed = await tx.enterpriseProductionOrder.updateMany({
      where: { id: order.id, organizationId, revision: input.revision, status: "DRAFT" },
      data: { status: "SUBMITTED", approverUserId: input.approverUserId, submittedAt: new Date(), revision: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ManufacturingConflictError();
    await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseProductionOrder", targetEntityId: order.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: "PRODUCTION_ORDER_SUBMITTED", summary: `Ordre ${order.reference} soumis pour validation.`, actorUserId, fromStatus: "DRAFT", toStatus: "SUBMITTED" });
    return tx.enterpriseProductionOrder.findFirstOrThrow({ where: { id: order.id, organizationId }, include: { requirements: true } });
  });
}

export async function decideProductionOrder(organizationId: string, orderId: string, actorUserId: string, input: OrderDecisionInput) {
  const pending = await prisma.enterpriseApproval.findFirst({
    where: { organizationId, targetEntityType: "EnterpriseProductionOrder", targetEntityId: orderId, status: "PENDING", archivedAt: null },
    select: { id: true, requestedByUserId: true, approverUserId: true },
  });
  if (!pending) throw new ManufacturingDomainError("Aucune validation en attente n’a été trouvée pour cet ordre.", 404, "PRODUCTION_APPROVAL_NOT_FOUND");
  await assertEnterpriseApprovalDecision({ organizationId, requesterUserId: pending.requestedByUserId, approverUserId: pending.approverUserId, actorUserId, moduleCode: "PRODUCTION_ORDERS" });
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    const order = await requireProductionOrder(tx, organizationId, orderId);
    if (order.status !== "SUBMITTED") throw new ManufacturingDomainError("Cet ordre n’est plus en attente de validation.", 409, "PRODUCTION_ORDER_NOT_PENDING");
    const target = input.action === "APPROVE" ? "RELEASED" : "REJECTED";
    if (input.action === "APPROVE") await refreshMaterialRequirementsTx(tx, organizationId, order.id);
    const changed = await tx.enterpriseProductionOrder.updateMany({
      where: { id: order.id, organizationId, revision: input.revision, status: "SUBMITTED" },
      data: {
        status: target,
        approvedAt: input.action === "APPROVE" ? new Date() : null,
        rejectedAt: input.action === "REJECT" ? new Date() : null,
        rejectionReason: input.action === "REJECT" ? manufacturingNullable(input.comment) : null,
        revision: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new ManufacturingConflictError();
    await tx.enterpriseApproval.update({ where: { id: pending.id }, data: { status: input.action === "APPROVE" ? "APPROVED" : "REJECTED", decidedAt: new Date(), decisionComment: manufacturingNullable(input.comment), revision: { increment: 1 } } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: `PRODUCTION_ORDER_${target}`, summary: `Ordre ${order.reference} ${target === "RELEASED" ? "libéré" : "rejeté"}.`, actorUserId, fromStatus: "SUBMITTED", toStatus: target, metadata: input.comment ? { comment: input.comment } : undefined });
    return tx.enterpriseProductionOrder.findFirstOrThrow({ where: { id: order.id, organizationId }, include: { requirements: true } });
  });
}

async function assertQualityReadyForCompletion(tx: ManufacturingTransaction, organizationId: string, order: Awaited<ReturnType<typeof requireProductionOrder>>) {
  const configuration = await tx.enterpriseManufacturingConfiguration.findUnique({ where: { organizationId } });
  const requiredOperationIds = (order.routing?.operations || []).filter((operation) => operation.requiresQualityCheck).map((operation) => operation.id);
  const checks = await tx.enterpriseProductionQualityCheck.findMany({ where: { organizationId, productionOrderId: order.id }, orderBy: { createdAt: "desc" } });
  if (requiredOperationIds.length) {
    const latestByOperation = new Map<string, string>();
    for (const check of checks) if (check.routingOperationId && !latestByOperation.has(check.routingOperationId)) latestByOperation.set(check.routingOperationId, check.result);
    const missingOrFailed = requiredOperationIds.some((id) => latestByOperation.get(id) !== "PASS");
    if (missingOrFailed) throw new ManufacturingDomainError("Tous les contrôles qualité obligatoires doivent être validés avant de terminer l’ordre.", 409, "PRODUCTION_QUALITY_REQUIRED");
  } else if (configuration?.qualityRequiredByDefault !== false) {
    if (!checks.length || checks[0]?.result !== "PASS") throw new ManufacturingDomainError("Un contrôle qualité validé est requis avant de terminer l’ordre.", 409, "PRODUCTION_QUALITY_REQUIRED");
  }
}

export async function changeProductionOrderLifecycle(organizationId: string, orderId: string, actorUserId: string, input: OrderLifecycleInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const order = await requireProductionOrder(tx, organizationId, orderId);
    let target: string;
    if (input.action === "START") {
      if (order.status !== "RELEASED") throw new ManufacturingDomainError("Seul un ordre libéré peut démarrer.", 409, "PRODUCTION_ORDER_NOT_STARTABLE");
      target = "IN_PROGRESS";
    } else if (input.action === "COMPLETE") {
      if (order.status !== "IN_PROGRESS") throw new ManufacturingDomainError("Seul un ordre en cours peut être terminé.", 409, "PRODUCTION_ORDER_NOT_COMPLETABLE");
      if (order.producedQuantity.lt(order.plannedQuantity)) throw new ManufacturingDomainError("La quantité produite reste inférieure à la quantité planifiée.", 409, "PRODUCTION_OUTPUT_INCOMPLETE");
      await assertQualityReadyForCompletion(tx, organizationId, order);
      target = "COMPLETED";
    } else {
      if (!["DRAFT", "SUBMITTED", "RELEASED"].includes(order.status)) throw new ManufacturingDomainError("Un ordre déjà démarré ne peut pas être annulé sans procédure de régularisation des mouvements.", 409, "PRODUCTION_ORDER_CANCELLATION_BLOCKED");
      target = "CANCELLED";
    }
    const now = new Date();
    const changed = await tx.enterpriseProductionOrder.updateMany({
      where: { id: order.id, organizationId, revision: input.revision, status: order.status },
      data: {
        status: target,
        actualStartAt: target === "IN_PROGRESS" ? order.actualStartAt || now : order.actualStartAt,
        actualEndAt: target === "COMPLETED" ? now : order.actualEndAt,
        cancelledAt: target === "CANCELLED" ? now : order.cancelledAt,
        cancellationReason: target === "CANCELLED" ? manufacturingNullable(input.comment) : order.cancellationReason,
        revision: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new ManufacturingConflictError();
    if (target === "CANCELLED") {
      await tx.enterpriseApproval.updateMany({ where: { organizationId, targetEntityType: "EnterpriseProductionOrder", targetEntityId: order.id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: now, decisionComment: manufacturingNullable(input.comment), revision: { increment: 1 } } });
    }
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: `PRODUCTION_ORDER_${target}`, summary: `Ordre ${order.reference} → ${target}.`, actorUserId, fromStatus: order.status, toStatus: target, metadata: input.comment ? { comment: input.comment } : undefined });
    return tx.enterpriseProductionOrder.findFirstOrThrow({ where: { id: order.id, organizationId }, include: { requirements: true } });
  });
}

export async function consumeProductionMaterial(organizationId: string, orderId: string, actorUserId: string, input: MaterialConsumptionInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const existingExecution = await tx.enterpriseProductionExecution.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existingExecution) return { execution: existingExecution, idempotent: true };
    const order = await requireProductionOrder(tx, organizationId, orderId);
    if (order.status !== "IN_PROGRESS") throw new ManufacturingDomainError("La consommation matière exige un ordre en cours.", 409, "PRODUCTION_ORDER_NOT_IN_PROGRESS");
    const requirement = await tx.enterpriseProductionMaterialRequirement.findFirst({ where: { id: input.requirementId, organizationId, productionOrderId: order.id } });
    if (!requirement) throw new ManufacturingDomainError("Besoin matière introuvable pour cet ordre.", 404, "PRODUCTION_REQUIREMENT_NOT_FOUND");
    const nextConsumed = requirement.consumedQuantity.add(input.quantity).toDecimalPlaces(3);
    if (nextConsumed.gt(requirement.requiredQuantity)) throw new ManufacturingDomainError("La consommation dépasse le besoin matière calculé.", 409, "PRODUCTION_CONSUMPTION_EXCEEDS_REQUIREMENT");
    const refs = await validateExecutionReferences(tx, organizationId, order, input);
    const stock = await applyStockMovementTx(tx, organizationId, actorUserId, {
      inventoryItemId: requirement.inventoryItemId,
      warehouseId: requirement.warehouseId,
      storageLocationId: manufacturingNullable(input.storageLocationId),
      stockLotId: manufacturingNullable(input.stockLotId),
      movementType: "PRODUCTION_CONSUMPTION",
      direction: "OUT",
      quantity: input.quantity,
      sourceEntityType: "EnterpriseProductionOrder",
      sourceEntityId: order.id,
      sourceLineId: requirement.id,
      idempotencyKey: input.idempotencyKey,
      reason: manufacturingNullable(input.notes) || `Consommation ${order.reference}`,
    });
    const changed = await tx.enterpriseProductionMaterialRequirement.updateMany({
      where: { id: requirement.id, organizationId, revision: requirement.revision },
      data: { consumedQuantity: nextConsumed, revision: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ManufacturingConflictError();
    await refreshMaterialRequirementsTx(tx, organizationId, order.id);
    const execution = await tx.enterpriseProductionExecution.create({ data: {
      organizationId,
      productionOrderId: order.id,
      routingOperationId: refs.operation?.id || null,
      workCenterId: refs.workCenter?.id || null,
      employeeId: refs.employee?.id || null,
      assetId: refs.asset?.id || null,
      timesheetEntryId: refs.timesheetEntry?.id || null,
      executionType: "MATERIAL_CONSUMPTION",
      quantityCompleted: manufacturingDecimal(input.quantity),
      minutesWorked: input.minutesWorked || null,
      notes: manufacturingNullable(input.notes),
      idempotencyKey: input.idempotencyKey,
      createdByUserId: actorUserId,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: "PRODUCTION_MATERIAL_CONSUMED", summary: `Matière consommée sur ${order.reference}.`, actorUserId, metadata: { requirementId: requirement.id, quantity: String(input.quantity), stockMovementId: stock.movement.id } });
    return { execution, movement: stock.movement, idempotent: false };
  });
}

export async function receiveProductionOutput(organizationId: string, orderId: string, actorUserId: string, input: OutputReceiptInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const existingExecution = await tx.enterpriseProductionExecution.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existingExecution) return { execution: existingExecution, idempotent: true };
    const order = await requireProductionOrder(tx, organizationId, orderId);
    if (order.status !== "IN_PROGRESS") throw new ManufacturingDomainError("La réception de produit fini exige un ordre en cours.", 409, "PRODUCTION_ORDER_NOT_IN_PROGRESS");
    const configuration = await tx.enterpriseManufacturingConfiguration.findUnique({ where: { organizationId } });
    const nextProduced = order.producedQuantity.add(input.quantity).toDecimalPlaces(3);
    if (configuration?.allowOverproduction !== true && nextProduced.gt(order.plannedQuantity)) throw new ManufacturingDomainError("La quantité reçue dépasserait la quantité planifiée. Activez explicitement la surproduction dans la configuration pour l’autoriser.", 409, "PRODUCTION_OVERPRODUCTION_NOT_ALLOWED");
    const outputInventoryItem = await requireManufacturingInventoryItem(tx, organizationId, order.outputCatalogItemId);
    const refs = await validateExecutionReferences(tx, organizationId, order, input);
    const stock = await applyStockMovementTx(tx, organizationId, actorUserId, {
      inventoryItemId: outputInventoryItem.id,
      warehouseId: order.outputWarehouseId,
      storageLocationId: manufacturingNullable(input.storageLocationId),
      stockLotId: manufacturingNullable(input.stockLotId),
      movementType: "PRODUCTION_OUTPUT",
      direction: "IN",
      quantity: input.quantity,
      sourceEntityType: "EnterpriseProductionOrder",
      sourceEntityId: order.id,
      idempotencyKey: input.idempotencyKey,
      reason: manufacturingNullable(input.notes) || `Sortie de production ${order.reference}`,
    });
    const changed = await tx.enterpriseProductionOrder.updateMany({ where: { id: order.id, organizationId, revision: order.revision }, data: { producedQuantity: nextProduced, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new ManufacturingConflictError();
    const execution = await tx.enterpriseProductionExecution.create({ data: {
      organizationId,
      productionOrderId: order.id,
      routingOperationId: refs.operation?.id || null,
      workCenterId: refs.workCenter?.id || null,
      employeeId: refs.employee?.id || null,
      assetId: refs.asset?.id || null,
      timesheetEntryId: refs.timesheetEntry?.id || null,
      executionType: "OUTPUT_RECEIPT",
      quantityCompleted: manufacturingDecimal(input.quantity),
      minutesWorked: input.minutesWorked || null,
      notes: manufacturingNullable(input.notes),
      idempotencyKey: input.idempotencyKey,
      createdByUserId: actorUserId,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: "PRODUCTION_OUTPUT_RECEIVED", summary: `Produit fini reçu pour ${order.reference}.`, actorUserId, metadata: { quantity: String(input.quantity), stockMovementId: stock.movement.id } });
    return { execution, movement: stock.movement, idempotent: false };
  });
}

export async function recordProductionExecution(organizationId: string, orderId: string, actorUserId: string, input: ExecutionRecordInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseProductionExecution.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) return { execution: existing, idempotent: true };
    const order = await requireProductionOrder(tx, organizationId, orderId);
    if (order.status !== "IN_PROGRESS") throw new ManufacturingDomainError("L’enregistrement d’exécution exige un ordre en cours.", 409, "PRODUCTION_ORDER_NOT_IN_PROGRESS");
    const refs = await validateExecutionReferences(tx, organizationId, order, input);
    const execution = await tx.enterpriseProductionExecution.create({ data: {
      organizationId,
      productionOrderId: order.id,
      routingOperationId: refs.operation?.id || null,
      workCenterId: refs.workCenter?.id || null,
      employeeId: refs.employee?.id || null,
      assetId: refs.asset?.id || null,
      timesheetEntryId: refs.timesheetEntry?.id || null,
      executionType: input.executionType,
      quantityCompleted: input.quantityCompleted == null ? null : manufacturingDecimal(input.quantityCompleted),
      minutesWorked: input.minutesWorked || null,
      startedAt: input.startedAt || null,
      endedAt: input.endedAt || null,
      notes: manufacturingNullable(input.notes),
      idempotencyKey: input.idempotencyKey,
      createdByUserId: actorUserId,
    } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: `PRODUCTION_${input.executionType}`, summary: `Exécution ${input.executionType} enregistrée sur ${order.reference}.`, actorUserId, metadata: { executionId: execution.id, employeeId: refs.employee?.id || null, assetId: refs.asset?.id || null } });
    return { execution, idempotent: false };
  });
}

export async function createProductionQualityCheck(organizationId: string, actorUserId: string, input: QualityCheckInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const order = await requireProductionOrder(tx, organizationId, input.productionOrderId);
    if (!["RELEASED", "IN_PROGRESS"].includes(order.status)) throw new ManufacturingDomainError("Le contrôle qualité exige un ordre libéré ou en cours.", 409, "PRODUCTION_QUALITY_ORDER_INVALID");
    const employee = await requireManufacturingEmployee(tx, organizationId, input.inspectedEmployeeId);
    const operationId = manufacturingNullable(input.routingOperationId);
    if (operationId) {
      if (!order.routingId) throw new ManufacturingDomainError("Cet ordre ne possède pas de gamme.", 409, "PRODUCTION_ORDER_ROUTING_REQUIRED");
      const operation = await tx.enterpriseManufacturingRoutingOperation.findFirst({ where: { id: operationId, organizationId, routingId: order.routingId }, select: { id: true } });
      if (!operation) throw new ManufacturingDomainError("L’opération qualité ne fait pas partie de la gamme de cet ordre.", 400, "PRODUCTION_QUALITY_OPERATION_INVALID");
    }
    return tx.enterpriseProductionQualityCheck.create({ data: {
      organizationId,
      productionOrderId: order.id,
      routingOperationId: operationId,
      checkType: input.checkType,
      result: input.result,
      quantityChecked: manufacturingDecimal(input.quantityChecked),
      quantityAccepted: manufacturingDecimal(input.quantityAccepted),
      quantityRejected: manufacturingDecimal(input.quantityRejected),
      notes: manufacturingNullable(input.notes),
      inspectedByUserId: actorUserId,
      inspectedEmployeeId: employee?.id || null,
    } });
  });
}

export async function createProductionScrap(organizationId: string, actorUserId: string, input: ScrapInput) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    const existing = await tx.enterpriseProductionScrap.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) return { scrap: existing, idempotent: true };
    const order = await requireProductionOrder(tx, organizationId, input.productionOrderId);
    if (order.status !== "IN_PROGRESS") throw new ManufacturingDomainError("Le rebut ne peut être enregistré que sur un ordre en cours.", 409, "PRODUCTION_SCRAP_ORDER_INVALID");
    await requireManufacturingCatalogItem(tx, organizationId, input.catalogItemId, { inventoryTracked: input.affectsInventory });
    const requirementId = manufacturingNullable(input.materialRequirementId);
    const requirement = requirementId ? await tx.enterpriseProductionMaterialRequirement.findFirst({ where: { id: requirementId, organizationId, productionOrderId: order.id } }) : null;
    if (requirementId && !requirement) throw new ManufacturingDomainError("Le besoin matière lié au rebut est introuvable.", 404, "PRODUCTION_SCRAP_REQUIREMENT_INVALID");
    if (requirement && requirement.catalogItemId !== input.catalogItemId) throw new ManufacturingDomainError("Le composant rebuté ne correspond pas au besoin matière sélectionné.", 409, "PRODUCTION_SCRAP_ITEM_MISMATCH");
    let inventoryItemId = manufacturingNullable(input.inventoryItemId) || requirement?.inventoryItemId || null;
    const warehouseId = manufacturingNullable(input.warehouseId) || requirement?.warehouseId || null;
    let stockMovementId: string | null = null;
    if (input.affectsInventory) {
      if (!inventoryItemId) inventoryItemId = (await requireManufacturingInventoryItem(tx, organizationId, input.catalogItemId)).id;
      const inventoryItem = await tx.enterpriseInventoryItem.findFirst({ where: { id: inventoryItemId, organizationId, catalogItemId: input.catalogItemId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
      if (!inventoryItem) throw new ManufacturingDomainError("L’article de stock du rebut ne correspond pas au catalogue sélectionné.", 400, "PRODUCTION_SCRAP_INVENTORY_ITEM_INVALID");
      if (!warehouseId) throw new ManufacturingDomainError("Un entrepôt est obligatoire lorsque le rebut affecte le stock.", 400, "PRODUCTION_SCRAP_WAREHOUSE_REQUIRED");
      await requireManufacturingWarehouse(tx, organizationId, warehouseId);
      const stock = await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId,
        warehouseId,
        storageLocationId: manufacturingNullable(input.storageLocationId),
        stockLotId: manufacturingNullable(input.stockLotId),
        movementType: "PRODUCTION_SCRAP",
        direction: "OUT",
        quantity: input.quantity,
        sourceEntityType: "EnterpriseProductionOrder",
        sourceEntityId: order.id,
        sourceLineId: requirement?.id || null,
        idempotencyKey: input.idempotencyKey,
        reason: manufacturingNullable(input.notes) || input.reasonCode,
      });
      stockMovementId = stock.movement.id;
    }
    const scrap = await tx.enterpriseProductionScrap.create({ data: {
      organizationId,
      productionOrderId: order.id,
      materialRequirementId: requirement?.id || null,
      catalogItemId: input.catalogItemId,
      inventoryItemId,
      warehouseId,
      quantity: manufacturingDecimal(input.quantity),
      reasonCode: input.reasonCode,
      notes: manufacturingNullable(input.notes),
      affectsInventory: input.affectsInventory,
      stockMovementId,
      idempotencyKey: input.idempotencyKey,
      createdByUserId: actorUserId,
    } });
    if (!requirement) {
      await tx.enterpriseProductionOrder.update({ where: { id: order.id }, data: { scrappedQuantity: order.scrappedQuantity.add(input.quantity).toDecimalPlaces(3), revision: { increment: 1 } } });
    }
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: "PRODUCTION_SCRAP_RECORDED", summary: `Rebut enregistré sur ${order.reference}.`, actorUserId, metadata: { scrapId: scrap.id, quantity: String(input.quantity), reasonCode: input.reasonCode, affectsInventory: input.affectsInventory, stockMovementId } });
    return { scrap, idempotent: false };
  });
}

export async function createShortagePurchase(organizationId: string, actorUserId: string, input: ShortagePurchaseInput) {
  const order = await prisma.enterpriseProductionOrder.findFirst({
    where: { id: input.productionOrderId, organizationId, archivedAt: null, status: { in: ["RELEASED", "IN_PROGRESS"] } },
    include: { requirements: true },
  });
  if (!order) throw new ManufacturingDomainError("Ordre de production introuvable ou non libéré.", 404, "PRODUCTION_ORDER_NOT_PURCHASABLE");
  const requirementById = new Map(order.requirements.map((requirement) => [requirement.id, requirement]));
  const selected = input.prices.map((price) => ({ price, requirement: requirementById.get(price.requirementId) })).filter((entry) => entry.requirement);
  if (selected.length !== input.prices.length) throw new ManufacturingDomainError("Un besoin matière sélectionné n’appartient pas à cet ordre.", 400, "PRODUCTION_SHORTAGE_REQUIREMENT_INVALID");
  if (selected.some(({ requirement }) => !requirement || requirement.shortageQuantity.lte(0))) throw new ManufacturingDomainError("Seuls les besoins actuellement en pénurie peuvent générer un achat.", 409, "PRODUCTION_SHORTAGE_REQUIRED");

  const existingPurchaseIds = [...new Set(selected.map(({ requirement }) => requirement?.purchaseId).filter((value): value is string => Boolean(value)))];
  if (existingPurchaseIds.length === 1 && selected.every(({ requirement }) => requirement?.purchaseId === existingPurchaseIds[0])) {
    const existing = await prisma.enterprisePurchase.findFirst({ where: { id: existingPurchaseIds[0], organizationId, archivedAt: null }, include: { items: true } });
    if (existing) return { purchase: existing, idempotent: true };
  }
  if (existingPurchaseIds.length) throw new ManufacturingDomainError("Certains besoins ont déjà été rattachés à un achat. Créez un achat uniquement pour les pénuries restantes.", 409, "PRODUCTION_SHORTAGE_ALREADY_PURCHASED");

  const catalogIds = [...new Set(selected.map(({ requirement }) => requirement!.catalogItemId))];
  const catalogItems = await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, id: { in: catalogIds }, status: "ACTIVE", archivedAt: null },
    include: { unitOfMeasure: { select: { code: true, symbol: true } } },
  });
  if (catalogItems.length !== catalogIds.length) throw new ManufacturingDomainError("Un composant en pénurie n’est plus disponible dans le catalogue actif.", 409, "PRODUCTION_SHORTAGE_CATALOG_INVALID");
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

  const purchase = await createEnterprisePurchase(organizationId, actorUserId, {
    title: `Réapprovisionnement production ${order.reference}`,
    description: `Pénuries matières générées depuis l’ordre ${order.reference}.`,
    priority: order.priority === "CRITICAL" ? "CRITICAL" : order.priority === "HIGH" ? "HIGH" : "NORMAL",
    supplierId: manufacturingNullable(input.supplierId) || "",
    buyerUserId: manufacturingNullable(input.buyerUserId) || "",
    departmentId: "",
    requestId: "",
    budgetLineId: "",
    siteId: "",
    destinationWarehouseId: order.materialWarehouseId,
    currency: input.currency,
    expectedAt: input.expectedAt?.toISOString() || "",
    sourceModule: "MATERIAL_REQUIREMENTS",
    sourceEntityType: "EnterpriseProductionOrder",
    sourceEntityId: order.id,
    items: selected.map(({ price, requirement }) => {
      const catalog = catalogById.get(requirement!.catalogItemId)!;
      return {
        catalogItemId: catalog.id,
        description: catalog.name,
        quantity: requirement!.shortageQuantity.toNumber(),
        unit: catalog.unitOfMeasure.symbol || catalog.unitOfMeasure.code,
        unitPrice: price.unitPrice,
        taxRate: price.taxRate,
        sourceEntityType: "EnterpriseProductionMaterialRequirement",
        sourceEntityId: requirement!.id,
      };
    }),
  });

  await prisma.$transaction(async (tx) => {
    for (const { requirement } of selected) {
      await tx.enterpriseProductionMaterialRequirement.updateMany({
        where: { id: requirement!.id, organizationId, purchaseId: null },
        data: { purchaseId: purchase.id, revision: { increment: 1 } },
      });
    }
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseProductionOrder", entityId: order.id, eventType: "PRODUCTION_SHORTAGE_PURCHASE_CREATED", summary: `Achat de réapprovisionnement créé pour ${order.reference}.`, actorUserId, metadata: { purchaseId: purchase.id, requirementIds: selected.map(({ requirement }) => requirement!.id) } });
  });
  return { purchase, idempotent: false };
}

export async function refreshProductionRequirements(organizationId: string, productionOrderId: string, actorUserId: string) {
  return withManufacturingSerializable(async (tx) => {
    await assertManufacturingOrganization(tx, organizationId);
    await assertActiveManufacturingMember(tx, organizationId, actorUserId);
    await requireProductionOrder(tx, organizationId, productionOrderId);
    return refreshMaterialRequirementsTx(tx, organizationId, productionOrderId);
  });
}