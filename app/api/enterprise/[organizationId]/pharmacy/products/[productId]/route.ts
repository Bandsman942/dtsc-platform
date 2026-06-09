import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyProducts } from "@/lib/pharmacy-product-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { pharmacyProductUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string; productId: string }> };
const nullableKeys = new Set(["genericName", "barcode", "manufacturer", "brand", "shortDescription", "subcategory", "dosage", "packaging", "administrationRoute", "maxQuantityPerSale", "saleWarningMessage", "maxStock", "safetyStock", "defaultLocation", "shelf", "unitsPerPackage", "storageType", "tempMin", "tempMax", "storageNotes", "referencePurchasePrice", "referenceSalePrice", "targetMargin", "taxRate", "maxDiscountRate", "deactivationReason", "notes"]);

function updateData(data: Record<string, unknown>, userId: string): Prisma.PharmacyProductUncheckedUpdateInput {
  const normalized: Record<string, unknown> = { updatedById: userId };
  for (const [key, value] of Object.entries(data)) normalized[key] = nullableKeys.has(key) && value === "" ? null : value;
  return normalized as Prisma.PharmacyProductUncheckedUpdateInput;
}

function duplicateMessage(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
  return target.includes("barcode") ? "Ce code-barres existe déjà dans cette pharmacie." : "Ce code interne existe déjà dans cette pharmacie.";
}

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, productId } = await params;
  if (!(await canAccessPharmacyProducts(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const product = await prisma.pharmacyProduct.findFirst({ where: { id: productId, organizationId } });
  return product ? NextResponse.json({ product }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `pharmacy-product-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, productId } = await params;
  if (!(await canAccessPharmacyProducts(session.userId, organizationId, "update"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.pharmacyProduct.findFirst({ where: { id: productId, organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = pharmacyProductUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Produit invalide." }, { status: 400 });
  try {
    const product = await prisma.pharmacyProduct.update({ where: { id: productId }, data: updateData(parsed.data, session.userId) });
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_PRODUCT_UPDATED", entity: "PharmacyProduct", entityId: product.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const message = duplicateMessage(error);
    if (message) return NextResponse.json({ error: "Duplicate product", message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, productId } = await params;
  if (!(await canAccessPharmacyProducts(session.userId, organizationId, "archive"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.pharmacyProduct.findFirst({ where: { id: productId, organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const product = await prisma.pharmacyProduct.update({ where: { id: productId }, data: { status: "ARCHIVED", deactivationReason: "Archivage manuel", updatedById: session.userId } });
  await writeAuditLog({ userId: session.userId, action: "PHARMACY_PRODUCT_ARCHIVED", entity: "PharmacyProduct", entityId: product.id, request: req, metadata: { organizationId } });
  return NextResponse.json({ ok: true, product });
}
