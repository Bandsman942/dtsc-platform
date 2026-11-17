import { NextResponse } from "next/server";
import { z } from "zod";
import { createEnterpriseInventoryReservation, releaseEnterpriseInventoryReservation } from "@/lib/enterprise/inventory/reservations";
import { inventoryReservationCreateSchema, inventoryReservationReleaseSchema } from "@/lib/enterprise/inventory/reservation-schemas";
import { readReservationLotAllocations } from "@/lib/enterprise/inventory/lot-allocation";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { fulfillmentCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { createEnterpriseFulfillment } from "@/lib/enterprise/crm-sales/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; salesOrderId: string }> };
const reserveSchema = inventoryReservationCreateSchema.omit({ salesOrderId: true }).extend({ action: z.literal("RESERVE") }).strict();
const releaseSchema = inventoryReservationReleaseSchema.extend({ action: z.literal("RELEASE"), reservationId: z.string().min(1).max(240) }).strict();

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-sales-fulfillment:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, salesOrderId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const retailOrchestration = await prisma.enterpriseRetailOrderOrchestration.findFirst({
    where: { organizationId, salesOrderId, archivedAt: null }, select: { id: true },
  });
  if (retailOrchestration) {
    const retailAccess = await getEnterpriseCommonDomainAccess({
      session, organizationId, moduleCode: "RETAIL_POS", action: "write",
    });
    if (!retailAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const payload = await req.json().catch(() => null);
  if (payload?.action === "RESERVE" || payload?.action === "RELEASE") {
    // Retail omnichannel orchestration owns its reservations and cancellation;
    // do not let a generic form break its order state or quota management.
    if (retailOrchestration) return enterpriseDomainErrorResponse(new EnterpriseDomainError("INVENTORY_RESERVATION_RETAIL_MANAGED", 409), "INVENTORY_RESERVATION_FAILED", req);
    const inventoryAccess = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "write" });
    if (!inventoryAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try {
      if (payload.action === "RESERVE") {
        const parsed = reserveSchema.safeParse(payload);
        if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_RESERVATION_INPUT_INVALID", req);
        const input = parsed.data;
        const line = await prisma.enterpriseSalesOrderItem.findFirst({ where: { organizationId, salesOrderId, id: input.salesOrderItemId, salesOrder: { archivedAt: null } }, select: { catalogItemId: true } });
        const tracked = line?.catalogItemId ? await prisma.enterpriseInventoryItem.findFirst({ where: { organizationId, catalogItemId: line.catalogItemId, status: "ACTIVE", archivedAt: null, OR: [{ lotTracking: true }, { expiryTracking: true }] }, select: { id: true } }) : null;
        if (!tracked) throw new EnterpriseDomainError("INVENTORY_RESERVATION_TRACKED_ITEM_REQUIRED", 409);
        const result = await createEnterpriseInventoryReservation(organizationId, session.userId, { salesOrderId, salesOrderItemId: input.salesOrderItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId, quantity: input.quantity, expiresAt: input.expiresAt, idempotencyKey: input.idempotencyKey });
        await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_INVENTORY_RESERVED", entity: "EnterpriseInventoryReservation", entityId: result.reservation.id, request: req, metadata: { organizationId, salesOrderId, idempotent: result.idempotent } });
        await writeApiLog({ request: req, statusCode: result.idempotent ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "sales-order-reservations", action: "reserve" } });
        return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
      }
      const parsed = releaseSchema.safeParse(payload);
      if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "INVENTORY_RESERVATION_INPUT_INVALID", req);
      const existing = await prisma.enterpriseInventoryReservation.findFirst({ where: { organizationId, salesOrderId, id: parsed.data.reservationId }, select: { id: true } });
      if (!existing) throw new EnterpriseDomainError("INVENTORY_RESERVATION_NOT_FOUND", 404);
      const reservation = await releaseEnterpriseInventoryReservation(organizationId, existing.id, session.userId, parsed.data.reason);
      await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_INVENTORY_RESERVATION_RELEASED", entity: "EnterpriseInventoryReservation", entityId: reservation.id, request: req, metadata: { organizationId, salesOrderId, reason: parsed.data.reason } });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "sales-order-reservations", action: "release" } });
      return NextResponse.json({ ok: true, reservation });
    } catch (error) { return enterpriseDomainErrorResponse(error, "INVENTORY_RESERVATION_FAILED", req); }
  }
  const parsed = fulfillmentCreateSchema.safeParse(payload);
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "SALES_ORDERS_FULFILL_INPUT_INVALID", req);
  try {
    const fulfillment = await createEnterpriseFulfillment(organizationId, salesOrderId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_SALES_ORDER_FULFILLED", entity: "EnterpriseSalesOrder", entityId: salesOrderId, request: req, metadata: { organizationId, fulfillmentId: fulfillment.id, idempotencyKey: parsed.data.idempotencyKey } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "sales-orders", action: "fulfill" } });
    return NextResponse.json({ ok: true, fulfillment }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "FULFILLMENT_CREATE_FAILED", req);
  }
}

/** Order-scoped stock promises and physical pick list. Both modules must be
 * readable; write capability and site restrictions are independent. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, salesOrderId } = await params;
  const [salesAccess, inventoryAccess] = await Promise.all([
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "read" }),
    getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" }),
  ]);
  if (!salesAccess || !inventoryAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scope = await retailInventoryVisibleSites(organizationId, session.userId).catch(() => null);
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const order = await prisma.enterpriseSalesOrder.findFirst({ where: { id: salesOrderId, organizationId, archivedAt: null }, select: { id: true, status: true, items: { select: { id: true, catalogItemId: true, description: true, quantityOrdered: true, quantityFulfilled: true } } } });
    if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const catalogIds = order.items.map((item) => item.catalogItemId).filter((id): id is string => Boolean(id));
    const [warehouses, tracked, orchestration] = await Promise.all([
      prisma.enterpriseWarehouse.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, ...(scope.isolationEnabled ? { siteId: { in: scope.siteIds } } : {}) }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, code: true, name: true, siteId: true } }),
      prisma.enterpriseInventoryItem.findMany({ where: { organizationId, catalogItemId: { in: catalogIds }, status: "ACTIVE", archivedAt: null, OR: [{ lotTracking: true }, { expiryTracking: true }] }, select: { catalogItemId: true } }),
      prisma.enterpriseRetailOrderOrchestration.findFirst({ where: { organizationId, salesOrderId, archivedAt: null }, select: { id: true } }),
    ]);
    if (orchestration && !await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "RETAIL_POS", action: "read" })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const pageValue = Number(new URL(req.url).searchParams.get("page") || 1);
    const page = Number.isSafeInteger(pageValue) ? Math.max(1, Math.min(10000, pageValue)) : 1;
    const pageSize = 25;
    const where = { organizationId, salesOrderId, warehouseId: { in: warehouses.map((warehouse) => warehouse.id) } };
    const [reservations, total] = await Promise.all([
      prisma.enterpriseInventoryReservation.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.enterpriseInventoryReservation.count({ where }),
    ]);
    const snapshots = reservations.map((reservation) => ({ reservation, allocations: readReservationLotAllocations(reservation) }));
    const ids = [...new Set(snapshots.flatMap(({ allocations }) => (allocations || []).map((allocation) => allocation.stockLotId)))];
    const [lots, locations] = await Promise.all([
      prisma.enterpriseStockLot.findMany({ where: { organizationId, id: { in: ids }, warehouseId: { in: warehouses.map((warehouse) => warehouse.id) } }, select: { id: true, inventoryItemId: true, warehouseId: true, lotNumber: true, expiryDate: true, status: true, archivedAt: true } }),
      prisma.enterpriseStorageLocation.findMany({ where: { organizationId, id: { in: [...new Set(snapshots.flatMap(({ allocations }) => (allocations || []).map((allocation) => allocation.storageLocationId).filter((id): id is string => Boolean(id))))] }, warehouseId: { in: warehouses.map((warehouse) => warehouse.id) } }, select: { id: true, warehouseId: true, code: true, name: true } }),
    ]);
    const trackedIds = new Set(tracked.map((item) => item.catalogItemId));
    const canMutate = !orchestration && salesAccess.canWrite && inventoryAccess.canWrite && ["CONFIRMED", "IN_FULFILLMENT", "PARTIALLY_FULFILLED", "PROCESSING"].includes(order.status);
    const rows = snapshots.map(({ reservation, allocations }) => ({
      id: reservation.id, salesOrderItemId: reservation.salesOrderItemId, warehouseId: reservation.warehouseId, status: reservation.status, quantity: reservation.quantity.toFixed(), fulfilledQuantity: reservation.fulfilledQuantity.toFixed(), expiresAt: reservation.expiresAt,
      canRelease: canMutate && reservation.status === "ACTIVE" && warehouses.some((warehouse) => warehouse.id === reservation.warehouseId && (!scope.isolationEnabled || scope.manageableSiteIds.includes(warehouse.siteId))),
      allocations: allocations?.map((allocation) => {
        const lot = lots.find((entry) => entry.id === allocation.stockLotId && entry.inventoryItemId === reservation.inventoryItemId && entry.warehouseId === reservation.warehouseId);
        const location = locations.find((entry) => entry.id === allocation.storageLocationId && entry.warehouseId === reservation.warehouseId);
        return { lotNumber: lot?.lotNumber || null, expiryDate: lot?.expiryDate || null, status: lot?.archivedAt ? "ARCHIVED" : lot?.status || "UNKNOWN", location: location ? location.code + " · " + location.name : null, quantity: allocation.quantity, fulfilledQuantity: allocation.fulfilledQuantity };
      }) || null,
    }));
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "sales-order-reservations", action: "list" } });
    return NextResponse.json({ orderItems: order.items.filter((item) => item.catalogItemId && trackedIds.has(item.catalogItemId)).map((item) => ({ id: item.id, description: item.description, remaining: item.quantityOrdered.minus(item.quantityFulfilled).toFixed() })), warehouses: warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, code: warehouse.code, canReserve: canMutate && (!scope.isolationEnabled || scope.manageableSiteIds.includes(warehouse.siteId)) })), items: rows, pagination: { page, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, canReserve: canMutate, retailManaged: Boolean(orchestration) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return enterpriseDomainErrorResponse(error, "INVENTORY_RESERVATION_LOAD_FAILED", req); }
}
