import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { stockMovementCreateSchema } from "@/lib/enterprise/inventory/schemas";
import { applyEnterpriseStockMovement } from "@/lib/enterprise/inventory/service";
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
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") || 30) || 30));
  const inventoryItemId = url.searchParams.get("inventoryItemId")?.trim() || "";
  const warehouseId = url.searchParams.get("warehouseId")?.trim() || "";
  const movementType = url.searchParams.get("movementType")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseStockMovementWhereInput = { organizationId, ...(inventoryItemId ? { inventoryItemId } : {}), ...(warehouseId ? { warehouseId } : {}), ...(movementType ? { movementType } : {}) };
  const [items, total] = await Promise.all([
    prisma.enterpriseStockMovement.findMany({ where, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { inventoryItem: { include: { catalogItem: { select: { id: true, code: true, name: true } } } }, warehouse: { select: { id: true, code: true, name: true } }, storageLocation: { select: { id: true, code: true, name: true } }, stockLot: { select: { id: true, lotNumber: true, expiryDate: true } } } }),
    prisma.enterpriseStockMovement.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "stock-movements", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-opening-stock:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = stockMovementCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Mouvement invalide." }, { status: 400 });
  if (parsed.data.movementType !== "OPENING_BALANCE" || parsed.data.direction !== "IN") return NextResponse.json({ error: "DIRECT_MOVEMENT_FORBIDDEN", message: "Seul un stock d’ouverture entrant peut être saisi directement." }, { status: 409 });
  try {
    const result = await applyEnterpriseStockMovement(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_OPENING_STOCK_CREATED", entity: "EnterpriseStockMovement", entityId: result.movement.id, request: req, metadata: { organizationId, idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "stock-movements", action: "opening-balance" } });
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "STOCK_MOVEMENT_FAILED");
  }
}
