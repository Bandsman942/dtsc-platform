import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { assertEnterpriseApprovalCandidate, assertEnterpriseApprovalDecision } from "@/lib/enterprise/approval-assignment";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createPurchaseBudgetCommitment, releasePurchaseBudgetCommitment } from "@/lib/enterprise/finance/commitments";
import { assertSameCurrency } from "@/lib/enterprise/finance/money";
import { postEnterprisePurchaseReceiptToInventoryTx } from "@/lib/enterprise/procurement/common-domain-adapter";
import { ENTERPRISE_PURCHASE_TRANSITIONS } from "@/lib/enterprise/procurement/constants";
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
type PurchaseItemCatalogLinkDraft = { catalogItemId: string; unitOfMeasureId: string; expectedItemType: string; sortOrder: number };

function dateOrNull(value?: string | null) { return value ? new Date(value) : null; }
function purchaseReference() { const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); return `PUR-${date}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function receiptReference() { const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); return `REC-${date}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function money(value: number | string | Prisma.Decimal) { return new Prisma.Decimal(value).toDecimalPlaces(2); }
function quantity(value: number | string | Prisma.Decimal) { return new Prisma.Decimal(value).toDecimalPlaces(3); }

function approvalError(error: unknown, fallback: string) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : fallback;
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 403;
  const message = error instanceof Error ? error.message : "Le validateur sélectionné n’est pas autorisé pour cette action.";
  return new EnterpriseCoreV2Error(message, Number.isFinite(status) ? status : 403, code);
}

function catalogExpectedItemType(itemType: string, trackInventory: boolean) {
  if (["SERVICE", "FEE", "SUBSCRIPTION"].includes(itemType)) return "SERVICE";
  return trackInventory ? "GOODS" : "NON_STOCK_GOODS";
}

async function preparePurchaseItems(tx: ProcurementTransaction, organizationId: string, items: PurchaseItemInput[]) {
  const prepared = [];
  const catalogLinks: PurchaseItemCatalogLinkDraft[] = [];
  let subtotalAmount = money(0);
  let taxAmount = money(0);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const catalogItem = await tx.enterpriseCatalogItem.findFirst({
      where: { id: item.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null },
      include: { unitOfMeasure: { select: { id: true, code: true, symbol: true } } },
    });
    if (!catalogItem) throw new EnterpriseCoreV2Error("L’article sélectionné n’appartient pas au catalogue actif de cette entreprise.", 400, "INVALID_PURCHASE_CATALOG_ITEM");
    const hasSourceType = Boolean(nullable(item.sourceEntityType));
    const hasSourceId = Boolean(nullable(item.sourceEntityId));
    if (hasSourceType !== hasSourceId) throw new EnterpriseCoreV2Error("La source d’une ligne doit préciser type et identifiant.", 400, "INCOMPLETE_PURCHASE_ITEM_SOURCE");
    if (hasSourceType && hasSourceId && !(await enterpriseSourceEntityExists(tx, organizationId, item.sourceEntityType!, item.sourceEntityId!))) throw new EnterpriseCoreV2Error("Une ligne d’achat référence un objet d’une autre organisation.", 400, "CROSS_TENANT_PURCHASE_ITEM_SOURCE");
    const itemQuantity = quantity(item.quantity);
    const unitPrice = money(item.unitPrice);
    const taxRate = new Prisma.Decimal(item.taxRate || 0).toDecimalPlaces(4);
    const lineSubtotal = itemQuantity.mul(unitPrice).toDecimalPlaces(2);
    const lineTax = lineSubtotal.mul(taxRate).div(100).toDecimalPlaces(2);
    const lineTotal = lineSubtotal.add(lineTax).toDecimalPlaces(2);
    subtotalAmount = subtotalAmount.add(lineSubtotal).toDecimalPlaces(2);
    taxAmount = taxAmount.add(lineTax).toDecimalPlaces(2);
    const canonicalUnit = catalogItem.unitOfMeasure.symbol || catalogItem.unitOfMeasure.code || item.unit;
    prepared.push({ organizationId, description: item.description, quantity: itemQuantity, unit: canonicalUnit, unitPrice, taxRate, lineSubtotal, taxAmount: lineTax, lineTotal, sourceEntityType: nullable(item.sourceEntityType), sourceEntityId: nullable(item.sourceEntityId), sortOrder: index });
    catalogLinks.push({ catalogItemId: catalogItem.id, unitOfMeasureId: catalogItem.unitOfMeasureId, expectedItemType: catalogExpectedItemType(catalogItem.itemType, catalogItem.trackInventory), sortOrder: index });
  }
  return { items: prepared, catalogLinks, subtotalAmount, taxAmount, totalAmount: subtotalAmount.add(taxAmount).toDecimalPlaces(2) };
}

async function syncPurchaseItemCatalogLinks(tx: ProcurementTransaction, organizationId: string, purchaseId: string, links: PurchaseItemCatalogLinkDraft[]) {
  const purchaseItems = await tx.enterprisePurchaseItem.findMany({ where: { organizationId, purchaseId }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
  if (purchaseItems.length !== links.length) throw new EnterpriseCoreV2Error("Les lignes d’achat n’ont pas pu être reliées au catalogue.", 409, "PURCHASE_ITEM_CATALOG_LINK_MISMATCH");
  const linkByOrder = new Map(links.map((link) => [link.sortOrder, link]));
  await tx.enterprisePurchaseItemCatalogLink.createMany({
    data: purchaseItems.map((purchaseItem) => {
      const link = linkByOrder.get(purchaseItem.sortOrder);
      if (!link) throw new EnterpriseCoreV2Error("Une ligne d’achat ne possède pas de référence catalogue.", 409, "PURCHASE_ITEM_CATALOG_LINK_MISSING");
      return { organizationId, purchaseItemId: purchaseItem.id, catalogItemId: link.catalogItemId, unitOfMeasureId: link.unitOfMeasureId, expectedItemType: link.expectedItemType };
    }),
  });
}

async function requireSupplier(tx: ProcurementTransaction, organizationId: string, supplierId?: string | null, activeOnly = false) {
  const id = nullable(supplierId); if (!id) return null;
  const supplier = await tx.enterpriseSupplier.findFirst({ where: { id, organizationId, archivedAt: null, ...(activeOnly ? { status: "ACTIVE" } : {}) } });
  if (!supplier) throw new EnterpriseCoreV2Error(activeOnly ? "Seul un fournisseur actif de cette entreprise peut être utilisé." : "Le fournisseur sélectionné n’appartient pas à cette entreprise.", 400, activeOnly ? "ACTIVE_SUPPLIER_REQUIRED" : "INVALID_PURCHASE_SUPPLIER");
  return supplier;
}

async function requireRequest(tx: ProcurementTransaction, organizationId: string, requestId?: string | null) {
  const id = nullable(requestId); if (!id) return null;
  const request = await tx.enterpriseRequest.findFirst({ where: { id, organizationId, requestType: "PURCHASE_REQUEST", status: "APPROVED", archivedAt: null } });
  if (!request) throw new EnterpriseCoreV2Error("Seule une demande d’achat approuvée de cette entreprise peut être utilisée comme source.", 400, "APPROVED_PURCHASE_REQUEST_REQUIRED");
  return request;
}

async function requireBudgetLine(tx: ProcurementTransaction, organizationId: string, budgetLineId?: string | null, currency?: string) {
  const id = nullable(budgetLineId); if (!id) return null;
  const line = await tx.enterpriseBudgetLine.findFirst({ where: { id, organizationId }, include: { budget: true } });
  if (!line || line.budget.archivedAt) throw new EnterpriseCoreV2Error("La ligne budgétaire n’appartient pas à cette entreprise.", 400, "INVALID_PURCHASE_BUDGET_LINE");
  if (currency && !assertSameCurrency(line.budget.currency, currency)) throw new EnterpriseCoreV2Error("La devise de l’achat doit correspondre à celle du budget.", 400, "BUDGET_CURRENCY_MISMATCH");
  return line;
}

async function requirePurchaseCoordinates(tx: ProcurementTransaction, organizationId: string, siteId?: string | null, warehouseId?: string | null) {
  const normalizedSiteId = nullable(siteId);
  const normalizedWarehouseId = nullable(warehouseId);
  const site = normalizedSiteId ? await tx.enterpriseSite.findFirst({ where: { id: normalizedSiteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }) : null;
  if (normalizedSiteId && !site) throw new EnterpriseCoreV2Error("Le site de livraison sélectionné n’appartient pas à cette entreprise.", 400, "INVALID_PURCHASE_SITE");
  const warehouse = normalizedWarehouseId ? await tx.enterpriseWarehouse.findFirst({ where: { id: normalizedWarehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, siteId: true } }) : null;
  if (normalizedWarehouseId && !warehouse) throw new EnterpriseCoreV2Error("L’entrepôt de livraison sélectionné n’appartient pas à cette entreprise.", 400, "INVALID_PURCHASE_WAREHOUSE");
  if (site && warehouse && warehouse.siteId !== site.id) throw new EnterpriseCoreV2Error("L’entrepôt de livraison ne dépend pas du site sélectionné.", 409, "PURCHASE_SITE_WAREHOUSE_MISMATCH");
  return { siteId: site?.id || warehouse?.siteId || null, destinationWarehouseId: warehouse?.id || null };
}

async function upsertPurchaseOperationalLink(tx: ProcurementTransaction, organizationId: string, purchaseId: string, actorUserId: string, coordinates: { siteId: string | null; destinationWarehouseId: string | null }, itemLinks: PurchaseItemCatalogLinkDraft[]) {
  const itemTypes = new Set(itemLinks.map((item) => item.expectedItemType));
  const expectedReceiptType = itemTypes.size > 1 ? "MIXED" : itemTypes.values().next().value || "GOODS";
  const existing = await tx.enterprisePurchaseOperationalLink.findFirst({ where: { organizationId, purchaseId } });
  if (existing) {
    return tx.enterprisePurchaseOperationalLink.update({ where: { id: existing.id }, data: { siteId: coordinates.siteId, destinationWarehouseId: coordinates.destinationWarehouseId, expectedReceiptType, revision: { increment: 1 } } });
  }
  return tx.enterprisePurchaseOperationalLink.create({ data: { organizationId, purchaseId, siteId: coordinates.siteId, destinationWarehouseId: coordinates.destinationWarehouseId, expectedReceiptType, createdByUserId: actorUserId } });
}

export async function createEnterprisePurchase(organizationId: string, actorUserId: string, input: PurchaseCreateInput) {
  return prisma.$transaction(async (tx) => {
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId);
    if (input.buyerUserId) await requireActiveEnterpriseMember(tx, organizationId, input.buyerUserId);
    await requireEnterpriseDepartment(tx, organizationId, input.departmentId);
    const supplier = await requireSupplier(tx, organizationId, input.supplierId, false);
    const request = await requireRequest(tx, organizationId, input.requestId);
    const budgetLine = await requireBudgetLine(tx, organizationId, input.budgetLineId, input.currency);
    const source = await requireEnterpriseSourceReference(tx, organizationId, input);
    const coordinates = await requirePurchaseCoordinates(tx, organizationId, input.siteId, input.destinationWarehouseId);
    const calculated = await preparePurchaseItems(tx, organizationId, input.items);
    const purchase = await tx.enterprisePurchase.create({ data: { organizationId, reference: purchaseReference(), title: input.title, description: nullable(input.description), status: "DRAFT", priority: input.priority, supplierId: supplier?.id || null, requestedByUserId: actorUserId, buyerUserId: nullable(input.buyerUserId), departmentId: nullable(input.departmentId), requestId: request?.id || null, budgetLineId: budgetLine?.id || null, currency: input.currency, subtotalAmount: calculated.subtotalAmount, taxAmount: calculated.taxAmount, totalAmount: calculated.totalAmount, expectedAt: dateOrNull(input.expectedAt), sourceModule: source?.sourceModule || null, sourceEntityType: source?.sourceEntityType || null, sourceEntityId: source?.sourceEntityId || null, createdByUserId: actorUserId, items: { create: calculated.items } }, include: { items: true, supplier: true, budgetLine: { include: { budget: true } }, receipts: true } });
    await syncPurchaseItemCatalogLinks(tx, organizationId, purchase.id, calculated.catalogLinks);
    await upsertPurchaseOperationalLink(tx, organizationId, purchase.id, actorUserId, coordinates, calculated.catalogLinks);
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchase.id, eventType: "ENTERPRISE_PURCHASE_CREATED", summary: "Achat créé en brouillon.", actorUserId, toStatus: "DRAFT", metadata: { totalAmount: purchase.totalAmount.toString(), currency: purchase.currency, budgetStatus: budgetLine ? "BUDGETED" : "UNBUDGETED", siteId: coordinates.siteId, destinationWarehouseId: coordinates.destinationWarehouseId } });
    if (request) await createEnterpriseLink(tx, { organizationId, sourceModule: "INTERNAL_REQUESTS", sourceEntityType: "EnterpriseRequest", sourceEntityId: request.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase.id, linkType: "GENERATED_PURCHASE", createdById: actorUserId });
    if (supplier) await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterpriseSupplier", sourceEntityId: supplier.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase.id, linkType: "SUPPLIER", createdById: actorUserId });
    if (budgetLine) await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseBudget", sourceEntityId: budgetLine.budgetId, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchase.id, linkType: "BUDGETED_PURCHASE", createdById: actorUserId, label: budgetLine.id });
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
    const nextCurrency = input.currency || existing.currency;
    const budgetLine = input.budgetLineId !== undefined ? await requireBudgetLine(tx, organizationId, input.budgetLineId, nextCurrency) : await requireBudgetLine(tx, organizationId, existing.budgetLineId, nextCurrency);
    const currentOperationalLink = await tx.enterprisePurchaseOperationalLink.findFirst({ where: { organizationId, purchaseId } });
    const coordinates = await requirePurchaseCoordinates(
      tx,
      organizationId,
      input.siteId !== undefined ? input.siteId : currentOperationalLink?.siteId,
      input.destinationWarehouseId !== undefined ? input.destinationWarehouseId : currentOperationalLink?.destinationWarehouseId,
    );
    const calculated = input.items ? await preparePurchaseItems(tx, organizationId, input.items) : null;
    const updated = await tx.enterprisePurchase.updateMany({ where: { id: purchaseId, organizationId, status: "DRAFT", revision: input.revision, archivedAt: null }, data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.description !== undefined ? { description: nullable(input.description) } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}), ...(input.supplierId !== undefined ? { supplierId: supplier?.id || null } : {}), ...(input.buyerUserId !== undefined ? { buyerUserId: nullable(input.buyerUserId) } : {}), ...(input.departmentId !== undefined ? { departmentId: nullable(input.departmentId) } : {}), ...(input.budgetLineId !== undefined ? { budgetLineId: budgetLine?.id || null } : {}), ...(input.currency !== undefined ? { currency: input.currency } : {}), ...(input.expectedAt !== undefined ? { expectedAt: dateOrNull(input.expectedAt) } : {}), ...(calculated ? { subtotalAmount: calculated.subtotalAmount, taxAmount: calculated.taxAmount, totalAmount: calculated.totalAmount } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("L’achat a été modifié par un autre utilisateur.", 409, "REVISION_CONFLICT");
    if (calculated) {
      const currentItems = await tx.enterprisePurchaseItem.findMany({ where: { organizationId, purchaseId }, select: { id: true } });
      await tx.enterprisePurchaseItemCatalogLink.deleteMany({ where: { organizationId, purchaseItemId: { in: currentItems.map((item) => item.id) } } });
      await tx.enterprisePurchaseItem.deleteMany({ where: { organizationId, purchaseId } });
      await tx.enterprisePurchaseItem.createMany({ data: calculated.items.map((item) => ({ ...item, purchaseId })) });
      await syncPurchaseItemCatalogLinks(tx, organizationId, purchaseId, calculated.catalogLinks);
      await upsertPurchaseOperationalLink(tx, organizationId, purchaseId, actorUserId, coordinates, calculated.catalogLinks);
    } else if (input.siteId !== undefined || input.destinationWarehouseId !== undefined) {
      const existingLinks = await tx.enterprisePurchaseItemCatalogLink.findMany({ where: { organizationId, purchaseItemId: { in: (await tx.enterprisePurchaseItem.findMany({ where: { organizationId, purchaseId }, select: { id: true } })).map((item) => item.id) } } });
      await upsertPurchaseOperationalLink(tx, organizationId, purchaseId, actorUserId, coordinates, existingLinks.map((link, sortOrder) => ({ catalogItemId: link.catalogItemId || "", unitOfMeasureId: link.unitOfMeasureId || "", expectedItemType: link.expectedItemType, sortOrder })));
    }
    if (input.supplierId !== undefined && supplier) await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterpriseSupplier", sourceEntityId: supplier.id, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, linkType: "SUPPLIER", createdById: actorUserId });
    if (input.budgetLineId !== undefined && budgetLine) await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseBudget", sourceEntityId: budgetLine.budgetId, targetModule: "SUPPLIERS_PURCHASES", targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, linkType: "BUDGETED_PURCHASE", createdById: actorUserId, label: budgetLine.id });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType: "ENTERPRISE_PURCHASE_UPDATED", summary: "Achat mis à jour.", actorUserId, fromStatus: "DRAFT", toStatus: "DRAFT" });
    return tx.enterprisePurchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true, budgetLine: { include: { budget: true } }, receipts: { include: { items: true } } } });
  });
}

export async function createEnterprisePurchaseApproval({ organizationId, purchaseId, actorUserId, approverUserId, purchaseRevision }: { organizationId: string; purchaseId: string; actorUserId: string; approverUserId: string; purchaseRevision?: number }) {
  const candidatePurchase = await prisma.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null }, select: { requestedByUserId: true } });
  if (!candidatePurchase) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
  try {
    await assertEnterpriseApprovalCandidate({ organizationId, requesterUserId: candidatePurchase.requestedByUserId, approverUserId, moduleCode: "SUPPLIERS_PURCHASES" });
  } catch (error) {
    throw approvalError(error, "APPROVER_NOT_ELIGIBLE");
  }

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null }, include: { items: true } });
    if (!purchase) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
    if (purchase.status !== "DRAFT") throw new EnterpriseCoreV2Error("L’achat doit être en brouillon avant soumission.", 409, "INVALID_PURCHASE_SUBMIT_STATE");
    if (!purchase.items.length) throw new EnterpriseCoreV2Error("Un achat doit comporter au moins une ligne.", 400, "PURCHASE_ITEMS_REQUIRED");
    const itemLinks = await tx.enterprisePurchaseItemCatalogLink.count({ where: { organizationId, purchaseItemId: { in: purchase.items.map((item) => item.id) } } });
    if (itemLinks !== purchase.items.length) throw new EnterpriseCoreV2Error("Chaque ligne doit être reliée au catalogue avant soumission.", 409, "PURCHASE_CATALOG_LINK_REQUIRED");
    await requireActiveEnterpriseMember(tx, organizationId, actorUserId); await requireActiveEnterpriseMember(tx, organizationId, approverUserId); await requireSupplier(tx, organizationId, purchase.supplierId, true);
    if (purchase.budgetLineId) await requireBudgetLine(tx, organizationId, purchase.budgetLineId, purchase.currency);
    const pending = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, status: "PENDING", archivedAt: null }, select: { id: true } });
    if (pending) throw new EnterpriseCoreV2Error("Une validation est déjà en attente pour cet achat.", 409, "PENDING_APPROVAL_EXISTS");
    const promoted = await tx.enterprisePurchase.updateMany({ where: { id: purchaseId, organizationId, status: "DRAFT", revision: purchaseRevision ?? purchase.revision, archivedAt: null }, data: { status: "PENDING_APPROVAL", updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (promoted.count !== 1) throw new EnterpriseCoreV2Error("L’achat a changé pendant sa soumission.", 409, "REVISION_CONFLICT");
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, requestedByUserId: purchase.requestedByUserId, approverUserId, status: "PENDING" } });
    await createEnterpriseLink(tx, { organizationId, sourceModule: "SUPPLIERS_PURCHASES", sourceEntityType: "EnterprisePurchase", sourceEntityId: purchaseId, targetModule: "VALIDATIONS", targetEntityType: "EnterpriseApproval", targetEntityId: approval.id, linkType: "REQUIRES_APPROVAL", createdById: actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType: "ENTERPRISE_PURCHASE_SUBMITTED", summary: "Achat soumis pour approbation.", actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL" });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approval.id, eventType: "ENTERPRISE_APPROVAL_REQUESTED", summary: "Validation d’achat demandée.", actorUserId, toStatus: "PENDING", metadata: { targetEntityType: "EnterprisePurchase", targetEntityId: purchaseId, approverUserId } });
    return approval;
  });
}

export async function decideEnterprisePurchaseApproval({ organizationId, approvalId, actorUserId, action, revision, decisionComment, canManage }: { organizationId: string; approvalId: string; actorUserId: string; action: "APPROVE" | "REJECT" | "CANCEL"; revision: number; decisionComment?: string | null; canManage: boolean }) {
  if (action === "REJECT" && !nullable(decisionComment)) throw new EnterpriseCoreV2Error("Un motif est obligatoire pour rejeter une validation.", 400, "REJECTION_REASON_REQUIRED");
  let selfApprovalOverride = false;
  if (action === "APPROVE" || action === "REJECT") {
    const pending = await prisma.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, targetEntityType: "EnterprisePurchase", status: "PENDING", archivedAt: null }, select: { requestedByUserId: true, approverUserId: true } });
    if (!pending) throw new EnterpriseCoreV2Error("Validation d’achat introuvable.", 404, "APPROVAL_NOT_FOUND");
    try {
      const decision = await assertEnterpriseApprovalDecision({ organizationId, requesterUserId: pending.requestedByUserId, approverUserId: pending.approverUserId, actorUserId, moduleCode: "SUPPLIERS_PURCHASES" });
      selfApprovalOverride = decision.selfApprovalOverride;
    } catch (error) {
      throw approvalError(error, "APPROVAL_DECISION_DENIED");
    }
  }

  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({ where: { id: approvalId, organizationId, targetEntityType: "EnterprisePurchase", archivedAt: null } });
    if (!approval) throw new EnterpriseCoreV2Error("Validation d’achat introuvable.", 404, "APPROVAL_NOT_FOUND");
    if (approval.status !== "PENDING") throw new EnterpriseCoreV2Error("Cette validation a déjà été décidée.", 409, "APPROVAL_ALREADY_DECIDED");
    if (action === "APPROVE" || action === "REJECT") { if (approval.approverUserId !== actorUserId) throw new EnterpriseCoreV2Error("Seul l’approbateur désigné peut décider cet achat.", 403, "WRONG_APPROVER"); }
    else if (approval.requestedByUserId !== actorUserId && !canManage) throw new EnterpriseCoreV2Error("Vous ne pouvez pas annuler cette validation.", 403, "APPROVAL_CANCEL_DENIED");
    const purchase = await tx.enterprisePurchase.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null } });
    if (!purchase || purchase.status !== "PENDING_APPROVAL") throw new EnterpriseCoreV2Error("L’achat cible n’est plus en attente d’approbation.", 409, "APPROVAL_TARGET_CONFLICT");
    const approvalStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
    const purchaseStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "DRAFT";
    const comment = nullable(decisionComment) || (selfApprovalOverride ? "SELF_APPROVAL_OVERRIDE" : null);
    const approvalUpdated = await tx.enterpriseApproval.updateMany({ where: { id: approvalId, organizationId, status: "PENDING", revision, archivedAt: null }, data: { status: approvalStatus, decidedAt: action === "CANCEL" ? null : new Date(), decisionComment: comment, revision: { increment: 1 } } });
    if (approvalUpdated.count !== 1) throw new EnterpriseCoreV2Error("La validation a été décidée simultanément.", 409, "APPROVAL_DECISION_CONFLICT");
    const purchaseUpdated = await tx.enterprisePurchase.updateMany({ where: { id: purchase.id, organizationId, status: "PENDING_APPROVAL", revision: purchase.revision, archivedAt: null }, data: { status: purchaseStatus, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (purchaseUpdated.count !== 1) throw new EnterpriseCoreV2Error("L’achat a changé pendant la décision.", 409, "APPROVAL_TARGET_CONFLICT");
    if (action === "APPROVE") await createPurchaseBudgetCommitment(tx, { organizationId, purchaseId: purchase.id, actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseApproval", entityId: approvalId, eventType: action === "APPROVE" ? "ENTERPRISE_APPROVAL_APPROVED" : action === "REJECT" ? "ENTERPRISE_APPROVAL_REJECTED" : "ENTERPRISE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || `Validation ${approvalStatus.toLowerCase()}.`, actorUserId, fromStatus: "PENDING", toStatus: approvalStatus, metadata: { selfApprovalOverride } });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchase.id, eventType: action === "APPROVE" ? "ENTERPRISE_PURCHASE_APPROVED" : action === "REJECT" ? "ENTERPRISE_PURCHASE_REJECTED" : "ENTERPRISE_PURCHASE_APPROVAL_CANCELLED", summary: nullable(decisionComment) || (action === "APPROVE" ? "Achat approuvé." : action === "REJECT" ? "Achat rejeté." : "Validation de l’achat annulée."), actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: purchaseStatus, metadata: { selfApprovalOverride } });
    return tx.enterpriseApproval.findUnique({ where: { id: approvalId } });
  });
}

export async function transitionEnterprisePurchase(organizationId: string, purchaseId: string, actorUserId: string, input: PurchaseActionInput) {
  if (input.action === "SUBMIT") { if (!input.approverUserId) throw new EnterpriseCoreV2Error("Un approbateur est obligatoire.", 400, "APPROVER_REQUIRED"); return createEnterprisePurchaseApproval({ organizationId, purchaseId, actorUserId, approverUserId: input.approverUserId, purchaseRevision: input.revision }); }
  const transition = ENTERPRISE_PURCHASE_TRANSITIONS[input.action];
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterprisePurchase.findFirst({ where: { id: purchaseId, organizationId, archivedAt: null } });
    if (!existing) throw new EnterpriseCoreV2Error("Achat introuvable.", 404, "PURCHASE_NOT_FOUND");
    if (!transition.from.includes(existing.status as never)) throw new EnterpriseCoreV2Error("Cette transition d’achat n’est pas autorisée.", 409, "INVALID_PURCHASE_TRANSITION");
    if (input.action === "ORDER") {
      await requireSupplier(tx, organizationId, existing.supplierId, true);
      const purchaseItems = await tx.enterprisePurchaseItem.findMany({ where: { organizationId, purchaseId }, select: { id: true } });
      const itemLinks = await tx.enterprisePurchaseItemCatalogLink.findMany({ where: { organizationId, purchaseItemId: { in: purchaseItems.map((item) => item.id) } } });
      if (itemLinks.length !== purchaseItems.length) throw new EnterpriseCoreV2Error("Chaque ligne doit être reliée au catalogue avant commande.", 409, "PURCHASE_CATALOG_LINK_REQUIRED");
      if (itemLinks.some((item) => item.expectedItemType === "GOODS")) {
        const operationalLink = await tx.enterprisePurchaseOperationalLink.findFirst({ where: { organizationId, purchaseId } });
        if (!operationalLink?.destinationWarehouseId) throw new EnterpriseCoreV2Error("Un entrepôt de réception est obligatoire pour commander des articles suivis en stock.", 409, "PURCHASE_DESTINATION_WAREHOUSE_REQUIRED");
        await requirePurchaseCoordinates(tx, organizationId, operationalLink.siteId, operationalLink.destinationWarehouseId);
      }
    }
    const updated = await tx.enterprisePurchase.updateMany({ where: { id: purchaseId, organizationId, status: existing.status, revision: input.revision, archivedAt: null }, data: { ...(transition.to ? { status: transition.to } : {}), ...(input.action === "ORDER" ? { orderedAt: new Date() } : {}), ...(input.action === "CLOSE" ? { closedAt: new Date() } : {}), ...(input.action === "ARCHIVE" ? { archivedAt: new Date() } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("L’achat a été modifié simultanément.", 409, "REVISION_CONFLICT");
    if (input.action === "CANCEL" && existing.status === "APPROVED") await releasePurchaseBudgetCommitment(tx, { organizationId, purchaseId, actorUserId });
    const eventType = input.action === "ORDER" ? "ENTERPRISE_PURCHASE_ORDERED" : input.action === "CLOSE" ? "ENTERPRISE_PURCHASE_CLOSED" : input.action === "CANCEL" ? "ENTERPRISE_PURCHASE_CANCELLED" : "ENTERPRISE_PURCHASE_ARCHIVED";
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType, summary: nullable(input.comment) || `Action ${input.action} appliquée à l’achat.`, actorUserId, fromStatus: existing.status, toStatus: transition.to || existing.status });
    return tx.enterprisePurchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true, budgetLine: { include: { budget: true } }, receipts: { include: { items: true } } } });
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
    for (const inputItem of input.items) { const ordered = quantity(itemMap.get(inputItem.purchaseItemId)!.quantity); const previous = receivedMap.get(inputItem.purchaseItemId) || quantity(0); const next = previous.add(quantity(inputItem.quantityReceived)); if (next.gt(ordered)) throw new EnterpriseCoreV2Error("La quantité reçue ne peut pas dépasser la quantité restant à recevoir.", 409, "PURCHASE_OVER_RECEIPT"); receivedMap.set(inputItem.purchaseItemId, next); }
    const fullyReceived = purchase.items.every((item) => (receivedMap.get(item.id) || quantity(0)).gte(quantity(item.quantity)));
    const nextStatus = fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
    const locked = await tx.enterprisePurchase.updateMany({ where: { id: purchaseId, organizationId, status: purchase.status, revision: input.revision, archivedAt: null }, data: { status: nextStatus, ...(fullyReceived ? { receivedAt: input.receivedAt } : {}), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (locked.count !== 1) throw new EnterpriseCoreV2Error("Une autre réception a été enregistrée simultanément.", 409, "PURCHASE_RECEIPT_CONFLICT");
    const receipt = await tx.enterprisePurchaseReceipt.create({ data: { organizationId, purchaseId, reference: receiptReference(), receivedAt: input.receivedAt, receivedByUserId: actorUserId, notes: nullable(input.notes), items: { create: input.items.map((item) => ({ organizationId, purchaseItemId: item.purchaseItemId, quantityReceived: quantity(item.quantityReceived) })) } }, include: { items: true } });
    const projection = await postEnterprisePurchaseReceiptToInventoryTx(tx, organizationId, receipt.id, actorUserId, {
      warehouseId: nullable(input.warehouseId),
      storageLocationId: nullable(input.storageLocationId),
      idempotencyKey: `purchase-receipt:${receipt.id}`,
    });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterprisePurchase", entityId: purchaseId, eventType: fullyReceived ? "ENTERPRISE_PURCHASE_RECEIVED" : "ENTERPRISE_PURCHASE_PARTIALLY_RECEIVED", summary: fullyReceived ? "Réception complète enregistrée et intégrée aux opérations." : "Réception partielle enregistrée et intégrée aux opérations.", actorUserId, fromStatus: purchase.status, toStatus: nextStatus, metadata: { receiptId: receipt.id, receiptReference: receipt.reference, receiptOperationalLinkId: projection.receiptLink.id } });
    return { receipt, projection, purchase: await tx.enterprisePurchase.findUnique({ where: { id: purchaseId }, include: { items: true, supplier: true, budgetLine: { include: { budget: true } }, receipts: { include: { items: true }, orderBy: { receivedAt: "desc" } } } }) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
