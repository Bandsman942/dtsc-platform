import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyBatches } from "@/lib/pharmacy-batch-access";
import { effectivePharmacyBatchStatus } from "@/lib/pharmacy-batches";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";
import { pharmacyBatchSchema, pharmacyBatchUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string; batchId: string }> };
const nullableKeys = new Set(["supplierId", "purchaseOrderId", "receiptId", "serialNumber", "barcode", "internalReference", "manufacturerReference", "manufacturingDate", "receivedAt", "stockEntryDate", "receivedById", "minQuantityAlert", "expiryAlertDays", "location", "shelf", "zone", "storageConditions", "tempMin", "tempMax", "storageNotes", "purchasePrice", "salePrice", "recallDate", "quarantineReason", "recallReason", "statusReason", "decisionResponsibleId", "supplierInvoiceRef", "deliveryNoteRef", "qualityDocumentUrl", "supplierInvoiceUrl", "deliveryNoteUrl", "certificateUrl", "notes"]);

function duplicateMessage(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  return String(error.meta?.target || "").includes("barcode") ? "Ce code-barres de lot existe déjà." : "Ce numéro de lot existe déjà pour ce produit.";
}

export async function GET(req: Request, { params }: Params) {
  void req;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, batchId } = await params;
  if (!(await canAccessPharmacyBatches(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const batch = await prisma.pharmacyBatch.findFirst({ where: { id: batchId, organizationId }, include: { product: true, createdBy: { select: { name: true, email: true } }, updatedBy: { select: { name: true, email: true } }, stockMovements: { orderBy: { createdAt: "desc" }, take: 100 } } });
  return batch ? NextResponse.json({ batch: { ...batch, effectiveStatus: effectivePharmacyBatchStatus(batch) } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, batchId } = await params;
  if (!(await canAccessPharmacyBatches(session.userId, organizationId, "update"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.pharmacyBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = pharmacyBatchUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Lot invalide." }, { status: 400 });
  const persistedStatus = ["ACTIVE", "QUARANTINED", "RECALLED", "BLOCKED", "CANCELLED"].includes(existing.status) ? existing.status : "ACTIVE";
  const merged = pharmacyBatchSchema.safeParse({ ...existing, status: persistedStatus, ...parsed.data });
  if (!merged.success) return NextResponse.json({ error: "Invalid payload", message: merged.error.issues[0]?.message || "Modification incohérente." }, { status: 400 });
  const product = await prisma.pharmacyProduct.findFirst({ where: { id: merged.data.productId, organizationId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Invalid product", message: "Le produit sélectionné n'appartient pas à cette pharmacie." }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data, updatedById: session.userId };
  for (const [key, value] of Object.entries(data)) if (nullableKeys.has(key) && value === "") data[key] = null;
  if (parsed.data.purchasePrice !== undefined || parsed.data.receivedQuantity !== undefined) data.totalCost = merged.data.purchasePrice === null || merged.data.purchasePrice === undefined ? null : merged.data.receivedQuantity * merged.data.purchasePrice;
  try {
    const batch = await prisma.pharmacyBatch.update({ where: { id: batchId }, data: data as Prisma.PharmacyBatchUncheckedUpdateInput, include: { product: true } });
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_BATCH_UPDATED", entity: "PharmacyBatch", entityId: batch.id, request: req, metadata: { organizationId } });
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    const message = duplicateMessage(error);
    if (message) return NextResponse.json({ error: "Duplicate batch", message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, batchId } = await params;
  if (!(await canAccessPharmacyBatches(session.userId, organizationId, "archive"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.pharmacyBatch.findFirst({ where: { id: batchId, organizationId }, select: { id: true, productId: true, availableQuantity: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.$transaction([
    prisma.pharmacyBatch.update({ where: { id: batchId }, data: { status: "CANCELLED", statusReason: "Annulation manuelle", updatedById: session.userId } }),
    prisma.pharmacyStockMovement.create({ data: { organizationId, productId: existing.productId, batchId, movementType: "CANCELLATION", quantity: 0, quantityBefore: existing.availableQuantity, quantityAfter: existing.availableQuantity, reason: "Annulation manuelle du lot", createdById: session.userId } }),
  ]);
  await writeAuditLog({ userId: session.userId, action: "PHARMACY_BATCH_CANCELLED", entity: "PharmacyBatch", entityId: batchId, request: req, metadata: { organizationId } });
  return NextResponse.json({ ok: true });
}
