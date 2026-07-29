import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { ENTERPRISE_PURCHASE_TRANSITIONS } from "@/lib/enterprise/procurement/constants";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { prisma } from "@/lib/prisma";
import {
  addEnterpriseOperationalEvent,
  createEnterpriseLink,
  enterpriseSourceEntityExists,
  nullable,
  requireActiveEnterpriseMember,
  requireEnterpriseDepartment,
  requireEnterpriseSourceReference,
  type ProcurementTransaction,
} from "@/lib/enterprise/procurement/shared";
import type {
  enterprisePurchaseActionSchema,
  enterprisePurchaseCreateSchema,
  enterprisePurchaseReceiptSchema,
  enterprisePurchaseUpdateSchema,
} from "@/lib/enterprise/procurement/validators";

type PurchaseCreateInput = z.infer<typeof enterprisePurchaseCreateSchema>;
type PurchaseUpdateInput = z.infer<typeof enterprisePurchaseUpdateSchema>;
type PurchaseActionInput = z.infer<typeof enterprisePurchaseActionSchema>;
type PurchaseReceiptInput = z.infer<typeof enterprisePurchaseReceiptSchema>;
type PurchaseItemInput = PurchaseCreateInput["items"][number];

function dateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}

function purchaseReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PUR-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function receiptReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `REC-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function money(value: number | string | Prisma.Decimal) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function quantity(value: number | string | Prisma.Decimal) {
  return new Prisma.Decimal(value).toDecimalPlaces(3);
}

async function preparePurchaseItems(tx: ProcurementTransaction, organizationId: string, items: PurchaseItemInput[]) {
  const prepared = [];
  let subtotalAmount = money(0);
  let taxAmount = money(0);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const hasSourceType = Boolean(nullable(item.sourceEntityType));
    const hasSourceId = Boolean(nullable(item.sourceEntityId));
    if (hasSourceType !== hasSourceId) throw new EnterpriseCoreV2Error("La source d’une ligne doit préciser type et identifiant.", 400, "INCOMPLETE_PURCHASE_ITEM_SOURCE");
    if (hasSourceType && hasSourceId && !(await enterpriseSourceEntityExists(tx, organizationId, item.sourceEntityType!, item.sourceEntityId!))) {
      throw new EnterpriseCoreV2Error("Une ligne d’achat référence un objet d’une autre organisation.", 400, "CROSS_TENANT_PURCHASE_ITEM_SOURCE");
    }
    const itemQuantity = quantity(item.quantity);
    const unitPrice = money(item.unitPrice);
    const taxRate = new Prisma.Decimal(item.taxRate || 0).toDecimalPlaces(4);
    const lineSubtotal = itemQuantity.mul(unitPrice).toDecimalPlaces(2);
    const lineTax = lineSubtotal.mul(taxRate).div(100).toDecimalPlaces(2);
    const lineTotal = lineSubtotal.add(lineTax).toDecimalPlaces(2);
    subtotalAmount = subtotalAmount.add(lineSubtotal).toDecimalPlaces(2);
    taxAmount = taxAmount.add(lineTax).toDecimalPlaces(2);
    prepared.push({
      organizationId,
      description: item.description,
      quantity: itemQuantity,
      unit: item.unit,
      unitPrice,
      taxRate,
      lineSubtotal,
      taxAmount: lineTax,
      lineTotal,
      sourceEntityType: nullable(item.sourceEntityType),
      sourceEntityId: nullable(item.sourceEntityId),
      sortOrder: index,
    });
  }
  return { items: prepared, subtotalAmount, taxAmount, totalAmount: subtotalAmount.add(taxAmount).toDecimalPlaces(2) };
}

async function requireSupplier(tx: ProcurementTransaction, organizationId: string, supplierId?: string | null, activeOnly = false) {
  const id = nullable(supplierId);
  if (!id) return null;
  const supplier = await tx.enterpriseSupplier.findFirst({ where: { id, organizationId, archivedAt: null, ...(activeOnly ? { status: "ACTIVE" } : {}) } });
  if (!supplier) throw new EnterpriseCoreV2Error(activeOnly ? "Seul un fournisseur actif de cette entreprise peut être utilisé." : "Le fournisseur sélectionné n’appartient pas à cette entreprise.", 400, activeOnly ? "ACTIVE_SUPPLIER_REQUIRED" : "INVALID_PURCHASE_SUPPLIER");
  return supplier;
}

async function requireRequest(tx: ProcurementTransaction, organizationId: string, requestId?: string | null) {
  const id = nullable(requestId);
  if (!id) return null;
  const request = await tx.enterpriseRequest.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!request) throw new EnterpriseCoreV2Error("La demande source n’appartient pas à cette entreprise.", 400, "INVALID_PURCHASE_REQUEST");
  return request;
}

export async function createEnterprisePurchase(organizationId: string, actorUserId: string, input: PurchaseCreateInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    if (input.buyerUserId) await requireActiveEnterpriseMember(tx, organizationId, input.buyerUserId);
    await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const supplier = await requireSupplier(tx, organizationId, input.supplierId, false);
    const request = await requireRequest(tx, organizationId, input.requestId);
    const source = await requireEnterpriseSourceReference(tx, organizationId, input);
    const calculated = await preparePurchaseItems(tx, organizationId, input.items);
    const purchase = await tx.enterprisePurchase.create({
      data: {
        organizationId,
        reference: purchaseReference(),
        title: input.title,
        description: nullable(input.description),
        status: "DRAFT",
        priority: input.priority,
        supplierId: supplier?.id || null,
        requestedByUserId: actorUserId,
        buyerUserId: nullable(input.buyerUserId),
        departmentId: nullable(input.departmentId),
        requestId: request?.id || null,
        currency: input.currency,
        subtotalAmount: calculated.subtotalAmount,
        taxAmount: calculated.taxAmount,
        totalAmount: calculated.totalAmount,
        expectedAt: dateOrNull(input.expectedAt),
        sourceModule: source?.sourceModule || null,
        sourceEntityType: source?.sourceEntityType || null,
        sourceEntityId: source?.sourceEntityId || null,
        createdByUserId: actorUserId,
        items: { create: calculated.items },
      },
      include: { items: true, supplier: true, receipts: true },
    });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchase.id, eventType: "ENTERPRISE_PURCHASE_CREATED", summary: "Achat créé en brouillon.", actorUserId, toStatus: "DRAFT", metadata: { totalAmount: purchase.totalAmount.toString(), currency: purchase.currency } });
    if (request) await createEnterpriseLink(tx, { organizationId, sourceModule: "INTERNAL_REQUESTS", sourceEntityType: "EnterpriseRequest", sourceEntityId: request.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase.id, linkType: "GENERATED_PURCHASE", createdById: actorUserId });
    if (supplier) await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterpriseSupplier", sourceEntityId: supplier.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase.id, linkType: "SUPPLIER", createdById: actorUserId });
    if (source) await createEnterpriseLink(tx, { organizationId, sourceModule: source.sourceModule, sourceEntityType: source.sourceEntityType, sourceEntityId: source.sourceEntityId, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase.id, linkType: "GENERATED", createdById: actorUserId });
    return purchase;
  });
}

export async function updateEnterprisePurchase(organizationId: string, purchaseId: string, actorUserId: string, input: PurchaseUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
    if (existing.status !== "DRAFT") throw new EnterpriseCoreV2Error("Seul un achat en brouillon peut être modifié librement.", 409, "PURCHASE_NOT_EDITABLE");
    if (input.buyerUserId) await requireActiveEnterpriseMember(tx, organizationId, input.buyerUserId);
    if (input.departmentId) await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const supplier = input.supplierId !== undefined ? await requireSupplier(tx, organizationId, input.supplierId, false) : null;
    const calculated = input.items ? await preparePurchaseItems(tx, organizationId, input.items) : null;
    const updated = await tx.enterprisePurchase.updateMany({
      where: { id: purchaseId, organizationId, status: "DRAFT", revision: input.revision, archivedAt: null },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.supplierId !== undefined ? { supplierId: supplier?.id || null } : {}),
        ...(input.buyerUserId !== undefined ? { buyerUserId: nullable(input.buyerUserId) } : {}),
        ...(input.departmentId !== undefined ? { departmentId: nullable(input.departmentId) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.expectedAt !== undefined ? { expectedAt: dateOrNull(input.expectedAt) } : {}),
        ...(calculated ? { subtotalAmount: calculated.subtotalAmount, taxAmount: calculated.taxAmount, totalAmount: calculated.totalAmount } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("L’achat a été modifié par un autre utilisateur.", 409, "REVISION_CONFLICT");
    if (calculated) {
      await tx.enterprisePurchaseItem.deleteMany({ where: { organizationId, purchaseId } });
      await tx.enterprisePurchaseItem.createMany({ data: calculated.items.map((item) => ({ ...item, purchaseId })) });
    }
    if (input.supplierId !== undefined && supplier) await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterpriseSupplier", sourceEntityId: supplier.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, linkType: "SUPPLIER", createdById: actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType: "ENTERPRISE_PURCHASE_UPDATED", summary: "Achat mis à jour.", actorUserId, fromStatus: "DRAFT", toStatus: "DRAFT" });
    return tx.enterprisePurchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true, receipts: { include: { items: true } } } });
  });
}

export async function createEnterprisePurchaseApproval({
  organizationId,
  purchaseId,
  actorUserId,
  approverUserId,
  purchaseRevision,
}: {
  organizationId: string;
  purchaseId: string;
  actorUserId: string;
  approverUserId: string;
  purchaseRevision?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null }, include: { items: true } });
    if (!purchase) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
    if (purchase.status !== "DRAFT") throw new EnterpriseCoreV2Error("L’achat doit être en brouillon avant soumission.", 409, "INVALID_PURCHASE_SUBMIT_STATE");
    if (!purchase.items.length) throw new EnterpriseCoreV2Error("Un achat doit comporter au moins une ligne.", 400, "PURCHASE_ITEMS_REQUIRED");
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    await requireActiveEnterpriseMember(tx, organizationId, approverUserId);
    await requireSupplier(tx, organizationId, purchase.supplierId, true);
    if (purchase.requestedByUserId === approverUserId) throw new EnterpriseCoreV2Error("Le demandeur de l’achat ne peut pas approuver son propre achat.", 403, "SELF_APPROVAL_DENIED");
    const pending = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, status: "PENDING", archivedAt: null }, select: { id: true } });
    if (pending) throw new EnterpriseCoreV2Error("Une validation est déjà en attente pour cet achat.", 409, "PENDING_APPROVAL_EXISTS");
    const expectedRevision = purchaseRevision ?? purchase.revision;
    const promoted = await tx.enterprisePurchase.updateMany({ where: { id: purchaseId, organizationId, status: "DRAFT", revision: expectedRevision, archivedAt: null }, data: { status: "PENDING_APPROVAL", updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (promoted.count !== 1) throw new EnterpriseCoreV2Error("L’achat a changé pendant sa soumission.", 409, "REVISION_CONFLICT");
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, requestedByUserId: purchase.requestedByUserId, approverUserId, status: "PENDING" } });
    await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterprisePurchase", sourceEntityId: purchaseId, targetModule: "VALIDATIONS", targetEntityType: "EnterpriseApproval", targetEntityId: approval.id, linkType: "REQUIRES_APPROVAL", createdById: actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType: "ENTERPRISE_PURCHASE_SUBMITTED", summary: "Achat soumis pour approbation.", actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL" });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approval.id, eventType: "ENTERPRISE_APPROVAL_REQUESTED", summary: "Validation d’achat demandée.", actorUserId, toStatus: "PENDING", metadata: { targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId } });
    return approval;
  });
}

export async function decideEnterprisePurchaseApproval({
  organizationId,
  approvalId,
  actorUserId,
  action,
  revision,
  decisionComment,
  canManage,
}: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  action: "APPROVE" | "REJECT" | "CANCEL";
  revision: number;
  decisionComment?: string | null;
  canManage: boolean;
}) {
  if (action === "REJECT" && !nullable(decisionComment)) throw new EnterpriseCoreV2Error("Un motif est obligatoire pour rejeter une validation.", 400, "REJECTION_REASON_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, targetEntityType: "EnterprisePurchase", archivedAt: null } });
    if (!approval) throw new EnterpriseCoreV2Error("Validation d’achat introuvable.", 404, "APPROVAL_NOT_FOUND");
    if (approval.status !== "PENDING") throw new EnterpriseCoreV2Error("Cette validation a déjà été décidée.", 409, "APPROVAL_ALREADY_DECIDED");
    if (action === "APPROVE" || action === "REJECT") {
      if (approval.approverUserId !== actorUserId) throw new EnterpriseCoreV2Error("Seul l’approbateur désigné peut décider cet achat.", 403, "WRONG_APPROVER");
      if (approval.requestedByUserId === actorUserId) throw new EnterpriseCoreV2Error("L’auto-approbation est interdite.", 403, "SELF_APPROVAL_DENIED");
    } else if (approval.requestedByUserId !== actorUserId && !canManage) {
      throw new EnterpriseCoreV2Error("Vous ne pouvez pas annuler cette validation.", 403, "APPROVAL_CANCEL_DENIED");
    }
    const purchase = await tx.enterprisePurchase.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null } });
    if (!purchase || purchase.status !== "PENDING_APPROVAL") throw new EnterpriseCoreV2Error("L’achat cible n’est plus en attente d’approbation.", 409, "APPROVAL_TARGET_CONFLICT");
    const approvalStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
    const purchaseStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "DRAFT";
    const approvalUpdated = await tx.enterpriseApproval.updateMany({ where: { id: approvalId, organizationId, status: "PENDING", revision, archivedAt: null }, data: { status: approvalStatus, decidedAt: action === "CANCEL" ? null : new Date(), decisionComment: nullable(decisionComment), revision: { increment: 1 } } });
    if (approvalUpdated.count !== 1) throw new EnterpriseCoreV2Error("La validation a été décidée simultanément.", 409, "APPROVAL_DECISION_CONFLICT");
    const purchaseUpdated = await tx.enterprisePurchase.updateMany({ where: { id: purchase.id, organizationId, status: "PENDING_APPROVAL", revision: purchase.revision, archivedAt: null }, data: { status: purchaseStatus, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (purchaseUpdated.count !== 1) throw new EnterpriseCoreV2Error("L’achat a changé pendant la décision.", 409, "APPROVAL_TARGET_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approvalId, eventType: action === "APPROVE" ? "ENTERPRISE_APPROVAL_APPROVED" : action === "REJECT" ? "ENTERPRISE_APPROVAL_REJECTED" : "ENTERPRISE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || `Validation ${approvalStatus.toLowerCase()}.`, actorUserId, fromStatus: "PENDING", toStatus: approvalStatus });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchase.id, eventType: action === "APPROVE" ? "ENTERPRISE_PURCHASE_APPROVED" : action === "REJECT" ? "ENTERPRISE_PURCHASE_REJECTED" : "ENTERPRISE_PURCHASE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || (action === "APPROVE" ? "Achat approuvé." : action === "REJECT" ? "Achat rejeté." : "Validation de l’achat annulée."), actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: purchaseStatus });
    return tx.enterpriseApproval.findUnique({ where: { id: approvalId } });
  });
}

export async function transitionEnterprisePurchase(organizationId: string, purchaseId: string, actorUserId: string, input: PurchaseActionInput) {
  if (input.action === "SUBMIT") {
    if (!input.approverUserId) throw new EnterpriseCoreV2Error("Un approbateur est obligatoire.", 400, "APPROVER_REQUIRED");
    return createEnterprisePurchaseApproval({ organizationId, purchaseId, actorUserId, approverUserId: input.approverUserId, purchaseRevision: input.revision });
  }
  const transition = ENTERPRISE_PURCHASE_TRANSITIONS[input.action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition d’achat n’est pas autorisée.", 409, "INVALID_PURCHASE_TRANSITION");
    if (input.action === "ORDER") await requireSupplier(tx, organizationId, existing.supplierId, true);
    const updated = await tx.enterprisePurchase.updateMany({
      where: { id: purchaseId, organizationId, status: existing.status, revision: input.revision, archivedAt: null },
      data: {
        ...(transition.to ? { status: transition.to } : {}),
        ...(input.action === "ORDER" ? { orderedAt: new Date() } : {}),
        ...(input.action === "CLOSE" ? { closedAt: new Date() } : {}),
        ...(input.action === "ARCHIVE" ? { archivedAt: new Date() } : {}),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("L’achat a été modifié simultanément.", 409, "REVISION_CONFLICT");
    const eventType = input.action === "ORDER" ? "ENTERPRISE_PURCHASE_ORDERED" : input.action === "CLOSE" ? "ENTERPRISE_PURCHASE_CLOSED" : input.action === "CANCEL" ? "ENTERPRISE_PURCHASE_CANCELLED" : "ENTERPRISE_PURCHASE_ARCHIVED";
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType, summary: nullable(input.comment) || `Action ${input.action} appliquée à l’achat.`, actorUserId, fromStatus: existing.status, toStatus: transition.to || existing.status });
    return tx.enterprisePurchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true, receipts: { include: { items: true } } } });
  });
}

export async function receiveEnterprisePurchase(organizationId: string, purchaseId: string, actorUserId: string, input: PurchaseReceiptInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    const purchase = await tx.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null }, include: { items: true } });
    if (!purchase) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchase.status)) throw new EnterpriseCoreV2Error("Cet achat n’est pas en état de réception.", 409, "INVALID_PURCHASE_RECEIPT_STATE");
    const uniqueItemIds = new Set(input.items.map((item) => item.purchaseItemId));
    if (uniqueItemIds.size !== input.items.length) throw new EnterpriseCoreV2Error("Une ligne d’achat ne peut apparaître qu’une fois dans la réception.", 400, "DUPLICATE_RECEIPT_ITEM");
    const itemMap = new Map(purchase.items.map((item) => [item.id, item]));
    for (const inputItem of input.items) if (!itemMap.has(inputItem.purchaseItemId)) throw new EnterpriseCoreV2Error("Une ligne de réception n’appartient pas à cet achat.", 400, "CROSS_TENANT_RECEIPT_ITEM");
    const prior = await tx.enterprisePurchaseReceiptItem.groupBy({ by: ["purchaseItemId"], where: { organizationId, purchaseItemId: { in: purchase.items.map((item) => item.id) } }, _sum: { quantityReceived: true } });
    const receivedMap = new Map(prior.map((entry) => [entry.purchaseItemId, quantity(entry._sum.quantityReceived || 0)]));
    for (const inputItem of input.items) {
      const ordered = quantity(itemMap.get(inputItem.purchaseItemId)!.quantity);
      const previous = receivedMap.get(inputItem.purchaseItemId) || quantity(0);
      const next = previous.add(quantity(inputItem.quantityReceived));
      if (next.gt(ordered)) throw new EnterpriseCoreV2Error("La quantité reçue ne peut pas dépasser la quantité commandée.", 409, "PURCHASE_OVER_RECEIPT");
      receivedMap.set(inputItem.purchaseItemId, next);
    }
    const fullyReceived = purchase.items.every((item) => (receivedMap.get(item.id) || quantity(0)).gte(quantity(item.quantity)));
    const nextStatus = fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
    const locked = await tx.enterprisePurchase.updateMany({
      where: { id: purchaseId, organizationId, status: purchase.status, revision: input.revision, archivedAt: null },
      data: { status: nextStatus, ...(fullyReceived ? { receivedAt: input.receivedAt } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (locked.count !== 1) throw new EnterpriseCoreV2Error("Une autre réception a été enregistrée simultanément.", 409, "PURCHASE_RECEIPT_CONFLICT");
    const receipt = await tx.enterprisePurchaseReceipt.create({
      data: {
        organizationId,
        purchaseId,
        reference: receiptReference(),
        receivedAt: input.receivedAt,
        receivedByUserId: actorUserId,
        notes: nullable(input.notes),
        items: { create: input.items.map((item) => ({ organizationId, purchaseItemId: item.purchaseItemId, quantityReceived: quantity(item.quantityReceived) })) },
      },
      include: { items: true },
    });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType: fullyReceived ? "ENTERPRISE_PURCHASE_RECEIVED" : "ENTERPRISE_PURCHASE_PARTIALLY_RECEIVED", summary: fullyReceived ? "Réception complète enregistrée." : "Réception partielle enregistrée.", actorUserId, fromStatus: purchase.status, toStatus: nextStatus, metadata: { receiptId: receipt.id, receiptReference: receipt.reference } });
    return { receipt, purchase: await tx.enterprisePurchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true, receipts: { include: { items: true }, orderBy: { receivedAt: "desc" } } } }) };
  });
}
