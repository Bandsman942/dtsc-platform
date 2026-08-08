import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import type { inventoryReservationCreateSchema } from "@/lib/enterprise/inventory/reservation-schemas";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { prisma } from "@/lib/prisma";

type ReservationCreateInput = z.infer<typeof inventoryReservationCreateSchema>;

export type EnterpriseInventoryReservationFulfillmentItem = {
  salesOrderItemId: string;
  quantityFulfilled: number;
};

type AvailabilityRow = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  quantityOnHand: string;
  legacyQuantityReserved: string;
  reservationQuantity: string;
  quantityAvailable: string;
};

function decimal(value: Prisma.Decimal.Value = 0) {
  return new Prisma.Decimal(value);
}

function activeReservationWhere(
  organizationId: string,
  inventoryItemId: string,
  warehouseId?: string,
): Prisma.EnterpriseInventoryReservationWhereInput {
  const now = new Date();
  return {
    organizationId,
    inventoryItemId,
    status: "ACTIVE",
    ...(warehouseId ? { warehouseId } : {}),
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

async function reservationRetry<T>(work: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
      if (code !== "P2034" || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
  throw lastError;
}

export async function getEnterpriseInventoryAvailability(organizationId: string, catalogItemId: string): Promise<{
  catalogItemId: string;
  inventoryItemId: string;
  totalAvailable: string;
  stores: AvailabilityRow[];
}> {
  const inventoryItem = await prisma.enterpriseInventoryItem.findFirst({
    where: { organizationId, catalogItemId, status: "ACTIVE", archivedAt: null },
    select: { id: true },
  });
  if (!inventoryItem) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);

  const [warehouses, balances, reservations] = await Promise.all([
    prisma.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ siteId: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, siteId: true, site: { select: { code: true, name: true } } },
    }),
    prisma.enterpriseInventoryBalance.findMany({
      where: { organizationId, inventoryItemId: inventoryItem.id },
      select: { warehouseId: true, quantityOnHand: true, quantityReserved: true },
    }),
    prisma.enterpriseInventoryReservation.findMany({
      where: activeReservationWhere(organizationId, inventoryItem.id),
      select: { warehouseId: true, quantity: true, fulfilledQuantity: true },
    }),
  ]);

  const balanceByWarehouse = new Map<string, { onHand: Prisma.Decimal; legacyReserved: Prisma.Decimal }>();
  for (const row of balances) {
    const current = balanceByWarehouse.get(row.warehouseId) || { onHand: decimal(), legacyReserved: decimal() };
    current.onHand = current.onHand.plus(row.quantityOnHand);
    current.legacyReserved = current.legacyReserved.plus(row.quantityReserved);
    balanceByWarehouse.set(row.warehouseId, current);
  }
  const reservationByWarehouse = new Map<string, Prisma.Decimal>();
  for (const row of reservations) {
    const remaining = decimal(row.quantity).minus(row.fulfilledQuantity);
    if (remaining.lte(0)) continue;
    reservationByWarehouse.set(row.warehouseId, (reservationByWarehouse.get(row.warehouseId) || decimal()).plus(remaining));
  }

  let totalAvailable = decimal();
  const stores = warehouses.map((warehouse) => {
    const balance = balanceByWarehouse.get(warehouse.id) || { onHand: decimal(), legacyReserved: decimal() };
    const reserved = reservationByWarehouse.get(warehouse.id) || decimal();
    const available = Prisma.Decimal.max(decimal(), balance.onHand.minus(balance.legacyReserved).minus(reserved));
    totalAvailable = totalAvailable.plus(available);
    return {
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      siteId: warehouse.siteId,
      siteCode: warehouse.site.code,
      siteName: warehouse.site.name,
      quantityOnHand: balance.onHand.toFixed(),
      legacyQuantityReserved: balance.legacyReserved.toFixed(),
      reservationQuantity: reserved.toFixed(),
      quantityAvailable: available.toFixed(),
    };
  });
  return { catalogItemId, inventoryItemId: inventoryItem.id, totalAvailable: totalAvailable.toFixed(), stores };
}

export async function createEnterpriseInventoryReservation(organizationId: string, actorUserId: string, input: ReservationCreateInput) {
  return reservationRetry(() => prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseInventoryReservation.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) return { reservation: existing, idempotent: true };

    const [orderItem, warehouse, storageLocation] = await Promise.all([
      tx.enterpriseSalesOrderItem.findFirst({
        where: { id: input.salesOrderItemId, organizationId, salesOrderId: input.salesOrderId },
        select: { id: true, catalogItemId: true, quantityOrdered: true, quantityFulfilled: true, salesOrder: { select: { id: true, status: true } } },
      }),
      tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      input.storageLocationId
        ? tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: input.warehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!orderItem) throw new EnterpriseDomainError("SALES_ORDER_ITEM_NOT_FOUND", 404);
    if (!orderItem.catalogItemId) throw new EnterpriseDomainError("SALES_ORDER_ITEM_CATALOG_REQUIRED", 409);
    if (!["CONFIRMED", "PROCESSING"].includes(orderItem.salesOrder.status)) throw new EnterpriseDomainError("SALES_ORDER_NOT_RESERVABLE", 409);
    if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
    if (input.storageLocationId && !storageLocation) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);

    const remainingOrderQuantity = decimal(orderItem.quantityOrdered).minus(orderItem.quantityFulfilled);
    if (decimal(input.quantity).gt(remainingOrderQuantity)) throw new EnterpriseDomainError("RESERVATION_EXCEEDS_ORDER_REMAINING", 409);

    const catalogItemId = orderItem.catalogItemId;
    const inventoryItem = await tx.enterpriseInventoryItem.findFirst({
      where: { organizationId, catalogItemId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!inventoryItem) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);

    const [balances, activeReservations] = await Promise.all([
      tx.enterpriseInventoryBalance.findMany({
        where: {
          organizationId,
          inventoryItemId: inventoryItem.id,
          warehouseId: input.warehouseId,
          ...(input.storageLocationId ? { storageLocationId: input.storageLocationId } : {}),
        },
        select: { quantityOnHand: true, quantityReserved: true },
      }),
      tx.enterpriseInventoryReservation.findMany({
        where: activeReservationWhere(organizationId, inventoryItem.id, input.warehouseId),
        select: { quantity: true, fulfilledQuantity: true, storageLocationId: true },
      }),
    ]);
    const onHand = balances.reduce((sum, row) => sum.plus(row.quantityOnHand), decimal());
    const legacyReserved = balances.reduce((sum, row) => sum.plus(row.quantityReserved), decimal());
    const reserved = activeReservations
      .filter((row) => !input.storageLocationId || row.storageLocationId === input.storageLocationId)
      .reduce((sum, row) => sum.plus(decimal(row.quantity).minus(row.fulfilledQuantity)), decimal());
    const available = onHand.minus(legacyReserved).minus(reserved);
    if (decimal(input.quantity).gt(available)) {
      throw new EnterpriseDomainError(
        "INVENTORY_RESERVATION_INSUFFICIENT",
        409,
        `Stock disponible insuffisant: ${available.toFixed()} disponible(s), ${String(input.quantity)} demandé(s).`,
      );
    }

    const reservation = await tx.enterpriseInventoryReservation.create({
      data: {
        organizationId,
        salesOrderId: input.salesOrderId,
        salesOrderItemId: input.salesOrderItemId,
        inventoryItemId: inventoryItem.id,
        warehouseId: input.warehouseId,
        storageLocationId: input.storageLocationId || null,
        quantity: input.quantity,
        expiresAt: input.expiresAt || null,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: actorUserId,
      },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseInventoryReservation",
      entityId: reservation.id,
      eventType: "INVENTORY_RESERVED",
      summary: `Réservation de ${reservation.quantity.toFixed()} unité(s)`,
      actorUserId,
      metadataJson: { salesOrderId: input.salesOrderId, salesOrderItemId: input.salesOrderItemId, warehouseId: input.warehouseId },
    });
    return { reservation, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export async function consumeEnterpriseInventoryReservationsTx(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    salesOrderId: string;
    warehouseId: string;
    fulfillmentId: string;
    actorUserId: string;
    items: EnterpriseInventoryReservationFulfillmentItem[];
  },
) {
  const now = new Date();
  const consumed: Array<{ reservationId: string; salesOrderItemId: string; quantity: string; movementId: string }> = [];

  for (const item of args.items) {
    let remainingToFulfill = decimal(item.quantityFulfilled);
    const reservations = await tx.enterpriseInventoryReservation.findMany({
      where: {
        organizationId: args.organizationId,
        salesOrderId: args.salesOrderId,
        salesOrderItemId: item.salesOrderItemId,
        warehouseId: args.warehouseId,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const reservable = reservations.reduce((sum, reservation) => sum.plus(decimal(reservation.quantity).minus(reservation.fulfilledQuantity)), decimal());
    if (reservable.lt(remainingToFulfill)) {
      throw new EnterpriseDomainError(
        "INVENTORY_RESERVATION_FULFILLMENT_EXCEEDED",
        409,
        `Réservation insuffisante pour livrer ${remainingToFulfill.toFixed()} unité(s).`,
      );
    }

    for (const reservation of reservations) {
      if (remainingToFulfill.lte(0)) break;
      const reservationRemaining = decimal(reservation.quantity).minus(reservation.fulfilledQuantity);
      if (reservationRemaining.lte(0)) continue;
      const consumeQuantity = Prisma.Decimal.min(reservationRemaining, remainingToFulfill);
      const movement = await applyStockMovementTx(tx, args.organizationId, args.actorUserId, {
        inventoryItemId: reservation.inventoryItemId,
        warehouseId: reservation.warehouseId,
        storageLocationId: reservation.storageLocationId,
        stockLotId: null,
        movementType: "SALE_FULFILLMENT",
        direction: "OUT",
        quantity: Number(consumeQuantity.toString()),
        sourceEntityType: "EnterpriseFulfillment",
        sourceEntityId: args.fulfillmentId,
        sourceLineId: item.salesOrderItemId,
        idempotencyKey: `fulfillment:${args.fulfillmentId}:reservation:${reservation.id}`,
        reason: "Consommation de réservation lors du fulfillment de commande",
      });
      const nextFulfilled = decimal(reservation.fulfilledQuantity).plus(consumeQuantity);
      const fullyConsumed = nextFulfilled.gte(reservation.quantity);
      const updated = await tx.enterpriseInventoryReservation.updateMany({
        where: { id: reservation.id, organizationId: args.organizationId, revision: reservation.revision, status: "ACTIVE" },
        data: {
          fulfilledQuantity: nextFulfilled,
          status: fullyConsumed ? "FULFILLED" : "ACTIVE",
          fulfilledByUserId: args.actorUserId,
          fulfilledAt: fullyConsumed ? now : null,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError("INVENTORY_RESERVATION_CONFLICT");
      consumed.push({ reservationId: reservation.id, salesOrderItemId: item.salesOrderItemId, quantity: consumeQuantity.toFixed(), movementId: movement.movement.id });
      remainingToFulfill = remainingToFulfill.minus(consumeQuantity);
    }
  }

  return consumed;
}

export async function releaseEnterpriseInventoryReservation(organizationId: string, reservationId: string, actorUserId: string, reason: string) {
  return reservationRetry(() => prisma.$transaction(async (tx) => {
    const reservation = await tx.enterpriseInventoryReservation.findFirst({ where: { id: reservationId, organizationId } });
    if (!reservation) throw new EnterpriseDomainError("INVENTORY_RESERVATION_NOT_FOUND", 404);
    if (reservation.status === "RELEASED" || reservation.status === "CANCELLED" || reservation.status === "EXPIRED") return reservation;
    if (reservation.status !== "ACTIVE") throw new EnterpriseDomainConflictError("INVENTORY_RESERVATION_NOT_RELEASABLE");
    const updated = await tx.enterpriseInventoryReservation.updateMany({
      where: { id: reservation.id, organizationId, revision: reservation.revision, status: "ACTIVE" },
      data: { status: "RELEASED", releasedByUserId: actorUserId, releasedAt: new Date(), revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError("INVENTORY_RESERVATION_CONFLICT");
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseInventoryReservation",
      entityId: reservation.id,
      eventType: "INVENTORY_RESERVATION_RELEASED",
      summary: "Réservation de stock libérée",
      actorUserId,
      metadataJson: { reason, salesOrderId: reservation.salesOrderId, warehouseId: reservation.warehouseId },
    });
    return tx.enterpriseInventoryReservation.findUniqueOrThrow({ where: { id: reservation.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}
