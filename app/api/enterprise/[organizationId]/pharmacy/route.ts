import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule, canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterprisePharmacyRecordSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };
type PharmacyInput = z.infer<typeof enterprisePharmacyRecordSchema>;

const PHARMACY_SECTOR_CODE = "PHARMACY";
const RECORD_TYPES: Record<string, string> = {
  MEDICINES_PRODUCTS: "PHARMACY_PRODUCT",
  BATCH_EXPIRY: "PHARMACY_BATCH",
  STOCK_INVENTORY: "PHARMACY_INVENTORY",
  STOCK_RECEIPTS: "PHARMACY_RECEIPT",
  SALES_DISPENSATION: "PHARMACY_SALE",
  PRESCRIPTIONS: "PHARMACY_PRESCRIPTION",
  SUPPLIERS_ORDERS: "PHARMACY_SUPPLIER_ORDER",
  CASH_INVOICES_PAYMENTS: "PHARMACY_CASH",
  RETURNS_ADJUSTMENTS_LOSSES: "PHARMACY_ADJUSTMENT",
  ALERTS_EXPIRY_LOW_STOCK: "PHARMACY_ALERT",
  QUALITY_PHARMACOVIGILANCE: "PHARMACY_QUALITY_INCIDENT",
  PHARMACY_DOCUMENTS: "PHARMACY_DOCUMENT",
  PHARMACY_REPORTS: "PHARMACY_REPORT",
  PHARMACY_SETTINGS: "PHARMACY_SETTING",
};

function payload(data: PharmacyInput): Prisma.InputJsonValue {
  return {
    productId: data.productId || null,
    batchId: data.batchId || null,
    supplierId: data.supplierId || null,
    purchaseOrderId: data.purchaseOrderId || null,
    receiptId: data.receiptId || null,
    saleId: data.saleId || null,
    prescriptionId: data.prescriptionId || null,
    departmentId: data.departmentId || null,
    responsibleUserId: data.responsibleUserId || null,
    recordKind: data.recordKind || null,
    internalCode: data.internalCode || null,
    genericName: data.genericName || null,
    barcode: data.barcode || null,
    category: data.category || null,
    pharmaceuticalForm: data.pharmaceuticalForm || null,
    dosage: data.dosage || null,
    unit: data.unit || null,
    batchNumber: data.batchNumber || null,
    expiryDate: data.expiryDate || null,
    transactionDate: data.transactionDate || null,
    quantity: data.quantity,
    availableQuantity: data.availableQuantity,
    minStock: data.minStock,
    maxStock: data.maxStock ?? null,
    unitPrice: data.unitPrice,
    totalAmount: data.totalAmount,
    currency: data.currency,
    location: data.location || null,
    paymentMethod: data.paymentMethod || null,
    customerName: data.customerName || null,
    reason: data.reason || null,
    notes: data.notes || null,
    documentUrl: data.documentUrl || null,
    prescriptionRequired: data.prescriptionRequired,
    controlledProduct: data.controlledProduct,
    pharmacistValidationRequired: data.pharmacistValidationRequired,
    stockImpactApplied: false,
  };
}

async function pharmacyOrganization(organizationId: string) {
  return prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: PHARMACY_SECTOR_CODE },
    select: { id: true, name: true },
  });
}

async function validateReference(organizationId: string, id: string | undefined, moduleCode: string, message: string) {
  if (!id) return null;
  if (moduleCode === "MEDICINES_PRODUCTS") {
    const product = await prisma.pharmacyProduct.findFirst({ where: { id, organizationId, status: { not: "ARCHIVED" } }, select: { id: true } });
    return product ? null : message;
  }
  const record = await prisma.enterpriseSectorRecord.findFirst({
    where: { id, organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode, deletedAt: null },
    select: { id: true },
  });
  return record ? null : message;
}

async function validateReferences(organizationId: string, data: PharmacyInput) {
  const checks = [
    [data.productId, "MEDICINES_PRODUCTS", "Le produit sélectionné n'appartient pas à cette pharmacie."],
    [data.batchId, "BATCH_EXPIRY", "Le lot sélectionné n'appartient pas à cette pharmacie."],
    [data.supplierId, "SUPPLIERS_ORDERS", "Le fournisseur sélectionné n'appartient pas à cette pharmacie."],
    [data.purchaseOrderId, "SUPPLIERS_ORDERS", "La commande sélectionnée n'appartient pas à cette pharmacie."],
    [data.receiptId, "STOCK_RECEIPTS", "La réception sélectionnée n'appartient pas à cette pharmacie."],
    [data.saleId, "SALES_DISPENSATION", "La vente sélectionnée n'appartient pas à cette pharmacie."],
    [data.prescriptionId, "PRESCRIPTIONS", "L'ordonnance sélectionnée n'appartient pas à cette pharmacie."],
  ] as const;
  for (const [id, moduleCode, message] of checks) {
    const error = await validateReference(organizationId, id || undefined, moduleCode, message);
    if (error) return error;
  }
  if (data.batchId && data.productId) {
    const batch = await prisma.enterpriseSectorRecord.findFirst({ where: { id: data.batchId, organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode: "BATCH_EXPIRY", deletedAt: null }, select: { payloadJson: true } });
    const batchPayload = batch?.payloadJson as Record<string, unknown> | null;
    if (batchPayload?.productId !== data.productId) return "Le lot sélectionné n'appartient pas au produit choisi.";
  }
  if (data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } });
    if (!department) return "Le département sélectionné n'appartient pas à cette pharmacie.";
  }
  if (data.responsibleUserId || data.assignedToUserId) {
    const userId = data.responsibleUserId || data.assignedToUserId;
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { id: true } });
    if (!member) return "Le collaborateur sélectionné n'appartient pas à cette pharmacie.";
  }
  return null;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const organization = await pharmacyOrganization(organizationId);
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId)) || !organization) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const records = await prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: PHARMACY_SECTOR_CODE, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: { createdBy: { select: { name: true, email: true } }, assignedTo: { select: { id: true, name: true, email: true } } },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ organization, records });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-pharmacy:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions pharmacie sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  if (!(await pharmacyOrganization(organizationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = enterprisePharmacyRecordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || RECORD_TYPES[parsed.data.moduleCode] !== parsed.data.recordType) {
    return NextResponse.json({ error: "Invalid payload", message: "Les informations pharmacie sont invalides." }, { status: 400 });
  }
  const data = parsed.data;
  if (data.moduleCode === "MEDICINES_PRODUCTS") {
    return NextResponse.json({ error: "Dedicated product API required", message: "Utilisez le catalogue Produits & médicaments dédié." }, { status: 400 });
  }
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, data.moduleCode, "write"))) {
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à gérer ce sous-module pharmacie." }, { status: 403 });
  }
  const referenceError = await validateReferences(organizationId, data);
  if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  if (data.moduleCode === "MEDICINES_PRODUCTS" && data.internalCode) {
    const duplicate = await prisma.enterpriseSectorRecord.findFirst({
      where: { organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode: "MEDICINES_PRODUCTS", deletedAt: null, payloadJson: { path: ["internalCode"], equals: data.internalCode } },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ error: "Duplicate product", message: "Ce code produit existe déjà dans cette pharmacie." }, { status: 409 });
  }
  if (data.moduleCode === "BATCH_EXPIRY" && (!data.productId || !data.batchNumber || !data.expiryDate)) {
    return NextResponse.json({ error: "Invalid batch", message: "Produit, numéro de lot et date de péremption sont obligatoires." }, { status: 400 });
  }
  const record = await prisma.enterpriseSectorRecord.create({
    data: { organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode: data.moduleCode, recordType: data.recordType, title: data.title, summary: data.summary || null, status: data.status, priority: data.priority, assignedToUserId: data.assignedToUserId || data.responsibleUserId || null, createdById: session.userId, payloadJson: payload(data) },
    include: { createdBy: { select: { name: true, email: true } }, assignedTo: { select: { id: true, name: true, email: true } } },
  });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_PHARMACY_RECORD_CREATED", entity: "EnterpriseSectorRecord", entityId: record.id, request: req, metadata: { organizationId, moduleCode: data.moduleCode } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, record }, { status: 201 });
}
