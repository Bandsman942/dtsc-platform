import { Prisma } from "@prisma/client";
import { createEnterpriseDirectSalesOrder } from "@/lib/enterprise/crm-sales/orders";
import { createEnterpriseInventoryReservation, releaseEnterpriseInventoryReservation } from "@/lib/enterprise/inventory/reservations";
import { previewRetailCommercialPricing } from "@/lib/enterprise/retail/commercial-engine";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";

export const RETAIL_OMNICHANNEL_MODES = ["CLICK_COLLECT", "PICKUP_OTHER_STORE", "SHIP_FROM_STORE", "CUSTOMER_DELIVERY"] as const;
export type RetailOmnichannelMode = (typeof RETAIL_OMNICHANNEL_MODES)[number];

type OmnichannelInput = {
  idempotencyKey: string;
  customerBusinessPartyId: string;
  sourceSiteId: string;
  fulfillmentWarehouseId: string;
  pickupSiteId?: string | null;
  fulfillmentMode: RetailOmnichannelMode;
  currencyCode: string;
  expectedFulfillmentAt?: Date | null;
  reservationExpiresAt?: Date | null;
  lines: Array<{ catalogItemId: string; quantity: number }>;
};

function decimal(value: Prisma.Decimal.Value = 0) { return new Prisma.Decimal(value); }
function money(value: Prisma.Decimal.Value) { return decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP); }

type PreviewLine = Awaited<ReturnType<typeof previewRetailCommercialPricing>>["lines"][number];
function serviceValues(line: PreviewLine) {
  const resolved = decimal(line.resolvedUnitPrice);
  const discount = decimal(line.discountAmount);
  const rate = decimal(line.taxRate);
  if (line.taxIncluded && rate.gt(0)) {
    const divisor = decimal(1).plus(rate);
    return { unitPrice: money(resolved.div(divisor)), discountAmount: money(discount.div(divisor)) };
  }
  return { unitPrice: money(resolved), discountAmount: money(discount) };
}

async function compensateFailedReservations(args: { organizationId: string; actorUserId: string; orderId: string; reservationIds: string[]; cancelFreshOrder: boolean; errorCode: string }) {
  for (const reservationId of [...args.reservationIds].reverse()) {
    await releaseEnterpriseInventoryReservation(args.organizationId, reservationId, args.actorUserId, "OMNICHANNEL_RESERVATION_COMPENSATION").catch(() => null);
  }
  await prisma.enterpriseRetailOrderOrchestration.updateMany({
    where: { organizationId: args.organizationId, salesOrderId: args.orderId },
    data: { status: "RESERVATION_FAILED", updatedByUserId: args.actorUserId },
  });
  if (args.cancelFreshOrder) {
    await prisma.enterpriseSalesOrder.updateMany({
      where: { id: args.orderId, organizationId: args.organizationId, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: args.errorCode, updatedByUserId: args.actorUserId, revision: { increment: 1 } },
    });
  }
}

export async function createRetailOmnichannelOrder(organizationId: string, actorUserId: string, input: OmnichannelInput) {
  const existingContext = await prisma.enterpriseRetailOrderOrchestration.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey, archivedAt: null },
  });
  if (existingContext) {
    const [order, reservations] = await Promise.all([
      prisma.enterpriseSalesOrder.findFirst({ where: { id: existingContext.salesOrderId, organizationId, archivedAt: null }, include: { items: { orderBy: { sortOrder: "asc" } }, fulfillments: { include: { items: true } } } }),
      prisma.enterpriseInventoryReservation.findMany({ where: { organizationId, salesOrderId: existingContext.salesOrderId }, orderBy: [{ createdAt: "asc" }] }),
    ]);
    if (!order) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_ORDER_NOT_FOUND", 409);
    return { order, orchestration: existingContext, reservations, idempotent: true };
  }

  const [site, warehouse, pickupSite, party, catalog] = await Promise.all([
    prisma.enterpriseSite.findFirst({ where: { id: input.sourceSiteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true } }),
    prisma.enterpriseWarehouse.findFirst({ where: { id: input.fulfillmentWarehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, siteId: true } }),
    input.pickupSiteId ? prisma.enterpriseSite.findFirst({ where: { id: input.pickupSiteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true } }) : Promise.resolve(null),
    prisma.enterpriseBusinessParty.findFirst({ where: { id: input.customerBusinessPartyId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, displayName: true, legalName: true } }),
    prisma.enterpriseCatalogItem.findMany({ where: { organizationId, id: { in: input.lines.map((line) => line.catalogItemId) }, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, trackInventory: true } }),
  ]);
  if (!site) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_SOURCE_SITE_INVALID", 409);
  if (!warehouse) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_WAREHOUSE_INVALID", 409);
  if (input.pickupSiteId && !pickupSite) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_PICKUP_SITE_INVALID", 409);
  if (!party) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CUSTOMER_INVALID", 409);
  if (catalog.length !== new Set(input.lines.map((line) => line.catalogItemId)).size) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CATALOG_INVALID", 409);
  if (input.fulfillmentMode === "PICKUP_OTHER_STORE" && (!input.pickupSiteId || pickupSite?.id === site.id)) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_OTHER_STORE_REQUIRED", 409);
  if (input.fulfillmentMode === "CLICK_COLLECT" && pickupSite && pickupSite.id !== warehouse.siteId) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_PICKUP_WAREHOUSE_MISMATCH", 409);

  const preview = await previewRetailCommercialPricing(
    organizationId,
    { siteId: input.sourceSiteId, customerBusinessPartyId: input.customerBusinessPartyId, currencyCode: input.currencyCode, soldAt: new Date(), lines: input.lines },
    { couponCode: null, customerSegmentCode: null, channelCode: "POS" },
  );
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const pricedLines = preview.lines.map((line) => {
    const item = catalogById.get(line.catalogItemId);
    if (!item) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CATALOG_INVALID", 409);
    const service = serviceValues(line);
    return {
      catalogItemId: line.catalogItemId,
      description: item.name,
      quantity: Number(line.quantity),
      unitPrice: Number(service.unitPrice.toString()),
      discountAmount: Number(service.discountAmount.toString()),
      taxRatePercent: Number(decimal(line.taxRate).times(100).toString()),
      taxAmount: Number(line.taxAmount),
      lineSubtotal: Number(money(decimal(line.quantity).times(service.unitPrice)).toString()),
      lineTotal: Number(line.lineTotal),
      trackInventory: item.trackInventory,
    };
  });

  const modeLabel: Record<RetailOmnichannelMode, string> = {
    CLICK_COLLECT: "Click & Collect",
    PICKUP_OTHER_STORE: "Retrait autre magasin",
    SHIP_FROM_STORE: "Ship from store",
    CUSTOMER_DELIVERY: "Livraison client",
  };
  const created = await createEnterpriseDirectSalesOrder(organizationId, actorUserId, {
    idempotencyKey: `retail-omnichannel:${input.idempotencyKey}`,
    businessPartyId: input.customerBusinessPartyId,
    title: `${modeLabel[input.fulfillmentMode]} · ${party.displayName || party.legalName}`,
    description: `Commande omnicanale Retail. Source: ${site.name}. Fulfillment: ${warehouse.name}${pickupSite ? `. Retrait: ${pickupSite.name}` : ""}.`,
    currency: input.currencyCode,
    expectedFulfillmentAt: input.expectedFulfillmentAt || null,
    items: pricedLines.map((line) => ({
      catalogItemId: line.catalogItemId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      taxRatePercent: line.taxRatePercent,
      taxAmount: line.taxAmount,
      lineSubtotal: line.lineSubtotal,
      lineTotal: line.lineTotal,
    })),
    eventMetadata: { channelCode: "POS", fulfillmentMode: input.fulfillmentMode, sourceSiteId: site.id, fulfillmentWarehouseId: warehouse.id, pickupSiteId: pickupSite?.id || null },
  });

  let orchestration;
  try {
    orchestration = await prisma.enterpriseRetailOrderOrchestration.create({
      data: {
        organizationId,
        salesOrderId: created.order.id,
        idempotencyKey: input.idempotencyKey,
        channelCode: "POS",
        fulfillmentMode: input.fulfillmentMode,
        sourceSiteId: site.id,
        fulfillmentWarehouseId: warehouse.id,
        pickupSiteId: pickupSite?.id || null,
        status: "RESERVING",
        createdByUserId: actorUserId,
      },
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code !== "P2002") throw error;
    const concurrent = await prisma.enterpriseRetailOrderOrchestration.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey, archivedAt: null } });
    if (!concurrent) throw error;
    const reservations = await prisma.enterpriseInventoryReservation.findMany({ where: { organizationId, salesOrderId: concurrent.salesOrderId }, orderBy: [{ createdAt: "asc" }] });
    return { order: created.order, orchestration: concurrent, reservations, idempotent: true };
  }

  const orderItemsByCatalog = new Map(created.order.items.filter((item) => item.catalogItemId).map((item) => [item.catalogItemId as string, item]));
  const reservationIds: string[] = [];
  try {
    for (const priced of pricedLines.filter((line) => line.trackInventory)) {
      const orderItem = orderItemsByCatalog.get(priced.catalogItemId);
      if (!orderItem) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_ORDER_ITEM_MISSING", 409);
      const reserved = await createEnterpriseInventoryReservation(organizationId, actorUserId, {
        salesOrderId: created.order.id,
        salesOrderItemId: orderItem.id,
        warehouseId: warehouse.id,
        storageLocationId: null,
        quantity: priced.quantity,
        expiresAt: input.reservationExpiresAt || input.expectedFulfillmentAt || null,
        idempotencyKey: `${input.idempotencyKey}:reservation:${orderItem.id}`,
      });
      reservationIds.push(reserved.reservation.id);
    }
    const updated = await prisma.enterpriseRetailOrderOrchestration.update({ where: { id: orchestration.id }, data: { status: "RESERVED", updatedByUserId: actorUserId } });
    const reservations = await prisma.enterpriseInventoryReservation.findMany({ where: { organizationId, salesOrderId: created.order.id }, orderBy: [{ createdAt: "asc" }] });
    return { order: created.order, orchestration: updated, reservations, idempotent: created.idempotent };
  } catch (error) {
    const errorCode = error instanceof EnterpriseRetailError ? error.code : error instanceof Error ? error.message : "RETAIL_OMNICHANNEL_RESERVATION_FAILED";
    await compensateFailedReservations({ organizationId, actorUserId, orderId: created.order.id, reservationIds, cancelFreshOrder: !created.idempotent, errorCode });
    throw error;
  }
}

export async function getRetailOmnichannelOrders(organizationId: string, page = 1, pageSize = 20) {
  const where: Prisma.EnterpriseRetailOrderOrchestrationWhereInput = { organizationId, archivedAt: null };
  const [contexts, total] = await Promise.all([
    prisma.enterpriseRetailOrderOrchestration.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseRetailOrderOrchestration.count({ where }),
  ]);
  const orderIds = contexts.map((context) => context.salesOrderId);
  const [orders, reservations] = await Promise.all([
    orderIds.length ? prisma.enterpriseSalesOrder.findMany({ where: { organizationId, id: { in: orderIds }, archivedAt: null }, include: { items: { orderBy: { sortOrder: "asc" } }, fulfillments: { orderBy: { createdAt: "desc" }, include: { items: true } } } }) : Promise.resolve([]),
    orderIds.length ? prisma.enterpriseInventoryReservation.findMany({ where: { organizationId, salesOrderId: { in: orderIds } }, orderBy: [{ createdAt: "asc" }] }) : Promise.resolve([]),
  ]);
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const reservationsByOrder = new Map<string, typeof reservations>();
  for (const reservation of reservations) reservationsByOrder.set(reservation.salesOrderId, [...(reservationsByOrder.get(reservation.salesOrderId) || []), reservation]);
  return {
    items: contexts.map((context) => ({ context, order: orderById.get(context.salesOrderId) || null, reservations: reservationsByOrder.get(context.salesOrderId) || [] })),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
