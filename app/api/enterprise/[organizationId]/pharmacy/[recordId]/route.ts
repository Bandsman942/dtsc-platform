import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterprisePharmacyRecordUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string; recordId: string }> };
const PHARMACY_SECTOR_CODE = "PHARMACY";
const ACTION_STATUS: Record<string, string> = { submit: "SUBMITTED", validate: "VALIDATED", receive: "VALIDATED", pay: "PAID", cancel: "CANCELLED", close: "CLOSED", resolve: "RESOLVED", quarantine: "QUARANTINED", recall: "RECALLED", archive: "ARCHIVED" };

function objectPayload(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.InputJsonObject) : {};
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
}

async function validateUpdateReferences(organizationId: string, data: Record<string, unknown>) {
  const references: Array<[string, string]> = [
    ["productId", "MEDICINES_PRODUCTS"],
    ["batchId", "BATCH_EXPIRY"],
    ["supplierId", "SUPPLIERS_ORDERS"],
    ["purchaseOrderId", "SUPPLIERS_ORDERS"],
    ["receiptId", "STOCK_RECEIPTS"],
    ["saleId", "SALES_DISPENSATION"],
    ["prescriptionId", "PRESCRIPTIONS"],
  ];
  for (const [key, moduleCode] of references) {
    const id = typeof data[key] === "string" ? data[key] : "";
    if (!id) continue;
    if (moduleCode === "MEDICINES_PRODUCTS") {
      const product = await prisma.pharmacyProduct.findFirst({ where: { id, organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
      if (!product) return "Une référence sélectionnée n'appartient pas à cette pharmacie.";
      continue;
    }
    if (moduleCode === "BATCH_EXPIRY") {
      const batch = await prisma.pharmacyBatch.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!batch) return "Une référence sélectionnée n'appartient pas à cette pharmacie.";
      continue;
    }
    const record = await prisma.enterpriseSectorRecord.findFirst({ where: { id, organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode, deletedAt: null }, select: { id: true } });
    if (!record) return "Une référence sélectionnée n'appartient pas à cette pharmacie.";
  }
  const memberId = typeof data.assignedToUserId === "string" && data.assignedToUserId ? data.assignedToUserId : typeof data.responsibleUserId === "string" ? data.responsibleUserId : "";
  if (memberId) {
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: memberId, status: "ACTIVE", removedAt: null }, select: { id: true } });
    if (!member) return "Le collaborateur sélectionné n'appartient pas à cette pharmacie.";
  }
  return null;
}

async function applyStockImpact(tx: Prisma.TransactionClient, organizationId: string, record: { id: string; moduleCode: string; status: string; payloadJson: Prisma.JsonValue | null }, action: string, actorId: string) {
  const recordPayload = objectPayload(record.payloadJson);
  const batchId = typeof recordPayload.batchId === "string" ? recordPayload.batchId : "";
  if (!batchId || !["SALES_DISPENSATION", "STOCK_RECEIPTS", "RETURNS_ADJUSTMENTS_LOSSES"].includes(record.moduleCode)) return recordPayload;
  const batch = await tx.pharmacyBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!batch) throw new Error("INVALID_BATCH");
  const available = Number(batch.availableQuantity);
  const quantity = numberValue(recordPayload.quantity);
  const impactApplied = recordPayload.stockImpactApplied === true;
  const blocked = batch.recall || batch.quarantine || ["EXPIRED", "RECALLED", "QUARANTINED", "BLOCKED", "CANCELLED"].includes(batch.status) || batch.expiryDate < new Date();
  let delta = 0;
  if (record.moduleCode === "SALES_DISPENSATION" && ["validate", "pay"].includes(action) && !impactApplied) {
    if (blocked) throw new Error("BATCH_NOT_SELLABLE");
    if (quantity > available) throw new Error("INSUFFICIENT_STOCK");
    delta = -quantity;
  } else if (record.moduleCode === "STOCK_RECEIPTS" && ["validate", "receive"].includes(action) && !impactApplied) {
    delta = quantity;
  } else if (record.moduleCode === "RETURNS_ADJUSTMENTS_LOSSES" && action === "validate" && !impactApplied) {
    const adjustmentKind = typeof recordPayload.recordKind === "string" ? recordPayload.recordKind.toUpperCase() : "";
    delta = adjustmentKind.includes("RETURN_CLIENT") || adjustmentKind.includes("STOCK_IN") || adjustmentKind.includes("INVENTORY_PLUS") ? quantity : -quantity;
    if (available + delta < 0) throw new Error("INSUFFICIENT_STOCK");
  } else if (action === "cancel" && impactApplied) {
    delta = record.moduleCode === "SALES_DISPENSATION" ? quantity : -quantity;
  }
  if (delta !== 0) {
    const nextAvailable = available + delta;
    await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { status: nextAvailable <= 0 ? "DEPLETED" : batch.status, availableQuantity: nextAvailable, updatedById: actorId } });
    await tx.pharmacyStockMovement.create({ data: { organizationId, productId: batch.productId, batchId: batch.id, movementType: record.moduleCode === "SALES_DISPENSATION" ? "SALE" : record.moduleCode === "STOCK_RECEIPTS" ? "RECEIPT" : "ADJUSTMENT", quantity: Math.abs(delta), quantityBefore: available, quantityAfter: nextAvailable, reason: `${record.moduleCode} · ${action}`, relatedEntityType: "EnterpriseSectorRecord", relatedEntityId: record.id, createdById: actorId } });
    return { ...recordPayload, stockImpactApplied: action !== "cancel", stockImpactAt: new Date().toISOString(), stockImpactDelta: delta };
  }
  return recordPayload;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-pharmacy-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, recordId } = await params;
  const existing = await prisma.enterpriseSectorRecord.findFirst({ where: { id: recordId, organizationId, sectorCode: PHARMACY_SECTOR_CODE, deletedAt: null, organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: PHARMACY_SECTOR_CODE } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.moduleCode === "MEDICINES_PRODUCTS") return NextResponse.json({ error: "Dedicated product API required", message: "Utilisez le catalogue Produits & médicaments dédié." }, { status: 400 });
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, existing.moduleCode, "write"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterprisePharmacyRecordUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Les modifications pharmacie sont invalides." }, { status: 400 });
  const data = parsed.data;
  const referenceError = await validateUpdateReferences(organizationId, data);
  if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  if (["PAID", "VALIDATED", "CLOSED"].includes(existing.status) && data.action !== "cancel") return NextResponse.json({ error: "Locked", message: "Cet élément validé est verrouillé. Utilisez une annulation métier." }, { status: 409 });
  try {
    const record = await prisma.$transaction(async (tx) => {
      const previous = objectPayload(existing.payloadJson);
      const impacted = data.action ? await applyStockImpact(tx, organizationId, existing, data.action, session.userId) : previous;
      const nextPayload: Record<string, Prisma.InputJsonValue | null> = {};
      for (const [key, value] of Object.entries(impacted)) {
        if (value !== undefined) {
          nextPayload[key] = value;
        }
      }
      for (const [key, value] of Object.entries(data)) {
        if (!["moduleCode", "recordType", "title", "summary", "status", "priority", "assignedToUserId", "action", "actionReason"].includes(key) && value !== undefined) nextPayload[key] = value as Prisma.InputJsonValue;
      }
      if (data.action) {
        nextPayload.lastAction = data.action;
        nextPayload.lastActionReason = data.actionReason || null;
        nextPayload.lastActionAt = new Date().toISOString();
      }
      return tx.enterpriseSectorRecord.update({
        where: { id: existing.id },
        data: { title: data.title ?? existing.title, summary: data.summary !== undefined ? data.summary || null : existing.summary, status: data.action ? ACTION_STATUS[data.action] || existing.status : data.status ?? existing.status, priority: data.priority ?? existing.priority, assignedToUserId: data.assignedToUserId !== undefined ? data.assignedToUserId || null : existing.assignedToUserId, updatedById: session.userId, payloadJson: nextPayload },
        include: { createdBy: { select: { name: true, email: true } }, assignedTo: { select: { id: true, name: true, email: true } } },
      });
    });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PHARMACY_RECORD_UPDATED", entity: "EnterpriseSectorRecord", entityId: record.id, request: req, metadata: { organizationId, moduleCode: existing.moduleCode, action: data.action || "update" } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error && error.message === "BATCH_NOT_SELLABLE" ? "Ce lot est expiré, rappelé ou en quarantaine." : error instanceof Error && error.message === "INSUFFICIENT_STOCK" ? "La quantité demandée dépasse le stock disponible." : "L'opération pharmacie n'a pas pu être appliquée.";
    return NextResponse.json({ error: "Pharmacy operation failed", message }, { status: 409 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, recordId } = await params;
  const existing = await prisma.enterpriseSectorRecord.findFirst({ where: { id: recordId, organizationId, sectorCode: PHARMACY_SECTOR_CODE, deletedAt: null } });
  if (existing?.moduleCode === "MEDICINES_PRODUCTS") return NextResponse.json({ error: "Dedicated product API required", message: "Utilisez le catalogue Produits & médicaments dédié." }, { status: 400 });
  if (!existing || !(await canAccessEnterpriseModule(session.userId, organizationId, existing.moduleCode, "manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.enterpriseSectorRecord.update({ where: { id: existing.id }, data: { status: "ARCHIVED", deletedAt: new Date(), updatedById: session.userId } });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PHARMACY_RECORD_ARCHIVED", entity: "EnterpriseSectorRecord", entityId: existing.id, request: req, metadata: { organizationId, moduleCode: existing.moduleCode } });
  return NextResponse.json({ ok: true });
}
