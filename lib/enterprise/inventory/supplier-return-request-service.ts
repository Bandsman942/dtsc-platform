import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertInventoryApprovalCandidate, assertInventoryApprovalDecision } from "@/lib/enterprise/inventory/approval";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { assertSupplierReturnAccess, inspectSupplierReturnTx } from "@/lib/enterprise/inventory/supplier-return-preflight";
import { enterprisePurchaseVisibilityWhere } from "@/lib/enterprise/procurement/access";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { idempotencyKey, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export const SUPPLIER_RETURN_TARGET = "EnterpriseSupplierReturnRequest";
export const supplierReturnRequestSchema = z.object({
  movementId: z.string().trim().min(1).max(191),
  quantity: z.string().trim().regex(/^\d{1,12}(?:\.\d{1,3})?$/),
  approverUserId: z.string().trim().min(1).max(191),
  reason: z.string().trim().min(8).max(2000),
  idempotencyKey: z.string().trim().min(8).max(180),
}).strict();
type SubmitInput = z.infer<typeof supplierReturnRequestSchema>;
type ApprovalParticipant = { requestedByUserId: string; approverUserId: string };

export async function requireSupplierReturnParticipantAccess(organizationId: string, userId: string, approve: boolean) {
  await assertSupplierReturnAccess(organizationId, userId, approve);
  const validations = await resolveEnterpriseModuleCapabilities({ organizationId, userId, moduleCode: "VALIDATIONS" });
  if (!validations.canRead || !validations.canSubmit) throw new EnterpriseDomainError("SUPPLIER_RETURN_VALIDATIONS_REQUIRED", 403);
  await requireWideScope(prisma, organizationId, userId);
}

async function requireWideScope(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  try {
    const scope = await retailInventoryVisibleSites(organizationId, userId, tx);
    if (scope.isolationEnabled) throw new Error("scoped");
  } catch {
    throw new EnterpriseDomainError("SUPPLIER_RETURN_PERMISSION_DENIED", 403);
  }
}

export async function assertSupplierReturnReviewAccess(organizationId: string, userId: string, approval: ApprovalParticipant) {
  if (![approval.requestedByUserId, approval.approverUserId].includes(userId)) throw new EnterpriseDomainError("SUPPLIER_RETURN_PERMISSION_DENIED", 403);
  await requireSupplierReturnParticipantAccess(organizationId, userId, userId === approval.approverUserId);
}

export async function supplierReturnApprovalCandidates(organizationId: string, requesterUserId: string) {
  await requireSupplierReturnParticipantAccess(organizationId, requesterUserId, false);
  const candidates = await listEnterpriseApprovalCandidates({ organizationId, requesterUserId, moduleCode: "INVENTORY_LOGISTICS" });
  const independent = candidates.candidates.filter((candidate) => candidate.userId !== requesterUserId);
  const verified = await Promise.all(independent.map(async (candidate) => {
    try {
      await requireSupplierReturnParticipantAccess(organizationId, candidate.userId, true);
      return candidate;
    } catch { return null; }
  }));
  return { candidates: verified.filter((candidate) => candidate !== null), selfApprovalOverrideAvailable: false };
}

async function serializeConflict<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    throw error;
  }
}

export async function submitSupplierReturnRequest(organizationId: string, purchaseId: string, actorUserId: string, input: SubmitInput) {
  if (actorUserId === input.approverUserId) throw new EnterpriseDomainError("SUPPLIER_RETURN_INDEPENDENT_REQUIRED", 403);
  if (!new Prisma.Decimal(input.quantity).gt(0)) throw new EnterpriseDomainError("SUPPLIER_RETURN_QUANTITY_INVALID", 400);
  await requireSupplierReturnParticipantAccess(organizationId, actorUserId, false);
  await requireSupplierReturnParticipantAccess(organizationId, input.approverUserId, true);
  await assertInventoryApprovalCandidate({ organizationId, requesterUserId: actorUserId, approverUserId: input.approverUserId });
  const purchaseAccess = await resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "SUPPLIERS_PURCHASES" });
  return serializeConflict(() => prisma.$transaction(async (tx) => {
    await requireWideScope(tx, organizationId, actorUserId);
    await requireWideScope(tx, organizationId, input.approverUserId);
    const purchase = await tx.enterprisePurchase.findFirst({
      where: { AND: [enterprisePurchaseVisibilityWhere({ organizationId, userId: actorUserId, canSeeAll: purchaseAccess.canApprove || purchaseAccess.canManage }), { id: purchaseId }] },
      select: { id: true, reference: true },
    });
    if (!purchase) throw new EnterpriseDomainError("SUPPLIER_RETURN_ORIGIN_INVALID", 404);
    const prior = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (prior) {
      const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: SUPPLIER_RETURN_TARGET, targetEntityId: prior.id, archivedAt: null } });
      if (!approval || prior.purchaseId !== purchaseId || prior.requestedByUserId !== actorUserId || prior.sourceMovementId !== input.movementId || !prior.quantity.equals(input.quantity) || prior.reason !== input.reason || approval.approverUserId !== input.approverUserId) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
      return { request: prior, approval, idempotent: true };
    }
    const origin = await tx.enterpriseStockMovement.findFirst({ where: { organizationId, id: input.movementId, movementType: "PURCHASE_RECEIPT", direction: "IN", sourceEntityType: "EnterprisePurchaseReceipt" }, select: { id: true, sourceEntityId: true, inventoryItemId: true, warehouseId: true, storageLocationId: true, stockLotId: true } });
    const receipt = origin?.sourceEntityId ? await tx.enterprisePurchaseReceipt.findFirst({ where: { organizationId, id: origin.sourceEntityId, purchaseId }, select: { id: true } }) : null;
    if (!origin?.stockLotId || !receipt) throw new EnterpriseDomainError("SUPPLIER_RETURN_ORIGIN_INVALID", 404);
    const check = await inspectSupplierReturnTx(tx, organizationId, actorUserId, { ...origin, supplierReturnSourceMovementId: origin.id, quantity: input.quantity });
    if (check.receipt.purchaseId !== purchaseId) throw new EnterpriseDomainError("SUPPLIER_RETURN_ORIGIN_INVALID", 404);
    const open = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, supplierInvoiceId: check.invoice.id, status: { in: ["PENDING_APPROVAL", "APPROVED", "DISPATCHED", "RECONCILED"] } }, select: { id: true } });
    if (open) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_ALREADY_OPEN");
    const request = await tx.enterpriseSupplierReturnRequest.create({ data: {
      organizationId, reference: "RTV-" + randomUUID().slice(0, 12).toUpperCase(), purchaseId,
      receiptId: check.receipt.id, receiptItemId: check.receiptItem.id, sourceMovementId: origin.id,
      inventoryItemId: origin.inventoryItemId, warehouseId: origin.warehouseId, storageLocationId: origin.storageLocationId,
      stockLotId: origin.stockLotId, supplierId: check.invoice.supplierId, supplierInvoiceId: check.invoice.id, supplierInvoiceItemId: check.invoiceItem.id,
      receiptAccountingEventId: check.receiptValue.id, originCostLayerId: check.originLayer.id,
      quantity: input.quantity, unitCost: check.unitCost, totalCost: check.totalCost, currencyCode: check.currencyCode,
      reason: input.reason, requestedByUserId: actorUserId, idempotencyKey: input.idempotencyKey,
    } });
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: SUPPLIER_RETURN_TARGET, targetEntityId: request.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId, status: "PENDING" } });
    // Store the immutable review at submission; never reconstruct from later
    // changing labels or amounts. Approval is not dispatch or accounting.
    const [item, lot, warehouse, location] = await Promise.all([
      tx.enterpriseInventoryItem.findFirstOrThrow({ where: { organizationId, id: request.inventoryItemId }, select: { catalogItem: { select: { code: true, name: true } } } }),
      tx.enterpriseStockLot.findFirstOrThrow({ where: { organizationId, id: request.stockLotId }, select: { lotNumber: true } }),
      tx.enterpriseWarehouse.findFirstOrThrow({ where: { organizationId, id: request.warehouseId }, select: { code: true, name: true } }),
      request.storageLocationId ? tx.enterpriseStorageLocation.findFirst({ where: { organizationId, id: request.storageLocationId }, select: { code: true, name: true } }) : Promise.resolve(null),
    ]);
    await tx.enterpriseApprovalSubmissionVersion.create({ data: {
      organizationId, approvalId: approval.id, versionNumber: 1, submittedByUserId: actorUserId,
      snapshotJson: { reference: request.reference, article: item.catalogItem.code + " · " + item.catalogItem.name, lotNumber: lot.lotNumber, warehouse: warehouse.code + " · " + warehouse.name,
        location: location ? location.code + " · " + location.name : null, purchaseReference: purchase.reference, receiptReference: check.receipt.reference,
        supplierInvoiceReference: check.invoice.number, quantity: request.quantity.toFixed(), unitCost: request.unitCost.toFixed(), totalAmount: request.totalCost.toFixed(),
        currency: request.currencyCode, reason: request.reason, revision: request.revision },
    } });
    await tx.enterpriseEntityLink.create({ data: { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: SUPPLIER_RETURN_TARGET, sourceEntityId: request.id,
      targetModule: "VALIDATIONS", targetEntityType: "EnterpriseApproval", targetEntityId: approval.id, linkType: "REQUIRES_APPROVAL", createdById: actorUserId } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: SUPPLIER_RETURN_TARGET, entityId: request.id, eventType: "SUPPLIER_RETURN_REQUESTED", summary: request.reference, actorUserId, toStatus: "PENDING_APPROVAL" });
    return { request, approval, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export async function decideSupplierReturnRequest(args: { organizationId: string; approvalId: string; actorUserId: string; action: "APPROVE" | "REJECT" | "CANCEL"; revision: number; decisionComment?: string | null; reviewedVersionId?: string | null }) {
  const { organizationId, approvalId, actorUserId } = args;
  const candidate = await prisma.enterpriseApproval.findFirst({ where: { organizationId, id: approvalId, targetEntityType: SUPPLIER_RETURN_TARGET, archivedAt: null, status: "PENDING" } });
  if (!candidate) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
  if (args.action === "CANCEL" ? candidate.requestedByUserId !== actorUserId : candidate.requestedByUserId === actorUserId || candidate.approverUserId !== actorUserId) throw new EnterpriseDomainError("SUPPLIER_RETURN_INDEPENDENT_REQUIRED", 403);
  await assertSupplierReturnReviewAccess(organizationId, actorUserId, candidate);
  if (args.action !== "CANCEL") await assertInventoryApprovalDecision({ organizationId, requesterUserId: candidate.requestedByUserId, approverUserId: candidate.approverUserId, actorUserId });
  if (args.action === "REJECT" && !args.decisionComment?.trim()) throw new EnterpriseDomainError("SUPPLIER_RETURN_REASON_REQUIRED", 400);
  return serializeConflict(() => prisma.$transaction(async (tx) => {
    await requireWideScope(tx, organizationId, actorUserId);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, id: approvalId, targetEntityType: SUPPLIER_RETURN_TARGET, status: "PENDING", archivedAt: null, revision: args.revision } });
    if (!approval || (args.action === "CANCEL" ? approval.requestedByUserId !== actorUserId : approval.approverUserId !== actorUserId || approval.requestedByUserId === actorUserId)) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    const request = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, id: approval.targetEntityId, status: "PENDING_APPROVAL", requestedByUserId: approval.requestedByUserId } });
    if (!request) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    const version = await tx.enterpriseApprovalSubmissionVersion.findFirst({ where: { organizationId, approvalId, versionNumber: 1 } });
    if (!version || (args.action !== "CANCEL" && version.id !== args.reviewedVersionId)) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    if (args.action === "APPROVE") {
      const check = await inspectSupplierReturnTx(tx, organizationId, actorUserId, { ...request, supplierReturnSourceMovementId: request.sourceMovementId });
      if (check.receipt.purchaseId !== request.purchaseId || check.receipt.id !== request.receiptId || check.receiptItem.id !== request.receiptItemId ||
        check.invoice.id !== request.supplierInvoiceId || check.invoiceItem.id !== request.supplierInvoiceItemId || check.invoice.supplierId !== request.supplierId ||
        check.receiptValue.id !== request.receiptAccountingEventId || check.originLayer.id !== request.originCostLayerId ||
        !check.unitCost.equals(request.unitCost) || !check.totalCost.equals(request.totalCost) || check.currencyCode !== request.currencyCode) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    }
    const status = args.action === "APPROVE" ? "APPROVED" : args.action === "REJECT" ? "REJECTED" : "CANCELLED";
    const now = new Date();
    const [updated, decided] = await Promise.all([
      tx.enterpriseSupplierReturnRequest.updateMany({ where: { organizationId, id: request.id, status: "PENDING_APPROVAL", revision: request.revision }, data: { status, decidedAt: now, revision: { increment: 1 } } }),
      tx.enterpriseApproval.updateMany({ where: { organizationId, id: approval.id, status: "PENDING", revision: args.revision }, data: { status, decidedAt: now, decisionComment: args.decisionComment || null, revision: { increment: 1 } } }),
    ]);
    if (updated.count !== 1 || decided.count !== 1) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    if (args.action !== "CANCEL") await tx.enterpriseApprovalDecision.create({ data: { organizationId, approvalId, submissionVersionId: version.id, actorUserId, decision: args.action, reason: args.decisionComment || null, idempotencyKey: "supplier-return-review:" + approval.id + ":" + version.id } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: SUPPLIER_RETURN_TARGET, entityId: request.id, eventType: "SUPPLIER_RETURN_" + status, summary: request.reference, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: status, metadataJson: { approvalId, physicallyDispatched: false } });
    return { requestId: request.id, status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export const supplierReturnDispatchSchema = z.object({
  requestId: z.string().trim().min(1).max(191),
  revision: z.number().int().positive(),
  dispatchReference: z.string().trim().min(5).max(200),
}).strict();
type DispatchInput = z.infer<typeof supplierReturnDispatchSchema>;

/** Dispatch remains distinct from independent review. The requester records the
 * actual shipment reference; no credit, payable or money is changed here. */
export async function dispatchSupplierReturn(organizationId: string, purchaseId: string, actorUserId: string, input: DispatchInput) {
  await requireSupplierReturnParticipantAccess(organizationId, actorUserId, false);
  const financialAccess = await resolveEnterpriseModuleCapabilities({ organizationId, userId: actorUserId, moduleCode: "FINANCE_INVENTORY" });
  if (!financialAccess.canManage) throw new EnterpriseDomainError("SUPPLIER_RETURN_DISPATCH_DENIED", 403);
  return serializeConflict(() => prisma.$transaction(async (tx) => {
    await requireWideScope(tx, organizationId, actorUserId);
    const request = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, id: input.requestId, purchaseId, requestedByUserId: actorUserId } });
    if (!request) throw new EnterpriseDomainError("SUPPLIER_RETURN_DISPATCH_DENIED", 403);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: SUPPLIER_RETURN_TARGET, targetEntityId: request.id, status: "APPROVED", archivedAt: null, requestedByUserId: actorUserId } });
    if (!approval || approval.approverUserId === actorUserId) throw new EnterpriseDomainError("SUPPLIER_RETURN_DISPATCH_DENIED", 403);
    if (request.status === "DISPATCHED" && request.dispatchReference === input.dispatchReference && request.revision === input.revision + 1 && request.dispatchMovementId && request.dispatchAccountingEventId && request.dispatchedByUserId === actorUserId) return { request, idempotent: true };
    if (request.status !== "APPROVED" || request.revision !== input.revision) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    // A decision record over the immutable reviewed version is mandatory.
    const decision = await tx.enterpriseApprovalDecision.findFirst({ where: { organizationId, approvalId: approval.id, actorUserId: approval.approverUserId, decision: "APPROVE" } });
    if (!decision) throw new EnterpriseDomainError("SUPPLIER_RETURN_DISPATCH_DENIED", 403);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${request.supplierInvoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const check = await inspectSupplierReturnTx(tx, organizationId, actorUserId, { ...request, supplierReturnSourceMovementId: request.sourceMovementId });
    if (check.receipt.purchaseId !== request.purchaseId || check.receipt.id !== request.receiptId || check.receiptItem.id !== request.receiptItemId ||
      check.invoice.id !== request.supplierInvoiceId || check.invoiceItem.id !== request.supplierInvoiceItemId || check.invoice.supplierId !== request.supplierId ||
      check.receiptValue.id !== request.receiptAccountingEventId || check.originLayer.id !== request.originCostLayerId ||
      !check.unitCost.equals(request.unitCost) || !check.totalCost.equals(request.totalCost) || check.currencyCode !== request.currencyCode) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    // Paid or insufficient payable requires a different reconciliation/refund
    // path. Do not create a dispatch that the current credit engine cannot close.
    const payable = await tx.enterprisePayable.findUnique({ where: { supplierInvoiceId: request.supplierInvoiceId } });
    if (!payable || payable.organizationId !== organizationId || payable.outstandingAmount.lt(request.totalCost)) throw new EnterpriseDomainError("SUPPLIER_RETURN_PAYABLE_INSUFFICIENT",409);
    const movement = await applyStockMovementTx(tx, organizationId, actorUserId, {
      inventoryItemId: request.inventoryItemId, warehouseId: request.warehouseId, storageLocationId: request.storageLocationId,
      stockLotId: request.stockLotId, movementType: "SUPPLIER_RETURN_OUT", direction: "OUT", quantity: Number(request.quantity.toFixed()),
      sourceEntityType: SUPPLIER_RETURN_TARGET, sourceEntityId: request.id, sourceLineId: request.receiptItemId,
      idempotencyKey: "supplier-return:" + request.id + ":dispatch", reason: request.reason,
    }, { approvedSupplierReturnId: request.id });
    if (movement.idempotent) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    // Same-cost CUMP preflight proves exact removal from the original layer
    // without changing the cost of other batches.
    const updatedLayer = await tx.enterpriseInventoryCostLayer.updateMany({
      where: { organizationId, id: request.originCostLayerId, remainingQuantity: { equals: check.originLayer.remainingQuantity, gte: request.quantity } },
      data: { remainingQuantity: { decrement: request.quantity } },
    });
    if (updatedLayer.count !== 1) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    const postingEvent = "INVENTORY_SUPPLIER_RETURN_VALUED" as const;
    const event = await tx.enterpriseInventoryAccountingEvent.create({ data: {
      organizationId, inventoryItemId: request.inventoryItemId, stockMovementId: movement.movement.id, eventType: "SUPPLIER_RETURN", quantity: request.quantity,
      unitCost: request.unitCost, totalCost: request.totalCost, currencyCode: request.currencyCode, status: "APPROVED",
      idempotencyKey: idempotencyKey({ organizationId, sourceEntityType: "EnterpriseStockMovement", sourceEntityId: movement.movement.id, postingEvent, postingVersion: 1 }),
    } });
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, { postingEvent, sourceEntityType: "EnterpriseInventoryAccountingEvent", sourceEntityId: event.id });
    await tx.enterpriseInventoryAccountingEvent.update({ where: { id: event.id }, data: { status: "POSTED", journalEntryId: posting.entry.id } });
    const changed = await tx.enterpriseSupplierReturnRequest.updateMany({ where: { organizationId, id: request.id, status: "APPROVED", revision: input.revision }, data: {
      status: "DISPATCHED", dispatchedAt: event.createdAt, dispatchedByUserId: actorUserId, dispatchReference: input.dispatchReference,
      dispatchMovementId: movement.movement.id, dispatchAccountingEventId: event.id, revision: { increment: 1 },
    } });
    if (changed.count !== 1) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    await publishFinanceEvent(tx, { organizationId, entityType: SUPPLIER_RETURN_TARGET, entityId: request.id, eventType: "SUPPLIER_RETURN_DISPATCHED", summary: request.reference, actorUserId, fromStatus: "APPROVED", toStatus: "DISPATCHED", metadataJson: { stockMovementId: movement.movement.id, journalEntryId: posting.entry.id, total: request.totalCost.toFixed(), currency: request.currencyCode, dispatchReference: input.dispatchReference } });
    return { request: await tx.enterpriseSupplierReturnRequest.findFirstOrThrow({ where: { organizationId, id: request.id } }), idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export const supplierReturnWithdrawalSchema = z.object({
  requestId: z.string().trim().min(1).max(191),
  revision: z.number().int().positive(),
  reason: z.string().trim().min(8).max(2000),
}).strict();
type WithdrawalInput = z.infer<typeof supplierReturnWithdrawalSchema>;

/** Withdraw a previously approved, unexecuted authorization. Do not rewrite
 * the approval or reviewed snapshot and never change stock or the ledger. */
export async function withdrawApprovedSupplierReturn(organizationId: string, purchaseId: string, actorUserId: string, input: WithdrawalInput) {
  await requireSupplierReturnParticipantAccess(organizationId,actorUserId,false);
  return serializeConflict(() => prisma.$transaction(async tx => {
    await requireWideScope(tx,organizationId,actorUserId);
    const request = await tx.enterpriseSupplierReturnRequest.findFirst({where:{organizationId,id:input.requestId,purchaseId,requestedByUserId:actorUserId}});
    if (!request) throw new EnterpriseDomainError("SUPPLIER_RETURN_PERMISSION_DENIED",403);
    const approval = await tx.enterpriseApproval.findFirst({where:{organizationId,targetEntityType:SUPPLIER_RETURN_TARGET,targetEntityId:request.id,status:"APPROVED",archivedAt:null,requestedByUserId:actorUserId}});
    if (!approval || approval.approverUserId===actorUserId) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    if (request.status==="CANCELLED" && request.cancelledAfterApprovalByUserId===actorUserId && request.cancellationReason===input.reason && request.revision===input.revision+1) return {request,approval,idempotent:true};
    if (request.status!=="APPROVED" || request.revision!==input.revision || request.dispatchedAt || request.dispatchMovementId || request.dispatchAccountingEventId || request.supplierCreditNoteId) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_WITHDRAWAL_NOT_ALLOWED");
    const decision=await tx.enterpriseApprovalDecision.findFirst({where:{organizationId,approvalId:approval.id,actorUserId:approval.approverUserId,decision:"APPROVE"}});
    if (!decision) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    if (await tx.enterpriseStockMovement.count({where:{organizationId,sourceEntityType:SUPPLIER_RETURN_TARGET,sourceEntityId:request.id}})) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_WITHDRAWAL_NOT_ALLOWED");
    const changed=await tx.enterpriseSupplierReturnRequest.updateMany({where:{organizationId,id:request.id,status:"APPROVED",revision:input.revision,dispatchMovementId:null,dispatchAccountingEventId:null,supplierCreditNoteId:null},
      data:{status:"CANCELLED",cancelledAfterApprovalAt:new Date(),cancelledAfterApprovalByUserId:actorUserId,cancellationReason:input.reason,revision:{increment:1}}});
    if(changed.count!==1) throw new EnterpriseDomainConflictError("SUPPLIER_RETURN_CONFLICT");
    await publishEnterpriseEvent(tx,{organizationId,entityType:SUPPLIER_RETURN_TARGET,entityId:request.id,eventType:"SUPPLIER_RETURN_APPROVED_WITHDRAWN",summary:request.reference,actorUserId,fromStatus:"APPROVED",toStatus:"CANCELLED",metadataJson:{approvalId:approval.id,decisionId:decision.id,reason:input.reason,physicallyDispatched:false}});
    return {request:await tx.enterpriseSupplierReturnRequest.findFirstOrThrow({where:{organizationId,id:request.id}}),approval,idempotent:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000}));
}
