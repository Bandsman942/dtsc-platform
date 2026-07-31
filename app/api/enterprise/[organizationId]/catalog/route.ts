import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { catalogItemCreateSchema } from "@/lib/enterprise/master-data/schemas";
import { createEnterpriseCatalogItem } from "@/lib/enterprise/master-data/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const itemType = url.searchParams.get("itemType")?.trim().toUpperCase() || "";
  const categoryId = url.searchParams.get("categoryId")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseCatalogItemWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } : {}),
    ...(itemType ? { itemType } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total, products, services, tracked, units, categories] = await Promise.all([
    prisma.enterpriseCatalogItem.findMany({ where, orderBy: [{ name: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { category: { select: { id: true, code: true, name: true } }, unitOfMeasure: { select: { id: true, code: true, name: true, symbol: true } } } }),
    prisma.enterpriseCatalogItem.count({ where }),
    prisma.enterpriseCatalogItem.count({ where: { organizationId, archivedAt: null, itemType: "PRODUCT", status: "ACTIVE" } }),
    prisma.enterpriseCatalogItem.count({ where: { organizationId, archivedAt: null, itemType: "SERVICE", status: "ACTIVE" } }),
    prisma.enterpriseCatalogItem.count({ where: { organizationId, archivedAt: null, trackInventory: true, status: "ACTIVE" } }),
    prisma.enterpriseUnitOfMeasure.findMany({ where: { organizationId, archivedAt: null, status: "ACTIVE" }, orderBy: { code: "asc" }, take: 100 }),
    prisma.enterpriseCatalogCategory.findMany({ where: { organizationId, archivedAt: null, status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 200 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog", page } });
  return NextResponse.json({ items, units, categories, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { products, services, tracked }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-catalog-create:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = catalogItemCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Article invalide." }, { status: 400 });
  try {
    const item = await createEnterpriseCatalogItem(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CATALOG_ITEM_CREATED", entity: "EnterpriseCatalogItem", entityId: item.id, request: req, metadata: { organizationId, itemType: item.itemType } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog" } });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "CATALOG_ITEM_DUPLICATE" : "CATALOG_ITEM_CREATE_FAILED", message: duplicate ? "Un article possédant ce code ou ce SKU existe déjà." : "Création de l’article impossible." }, { status: duplicate ? 409 : 400 });
  }
}
