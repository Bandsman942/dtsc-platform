import { Prisma } from "@prisma/client";
import { createEnterpriseDirectSalesOrder } from "@/lib/enterprise/crm-sales/orders";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import {
  createEnterpriseInventoryReservation,
  releaseEnterpriseInventoryReservation,
  releaseEnterpriseInventoryReservationTx,
} from "@/lib/enterprise/inventory/reservations";
import {
  applyRetailRelationshipBenefitPricing,
  resolveRetailCommercialPricingDecisions,
} from "@/lib/enterprise/retail/commercial-engine";
import {
  reserveRetailOmnichannelRelationshipBenefitsTx,
  releaseRetailOmnichannelRelationshipBenefitsTx,
} from "@/lib/enterprise/relationship-benefits/omnichannel-adapter";
import { resolveRetailRelationshipBenefitPricing, resolveRetailRelationshipCashbackEffects } from "@/lib/enterprise/relationship-benefits/retail-adapter";
import { reserveRetailOmnichannelCashbackTx } from "@/lib/enterprise/relationship-benefits/omnichannel-cashback";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
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
function orderMoney(value: Prisma.Decimal.Value) { return decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP); }

function assertSameOmnichannelRequest(
  input: OmnichannelInput,
  context: {
    sourceSiteId: string;
    fulfillmentWarehouseId: string;
    pickupSiteId: string | null;
    fulfillmentMode: string;
  },
  order: {
    businessPartyId: string;
    currency: string;
    items: Array<{ catalogItemId: string | null; quantityOrdered: Prisma.Decimal }>;
  },
) {
  const requestedLines = new Map(input.lines.map((line) => [line.catalogItemId, decimal(line.quantity)]));
  if (
    context.sourceSiteId !== input.sourceSiteId ||
    context.fulfillmentWarehouseId !== input.fulfillmentWarehouseId ||
    (context.pickupSiteId || null) !== (input.pickupSiteId || null) ||
    context.fulfillmentMode !== input.fulfillmentMode ||
    order.businessPartyId !== input.customerBusinessPartyId ||
    order.currency.toUpperCase() !== input.currencyCode.toUpperCase() ||
    requestedLines.size !== input.lines.length ||
    requestedLines.size !== order.items.length ||
    order.items.some((item) => !item.catalogItemId || !requestedLines.get(item.catalogItemId)?.equals(item.quantityOrdered))
  ) {
    throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_IDEMPOTENCY_PAYLOAD_MISMATCH", 409);
  }
}

function assertFinishedOmnichannelReservation(status: string) {
  if (status === "RESERVING" || status === "RESERVATION_FAILED") {
    throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_RESERVATION_INCOMPLETE", 409);
  }
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
    await prisma.$transaction(async (tx) => {
      const cancelled = await tx.enterpriseSalesOrder.updateMany({
        where: { id: args.orderId, organizationId: args.organizationId, status: "CONFIRMED" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: args.errorCode, updatedByUserId: args.actorUserId, revision: { increment: 1 } },
      });
      if (cancelled.count === 1) {
        await releaseRetailOmnichannelRelationshipBenefitsTx({
          tx, organizationId: args.organizationId, orderId: args.orderId,
        });
      }
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
    assertSameOmnichannelRequest(input, existingContext, order);
    assertFinishedOmnichannelReservation(existingContext.status);
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
  if (new Set(input.lines.map((line) => line.catalogItemId)).size !== input.lines.length) {
    throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CATALOG_DUPLICATE", 409);
  }
  if (catalog.length !== new Set(input.lines.map((line) => line.catalogItemId)).size) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CATALOG_INVALID", 409);
  if (input.fulfillmentMode === "PICKUP_OTHER_STORE" && (!input.pickupSiteId || pickupSite?.id === site.id)) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_OTHER_STORE_REQUIRED", 409);
  if (input.fulfillmentMode === "CLICK_COLLECT" && pickupSite && pickupSite.id !== warehouse.siteId) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_PICKUP_WAREHOUSE_MISMATCH", 409);

  const decisions = await resolveRetailCommercialPricingDecisions(
    organizationId,
    { siteId: input.sourceSiteId, customerBusinessPartyId: input.customerBusinessPartyId, currencyCode: input.currencyCode, soldAt: new Date(), lines: input.lines },
    { couponCode: null, customerSegmentCode: null, channelCode: "POS" },
  );
  const relationshipResolution = await resolveRetailRelationshipBenefitPricing({
    organizationId,
    customerBusinessPartyId: input.customerBusinessPartyId,
    currencyCode: input.currencyCode,
    siteId: input.sourceSiteId,
    channelCode: "POS",
    decisions,
  });
  const pricedDecisions = applyRetailRelationshipBenefitPricing(decisions, relationshipResolution.adjustment);
  const cashbackEffects = await resolveRetailRelationshipCashbackEffects({
    organizationId, customerBusinessPartyId: input.customerBusinessPartyId,
    currencyCode: input.currencyCode, siteId: input.sourceSiteId, channelCode: "POS",
    decisions: pricedDecisions,
  });
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const pricedLines = pricedDecisions.map((line) => {
    const item = catalogById.get(line.catalogItemId);
    if (!item) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CATALOG_INVALID", 409);
    // SalesOrder stores two decimal places, while POS pricing stores six.
    // Reject any material drift instead of silently changing the agreed price.
    const unitPrice = orderMoney(line.serviceUnitPrice);
    const discount = orderMoney(line.serviceDiscountAmount);
    let tax = orderMoney(line.taxAmount);
    const expectedTotal = orderMoney(line.lineTotal);
    const lineSubtotal = orderMoney(line.quantity.times(unitPrice));
    const taxResidual = expectedTotal.minus(lineSubtotal).plus(discount);
    if (
      line.taxRate.gt(0) && taxResidual.gte(0) &&
      taxResidual.minus(tax).abs().lte("0.01")
    ) {
      // Keep the customer's canonical total exact after SalesOrder cent rounding.
      tax = taxResidual;
    }
    const computedTotal = lineSubtotal.minus(discount).plus(tax);
    if (!computedTotal.equals(expectedTotal)) {
      throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_PRICE_PRECISION_UNSUPPORTED", 409);
    }
    return {
      catalogItemId: line.catalogItemId,
      description: item.name,
      quantity: Number(line.quantity.toString()),
      unitPrice: Number(unitPrice.toString()),
      discountAmount: Number(discount.toString()),
      taxRatePercent: Number(decimal(line.taxRate).times(100).toString()),
      taxAmount: Number(tax.toString()),
      lineSubtotal: Number(lineSubtotal.toString()),
      lineTotal: Number(expectedTotal.toString()),
      trackInventory: item.trackInventory,
    };
  });
  const expectedOrderTotal = pricedLines.reduce((sum, line) => sum.plus(line.lineTotal), decimal(0));

  const modeLabel: Record<RetailOmnichannelMode, string> = {
    CLICK_COLLECT: "Click & Collect",
    PICKUP_OTHER_STORE: "Retrait autre magasin",
    SHIP_FROM_STORE: "Ship from store",
    CUSTOMER_DELIVERY: "Livraison client",
  };
  const created = await withRetailTransactionRetry(() => createEnterpriseDirectSalesOrder(organizationId, actorUserId, {
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
    eventMetadata: {
      channelCode: "POS", fulfillmentMode: input.fulfillmentMode, sourceSiteId: site.id,
      fulfillmentWarehouseId: warehouse.id, pickupSiteId: pickupSite?.id || null,
      relationshipBenefitIds: [...new Set([...relationshipResolution.effects, ...cashbackEffects].map((effect) => effect.benefitId))],
    },
    onOrderCreatedTx: async (tx, orderId) => {
      await reserveRetailOmnichannelRelationshipBenefitsTx({
        tx, organizationId, actorUserId, orderId,
        sourceSiteId: site.id,
        effects: relationshipResolution.effects,
        expectedTotal: expectedOrderTotal,
      });
      await reserveRetailOmnichannelCashbackTx({
        tx, organizationId, actorUserId, orderId,
        sourceSiteId: site.id, effects: cashbackEffects,
      });
      await tx.enterpriseRetailOrderOrchestration.create({
        data: {
          organizationId, salesOrderId: orderId, idempotencyKey: input.idempotencyKey,
          channelCode: "POS", fulfillmentMode: input.fulfillmentMode,
          sourceSiteId: site.id, fulfillmentWarehouseId: warehouse.id,
          pickupSiteId: pickupSite?.id || null, status: "RESERVING",
          createdByUserId: actorUserId,
        },
      });
    },
  }), { maxAttempts: 3, baseDelayMs: 20 });

  // The order and RESERVING context are committed together. A legacy order
  // with this idempotency key but no context cannot be silently repurposed.
  const orchestration = await prisma.enterpriseRetailOrderOrchestration.findFirst({
    where: { organizationId, idempotencyKey: input.idempotencyKey, salesOrderId: created.order.id, archivedAt: null },
  });
  if (!orchestration) {
    throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_ORDER_CONTEXT_MISSING", 409);
  }
  assertSameOmnichannelRequest(input, orchestration, created.order);
  if (created.idempotent) {
    assertFinishedOmnichannelReservation(orchestration.status);
    const reservations = await prisma.enterpriseInventoryReservation.findMany({
      where: { organizationId, salesOrderId: created.order.id }, orderBy: [{ createdAt: "asc" }],
    });
    return { order: created.order, orchestration, reservations, idempotent: true };
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

export async function cancelRetailOmnichannelOrder(
  organizationId: string,
  actorUserId: string,
  salesOrderId: string,
  input: { revision: number; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    const [order, orchestration, fulfillmentCount] = await Promise.all([
      tx.enterpriseSalesOrder.findFirst({ where: { id: salesOrderId, organizationId, archivedAt: null } }),
      tx.enterpriseRetailOrderOrchestration.findFirst({
        where: { salesOrderId, organizationId, archivedAt: null },
      }),
      tx.enterpriseFulfillment.count({ where: { salesOrderId, organizationId } }),
    ]);
    if (!order || !orchestration) {
      throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_ORDER_NOT_FOUND", 404);
    }
    if (order.status === "CANCELLED" && orchestration.status === "CANCELLED") {
      return { order, orchestration, idempotent: true };
    }
    if (
      order.revision !== input.revision ||
      order.status !== "CONFIRMED" ||
      orchestration.status !== "RESERVED" ||
      fulfillmentCount > 0
    ) {
      throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CANCELLATION_CONFLICT", 409);
    }

    const reservations = await tx.enterpriseInventoryReservation.findMany({
      where: { organizationId, salesOrderId },
      select: { id: true, status: true },
    });
    if (reservations.some((reservation) => reservation.status !== "ACTIVE")) {
      throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CANCELLATION_CONFLICT", 409);
    }
    for (const reservation of reservations) {
      await releaseEnterpriseInventoryReservationTx(
        tx, organizationId, reservation.id, actorUserId, "OMNICHANNEL_ORDER_CANCELLED",
      );
    }
    const updated = await tx.enterpriseSalesOrder.updateMany({
      where: { id: salesOrderId, organizationId, status: "CONFIRMED", revision: input.revision },
      data: {
        status: "CANCELLED", cancelledAt: new Date(), cancellationReason: input.reason,
        updatedByUserId: actorUserId, revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseRetailError("RETAIL_OMNICHANNEL_CANCELLATION_CONFLICT", 409);
    await releaseRetailOmnichannelRelationshipBenefitsTx({ tx, organizationId, orderId: salesOrderId });
    const updatedContext = await tx.enterpriseRetailOrderOrchestration.update({
      where: { id: orchestration.id },
      data: { status: "CANCELLED", updatedByUserId: actorUserId },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesOrder",
      entityId: salesOrderId,
      eventType: "SALES_ORDER_CANCELLED",
      summary: `Commande omnicanale ${order.reference} annulée : ${input.reason}`,
      actorUserId,
      fromStatus: "CONFIRMED",
      toStatus: "CANCELLED",
      metadataJson: { retailOrchestrationId: orchestration.id, reservationCount: reservations.length },
    });
    const cancelled = await tx.enterpriseSalesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });
    return { order: cancelled, orchestration: updatedContext, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function getRetailOmnichannelOrders(organizationId: string, page = 1, pageSize = 20) {
  const where: Prisma.EnterpriseRetailOrderOrchestrationWhereInput = { organizationId, archivedAt: null };
  const [contexts, total] = await Promise.all([
    prisma.enterpriseRetailOrderOrchestration.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseRetailOrderOrchestration.count({ where }),
  ]);
  const orderIds = contexts.map((context) => context.salesOrderId);
  const [orders, reservations] = await Promise.all([
    orderIds.length ? prisma.enterpriseSalesOrder.findMany({ where: { organizationId, id: { in: orderIds }, archivedAt: null }, include: { items: { orderBy: { sortOrder: "asc" }, include: { catalogItem: { select: { trackInventory: true } } } }, fulfillments: { orderBy: { createdAt: "desc" }, include: { items: true } } } }) : Promise.resolve([]),
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
