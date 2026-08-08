import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createEnterpriseInventoryReservation } from "@/lib/enterprise/inventory/reservations";
import { inventoryReservationCreateSchema } from "@/lib/enterprise/inventory/reservation-schemas";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status } = retailListParams(req);
  const salesOrderId = new URL(req.url).searchParams.get("salesOrderId")?.trim() || null;
  const where = { organizationId, ...(status ? { status } : {}), ...(salesOrderId ? { salesOrderId } : {}) };
  const [items, total] = await Promise.all([
    prisma.enterpriseInventoryReservation.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseInventoryReservation.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-inventory-reservations", action: "list", page, pageSize, salesOrderId } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "submit", { mutation: true, limit: 240 });
  if (!auth.ok) return auth.response;
  const parsed = inventoryReservationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Réservation invalide." }, { status: 400 });
  try {
    const result = await createEnterpriseInventoryReservation(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_INVENTORY_RESERVED", entity: "EnterpriseInventoryReservation", entityId: result.reservation.id, request: req, metadata: { organizationId, salesOrderId: result.reservation.salesOrderId, salesOrderItemId: result.reservation.salesOrderItemId, warehouseId: result.reservation.warehouseId, quantity: result.reservation.quantity.toFixed(), idempotent: result.idempotent } });
    await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-inventory-reservations", action: "create", idempotent: result.idempotent } });
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_INVENTORY_RESERVATION_FAILED");
  }
}
