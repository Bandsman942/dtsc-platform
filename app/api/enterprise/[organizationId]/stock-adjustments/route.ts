import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createEnterpriseStockAdjustment } from "@/lib/enterprise/inventory/adjustment-service";
import { stockAdjustmentCreateSchema } from "@/lib/enterprise/inventory/schemas";
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
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseStockAdjustmentWhereInput = { organizationId, ...(status ? { status } : {}) };
  const [items, total, pending, completed] = await Promise.all([
    prisma.enterpriseStockAdjustment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        inventoryItem: { include: { catalogItem: { select: { code: true, sku: true, name: true } } } },
      },
    }),
    prisma.enterpriseStockAdjustment.count({ where }),
    prisma.enterpriseStockAdjustment.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
    prisma.enterpriseStockAdjustment.count({ where: { organizationId, status: "COMPLETED" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "stock-adjustments", page } });
  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { pending, completed },
    canManage: access.canManage,
    currentUserId: session.userId,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-stock-adjustment-create:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = stockAdjustmentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Ajustement invalide." }, { status: 400 });
  try {
    const adjustment = await createEnterpriseStockAdjustment(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_STOCK_ADJUSTMENT_SUBMITTED", entity: "EnterpriseStockAdjustment", entityId: adjustment.id, request: req, metadata: { organizationId, approverUserId: parsed.data.approverUserId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "stock-adjustments" } });
    return NextResponse.json({ ok: true, adjustment }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "STOCK_ADJUSTMENT_CREATE_FAILED");
  }
}
