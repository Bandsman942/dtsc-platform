import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyBatches } from "@/lib/pharmacy-batch-access";
import { effectivePharmacyBatchStatus } from "@/lib/pharmacy-batches";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { pharmacyBatchSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };
type BatchInput = ReturnType<typeof pharmacyBatchSchema.parse>;
const nullableTextKeys = ["supplierId", "purchaseOrderId", "receiptId", "serialNumber", "barcode", "internalReference", "manufacturerReference", "receivedById", "location", "shelf", "zone", "storageConditions", "storageNotes", "quarantineReason", "recallReason", "statusReason", "decisionResponsibleId", "supplierInvoiceRef", "deliveryNoteRef", "qualityDocumentUrl", "supplierInvoiceUrl", "deliveryNoteUrl", "certificateUrl", "notes"] as const;
const nullableNumberKeys = ["minQuantityAlert", "expiryAlertDays", "tempMin", "tempMax", "purchasePrice", "salePrice"] as const;
const nullableDateKeys = ["manufacturingDate", "receivedAt", "stockEntryDate", "recallDate"] as const;

function batchData(data: BatchInput, userId: string): Omit<Prisma.PharmacyBatchUncheckedCreateInput, "organizationId"> {
  const normalized: Record<string, unknown> = { ...data, createdById: userId, updatedById: userId, totalCost: data.purchasePrice === "" || data.purchasePrice === null || data.purchasePrice === undefined ? null : Number(data.receivedQuantity) * Number(data.purchasePrice) };
  for (const key of nullableTextKeys) normalized[key] = data[key] || null;
  for (const key of nullableNumberKeys) normalized[key] = data[key] === "" || data[key] === undefined ? null : data[key];
  for (const key of nullableDateKeys) normalized[key] = data[key] || null;
  if (data.recall) normalized.status = "RECALLED";
  else if (data.quarantine) normalized.status = "QUARANTINED";
  return normalized as Omit<Prisma.PharmacyBatchUncheckedCreateInput, "organizationId">;
}

async function validateReferences(organizationId: string, data: BatchInput) {
  const product = await prisma.pharmacyProduct.findFirst({ where: { id: data.productId, organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!product) return "Le produit sélectionné n'appartient pas à cette pharmacie.";
  for (const userId of [data.receivedById, data.decisionResponsibleId]) {
    if (!userId) continue;
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { id: true } });
    if (!member) return "Le collaborateur sélectionné n'appartient pas à cette pharmacie.";
  }
  const references: Array<[string | undefined, string, string?]> = [[data.supplierId || undefined, "SUPPLIERS_ORDERS", "SUPPLIER"], [data.purchaseOrderId || undefined, "SUPPLIERS_ORDERS"], [data.receiptId || undefined, "STOCK_RECEIPTS"]];
  for (const [id, moduleCode, kind] of references) {
    if (!id) continue;
    const record = await prisma.enterpriseSectorRecord.findFirst({ where: { id, organizationId, sectorCode: "PHARMACY", moduleCode, deletedAt: null }, select: { payloadJson: true } });
    const payload = record?.payloadJson as Record<string, unknown> | null;
    if (!record || (kind && payload?.recordKind !== kind)) return "Une référence fournisseur ou réception n'appartient pas à cette pharmacie.";
  }
  return null;
}

function duplicateMessage(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = String(error.meta?.target || "");
  return target.includes("barcode") ? "Ce code-barres de lot existe déjà dans cette pharmacie." : "Ce numéro de lot existe déjà pour ce produit.";
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyBatches(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() || "";
  const productId = url.searchParams.get("productId") || "";
  const supplierId = url.searchParams.get("supplierId") || "";
  const status = url.searchParams.get("status") || "";
  const location = url.searchParams.get("location") || "";
  const expiry = url.searchParams.get("expiry") || "";
  const available = url.searchParams.get("available") === "true";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 24));
  const now = new Date();
  const near = new Date(now.getTime() + 90 * 86_400_000);
  const where: Prisma.PharmacyBatchWhereInput = {
    organizationId,
    ...(productId ? { productId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(status ? { status } : {}),
    ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
    ...(available ? { availableQuantity: { gt: 0 } } : {}),
    ...(expiry === "expired" ? { expiryDate: { lt: now } } : expiry === "near" ? { expiryDate: { gte: now, lte: near } } : {}),
    ...(query ? { OR: [
      { batchNumber: { contains: query, mode: "insensitive" } },
      { barcode: { contains: query, mode: "insensitive" } },
      { product: { name: { contains: query, mode: "insensitive" } } },
      { product: { genericName: { contains: query, mode: "insensitive" } } },
      { product: { internalCode: { contains: query, mode: "insensitive" } } },
    ] } : {}),
  };
  const [rawBatches, totalCount, products, members, supplierRecords, receiptRecords] = await Promise.all([
    prisma.pharmacyBatch.findMany({ where, orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { product: true, createdBy: { select: { name: true, email: true } }, stockMovements: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    prisma.pharmacyBatch.count({ where }),
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, genericName: true, internalCode: true, category: true, pharmaceuticalForm: true, dosage: true, stockUnit: true, defaultLocation: true, shelf: true, storageType: true, tempMin: true, tempMax: true, refrigerated: true, currency: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.enterpriseSectorRecord.findMany({ where: { organizationId, sectorCode: "PHARMACY", moduleCode: "SUPPLIERS_ORDERS", deletedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true, payloadJson: true } }),
    prisma.enterpriseSectorRecord.findMany({ where: { organizationId, sectorCode: "PHARMACY", moduleCode: "STOCK_RECEIPTS", deletedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);
  const batches = rawBatches.map((batch) => ({ ...batch, effectiveStatus: effectivePharmacyBatchStatus(batch) }));
  const suppliers = supplierRecords.filter((record) => (record.payloadJson as Record<string, unknown> | null)?.recordKind === "SUPPLIER").map(({ id, title }) => ({ id, title }));
  const purchaseOrders = supplierRecords.filter((record) => (record.payloadJson as Record<string, unknown> | null)?.recordKind !== "SUPPLIER").map(({ id, title }) => ({ id, title }));
  const receipts = receiptRecords.map(({ id, title }) => ({ id, title }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ batches, products, members: members.map((member) => member.user), suppliers, purchaseOrders, receipts, totalCount, page, pageCount: Math.max(1, Math.ceil(totalCount / pageSize)) });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `pharmacy-batches:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions lots sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyBatches(session.userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = pharmacyBatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Lot invalide." }, { status: 400 });
  const referenceError = await validateReferences(organizationId, parsed.data);
  if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  try {
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.pharmacyBatch.create({ data: { organizationId, ...batchData(parsed.data, session.userId) }, include: { product: true } });
      await tx.pharmacyStockMovement.create({ data: { organizationId, productId: created.productId, batchId: created.id, movementType: "INITIAL_BATCH_CREATION", quantity: created.receivedQuantity, quantityBefore: 0, quantityAfter: created.availableQuantity, reason: "Création initiale du lot", createdById: session.userId } });
      return created;
    });
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_BATCH_CREATED", entity: "PharmacyBatch", entityId: batch.id, request: req, metadata: { organizationId, productId: batch.productId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, batch }, { status: 201 });
  } catch (error) {
    const message = duplicateMessage(error);
    if (message) return NextResponse.json({ error: "Duplicate batch", message }, { status: 409 });
    throw error;
  }
}
