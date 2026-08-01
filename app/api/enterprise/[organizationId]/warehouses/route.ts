import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { warehouseCreateSchema, warehouseUpdateSchema } from "@/lib/enterprise/master-data/schemas";
import { createEnterpriseWarehouse, updateEnterpriseWarehouse } from "@/lib/enterprise/master-data/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const siteId = url.searchParams.get("siteId")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseWarehouseWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] } : {}),
    ...(siteId ? { siteId } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total, active, locations] = await Promise.all([
    prisma.enterpriseWarehouse.findMany({ where, orderBy: [{ name: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { site: { select: { id: true, code: true, name: true, city: true } }, storageLocations: { where: { archivedAt: null }, orderBy: { code: "asc" }, take: 20 } } }),
    prisma.enterpriseWarehouse.count({ where }),
    prisma.enterpriseWarehouse.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseStorageLocation.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "warehouses", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { active, locations }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-warehouse-create:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = warehouseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Entrepôt invalide." }, { status: 400 });
  try {
    const warehouse = await createEnterpriseWarehouse(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WAREHOUSE_CREATED", entity: "EnterpriseWarehouse", entityId: warehouse.id, request: req, metadata: { organizationId, siteId: warehouse.siteId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "warehouses" } });
    return NextResponse.json({ ok: true, warehouse }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "WAREHOUSE_DUPLICATE" : "WAREHOUSE_CREATE_FAILED", message: duplicate ? "Un entrepôt possédant ce code existe déjà." : "Création de l’entrepôt impossible." }, { status: duplicate ? 409 : 400 });
  }
}


export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null) as (Record<string, unknown> & { warehouseId?: string }) | null;
  const entityId = typeof raw?.warehouseId === "string" ? raw.warehouseId : "";
  const parsed = warehouseUpdateSchema.safeParse(raw);
  if (!entityId || !parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.success ? "Référence manquante." : parsed.error.issues[0]?.message || "Entrepôt invalide." }, { status: 400 });
  try {
    const entity = await updateEnterpriseWarehouse(organizationId, entityId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WAREHOUSE_UPDATED", entity: "EnterpriseWarehouse", entityId, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, action: "update" } });
    return NextResponse.json({ ok: true, entity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    const conflict = message === "REVISION_CONFLICT";
    return NextResponse.json({ error: message, message: conflict ? "L’élément a été modifié par un autre utilisateur. Actualisez avant de réessayer." : "Modification impossible." }, { status: conflict ? 409 : 400 });
  }
}
