import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { siteCreateSchema, siteUpdateSchema } from "@/lib/enterprise/master-data/schemas";
import { createEnterpriseSite, updateEnterpriseSite } from "@/lib/enterprise/master-data/service";
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
  const siteType = url.searchParams.get("siteType")?.trim().toUpperCase() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseSiteWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { city: { contains: search, mode: "insensitive" } }] } : {}),
    ...(siteType ? { siteType } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total, active, warehouses] = await Promise.all([
    prisma.enterpriseSite.findMany({ where, orderBy: [{ name: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { warehouses: { where: { archivedAt: null }, orderBy: { name: "asc" }, take: 10 } } }),
    prisma.enterpriseSite.count({ where }),
    prisma.enterpriseSite.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseWarehouse.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "sites", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { active, warehouses }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-site-create:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SITES_WAREHOUSES", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = siteCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Site invalide." }, { status: 400 });
  try {
    const site = await createEnterpriseSite(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SITE_CREATED", entity: "EnterpriseSite", entityId: site.id, request: req, metadata: { organizationId, siteType: site.siteType } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "sites" } });
    return NextResponse.json({ ok: true, site }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "SITE_DUPLICATE" : "SITE_CREATE_FAILED", message: duplicate ? "Un site possédant ce code existe déjà." : "Création du site impossible." }, { status: duplicate ? 409 : 400 });
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
  const raw = await req.json().catch(() => null) as (Record<string, unknown> & { siteId?: string }) | null;
  const entityId = typeof raw?.siteId === "string" ? raw.siteId : "";
  const parsed = siteUpdateSchema.safeParse(raw);
  if (!entityId || !parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.success ? "Référence manquante." : parsed.error.issues[0]?.message || "Site invalide." }, { status: 400 });
  try {
    const entity = await updateEnterpriseSite(organizationId, entityId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SITE_UPDATED", entity: "EnterpriseSite", entityId, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, action: "update" } });
    return NextResponse.json({ ok: true, entity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    const conflict = message === "REVISION_CONFLICT";
    return NextResponse.json({ error: message, message: conflict ? "L’élément a été modifié par un autre utilisateur. Actualisez avant de réessayer." : "Modification impossible." }, { status: conflict ? 409 : 400 });
  }
}
