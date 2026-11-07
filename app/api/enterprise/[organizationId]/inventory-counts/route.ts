import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { retailErrorResponse } from "@/lib/enterprise/retail/http";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { inventoryCountCreateSchema } from "@/lib/enterprise/inventory/schemas";
import { createEnterpriseInventoryCount } from "@/lib/enterprise/inventory/service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let scope: Awaited<ReturnType<typeof retailInventoryVisibleSites>>;
  try { scope = await retailInventoryVisibleSites(organizationId, session.userId); }
  catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  // InventoryCount stores warehouseId as a scalar (no Prisma warehouse
  // relation). Resolve authorized warehouse IDs before filtering any rows.
  const scopedWarehouseIds = scope.isolationEnabled
    ? (await prisma.enterpriseWarehouse.findMany({
        where: { organizationId, siteId: { in: scope.siteIds }, archivedAt: null },
        select: { id: true },
      })).map((warehouse) => warehouse.id)
    : [];
  const siteScope: Prisma.EnterpriseInventoryCountWhereInput = scope.isolationEnabled
    ? { warehouseId: { in: scopedWarehouseIds } }
    : {};
  const baseWhere: Prisma.EnterpriseInventoryCountWhereInput = { organizationId, archivedAt: null, ...siteScope };
  const where: Prisma.EnterpriseInventoryCountWhereInput = {
    AND: [baseWhere, { ...(status ? { status } : {}), ...(warehouseId ? { warehouseId } : {}) }],
  };
  const [items, total, pending, completed] = await Promise.all([
    prisma.enterpriseInventoryCount.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { lines: { orderBy: { createdAt: "asc" } } } }),
    prisma.enterpriseInventoryCount.count({ where }),
    prisma.enterpriseInventoryCount.count({ where: { AND: [baseWhere, { status: "SUBMITTED" }] } }),
    prisma.enterpriseInventoryCount.count({ where: { AND: [baseWhere, { status: "COMPLETED" }] } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory-counts", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { pending, completed }, canManage: access.canManage && !scope.isolationEnabled });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-inventory-count-create:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inventoryCountCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ENTERPRISE_INPUT_INVALID", message: parsed.error.issues[0]?.message || "Inventaire invalide." }, { status: 400 });
  try {
    const count = await createEnterpriseInventoryCount(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_INVENTORY_COUNT_SUBMITTED", entity: "EnterpriseInventoryCount", entityId: count.id, request: req, metadata: { organizationId, approverUserId: parsed.data.approverUserId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "inventory-counts" } });
    return NextResponse.json({ ok: true, count }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "INVENTORY_COUNT_CREATE_FAILED");
  }
}
