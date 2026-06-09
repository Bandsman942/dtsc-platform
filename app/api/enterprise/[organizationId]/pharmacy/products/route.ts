import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyProducts } from "@/lib/pharmacy-product-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { pharmacyProductSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

function nullableText(value: string | null | undefined) {
  return value === "" || value === undefined ? null : value;
}

function nullableNumber(value: string | number | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function productData(data: ReturnType<typeof pharmacyProductSchema.parse>, userId: string): Omit<Prisma.PharmacyProductUncheckedCreateInput, "organizationId"> {
  return {
    ...data,
    genericName: nullableText(data.genericName),
    barcode: nullableText(data.barcode),
    manufacturer: nullableText(data.manufacturer),
    brand: nullableText(data.brand),
    shortDescription: nullableText(data.shortDescription),
    subcategory: nullableText(data.subcategory),
    dosage: nullableText(data.dosage),
    packaging: nullableText(data.packaging),
    administrationRoute: nullableText(data.administrationRoute),
    maxQuantityPerSale: nullableNumber(data.maxQuantityPerSale),
    saleWarningMessage: nullableText(data.saleWarningMessage),
    maxStock: nullableNumber(data.maxStock),
    safetyStock: nullableNumber(data.safetyStock),
    defaultLocation: nullableText(data.defaultLocation),
    shelf: nullableText(data.shelf),
    unitsPerPackage: nullableNumber(data.unitsPerPackage),
    storageType: nullableText(data.storageType),
    tempMin: nullableNumber(data.tempMin),
    tempMax: nullableNumber(data.tempMax),
    storageNotes: nullableText(data.storageNotes),
    referencePurchasePrice: nullableNumber(data.referencePurchasePrice),
    referenceSalePrice: nullableNumber(data.referenceSalePrice),
    targetMargin: nullableNumber(data.targetMargin),
    taxRate: nullableNumber(data.taxRate),
    maxDiscountRate: nullableNumber(data.maxDiscountRate),
    deactivationReason: nullableText(data.deactivationReason),
    notes: nullableText(data.notes),
    createdById: userId,
    updatedById: userId,
  };
}

function duplicateMessage(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target || "");
  return target.includes("barcode") ? "Ce code-barres existe déjà dans cette pharmacie." : "Ce code interne existe déjà dans cette pharmacie.";
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyProducts(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() || "";
  const category = url.searchParams.get("category") || "";
  const form = url.searchParams.get("form") || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 24));
  const where: Prisma.PharmacyProductWhereInput = {
    organizationId,
    ...(category ? { category } : {}),
    ...(form ? { pharmaceuticalForm: form } : {}),
    ...(status ? { status } : {}),
    ...(query ? { OR: [
      { name: { contains: query, mode: "insensitive" } },
      { genericName: { contains: query, mode: "insensitive" } },
      { internalCode: { contains: query, mode: "insensitive" } },
      { barcode: { contains: query, mode: "insensitive" } },
    ] } : {}),
  };
  const [products, totalCount] = await Promise.all([
    prisma.pharmacyProduct.findMany({ where, orderBy: [{ name: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.pharmacyProduct.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ products, totalCount, page, pageCount: Math.max(1, Math.ceil(totalCount / pageSize)) });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `pharmacy-products:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions produits sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyProducts(session.userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = pharmacyProductSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Produit invalide." }, { status: 400 });
  try {
    const product = await prisma.pharmacyProduct.create({ data: { organizationId, ...productData(parsed.data, session.userId) } });
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_PRODUCT_CREATED", entity: "PharmacyProduct", entityId: product.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, product }, { status: 201 });
  } catch (error) {
    const message = duplicateMessage(error);
    if (message) return NextResponse.json({ error: "Duplicate product", message }, { status: 409 });
    throw error;
  }
}
