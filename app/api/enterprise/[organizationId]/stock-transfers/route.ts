import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { stockTransferCreateSchema } from "@/lib/enterprise/inventory/schemas";
import { createEnterpriseStockTransfer } from "@/lib/enterprise/inventory/service";
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
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const where: Prisma.EnterpriseStockTransferWhereInput = { organizationId, archivedAt: null, ...(status ? { status } : {}), ...(warehouseId ? { OR: [{ sourceWarehouseId: warehouseId }, { destinationWarehouseId: warehouseId }] } : {}) };
  const [items, total, pending, completed] = await Promise.all([
    prisma.enterpriseStockTransfer.findMany({ where, orderBy: [{ requestedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { sourceWarehouse: { select: { id: true, code: true, name: true } }, destinationWarehouse: { select: { id: true, code: true, name: true } }, lines: true } }),
    prisma.enterpriseStockTransfer.count({ where }),
    prisma.enterpriseStockTransfer.count({ where: { organizationId, archivedAt: null, status: "PENDING_APPROVAL" } }),
    prisma.enterpriseStockTransfer.count({ where: { organizationId, archivedAt: null, status: "COMPLETED" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "stock-transfers", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { pending, completed }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-stock-transfer-create:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = stockTransferCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Transfert invalide." }, { status: 400 });
  try {
    const transfer = await createEnterpriseStockTransfer(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_STOCK_TRANSFER_SUBMITTED", entity: "EnterpriseStockTransfer", entityId: transfer.id, request: req, metadata: { organizationId, approverUserId: parsed.data.approverUserId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "stock-transfers" } });
    return NextResponse.json({ ok: true, transfer }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "STOCK_TRANSFER_CREATE_FAILED");
  }
}
