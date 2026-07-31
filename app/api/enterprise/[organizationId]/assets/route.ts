import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseAsset } from "@/lib/enterprise/projects-assets/assets";
import { assetCreateSchema } from "@/lib/enterprise/projects-assets/schemas";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 25) || 25));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const where: Prisma.EnterpriseAssetWhereInput = { organizationId, archivedAt: null, ...(status ? { status } : {}), ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { serialNumber: { contains: search, mode: "insensitive" } }] } : {}) };
  const [items, total, assigned, maintenance, incidents] = await Promise.all([
    prisma.enterpriseAsset.findMany({ where, orderBy: [{ status: "asc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { category: true, site: true, assignments: { where: { status: "ACTIVE" }, take: 1 }, _count: { select: { maintenanceRecords: true, incidents: true } } } }),
    prisma.enterpriseAsset.count({ where }),
    prisma.enterpriseAsset.count({ where: { organizationId, archivedAt: null, status: "ASSIGNED" } }),
    prisma.enterpriseAsset.count({ where: { organizationId, archivedAt: null, status: "MAINTENANCE" } }),
    prisma.enterpriseAssetIncident.count({ where: { organizationId, archivedAt: null, status: "OPEN" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "assets", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { assigned, maintenance, openIncidents: incidents }, canManage: access.canManage });
}
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-asset-create:${session.userId}`), 100, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = assetCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const asset = await createEnterpriseAsset(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_ASSET_CREATED", entity: "EnterpriseAsset", entityId: asset.id, request: req, metadata: { organizationId } });
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (duplicate) return NextResponse.json({ error: "ASSET_DUPLICATE" }, { status: 409 });
    return enterpriseDomainErrorResponse(error, "ASSET_CREATE_FAILED");
  }
}
