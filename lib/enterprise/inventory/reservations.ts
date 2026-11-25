import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import type { inventoryReservationCreateSchema } from "@/lib/enterprise/inventory/reservation-schemas";
import { applyStockMovementTx, requireInventoryStockAuthorityTx, assertCommonInventoryCatalogAuthorityTx } from "@/lib/enterprise/inventory/service";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";
import { prisma } from "@/lib/prisma";
import { consumeReservationLotAllocations, planReservationLotAllocations, readReservationLotAllocations } from "@/lib/enterprise/inventory/lot-allocation";
import { businessDateKey, lotIsExpired } from "@/lib/enterprise/retail/inventory-policy";
import { exactInventoryQuantity, requireInventoryQuantity } from "@/lib/enterprise/inventory/quantity-policy";

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
  retailInvoiceHoldQuantity: string;
  quantityAvailable: string;
};

function decimal(value: Prisma.Decimal.Value = 0) {
  return exactInventoryQuantity(value);
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
      const concurrent = code === "P2034" || (error instanceof Error && /write conflict|deadlock|could not serialize access/i.test(error.message));
      if (!concurrent) throw error;
      if (attempt === maxAttempts) throw new EnterpriseDomainConflictError("INVENTORY_RESERVATION_CONCURRENT");
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
    select: { id: true, lotTracking: true, expiryTracking: true },
  });
  if (!inventoryItem) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);

  const tracked = inventoryItem.lotTracking || inventoryItem.expiryTracking;
  const [warehouses, balances, reservations, retailHolds, organization] = await Promise.all([
    prisma.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ siteId: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, siteId: true, site: { select: { code: true, name: true } } },
    }),
    prisma.enterpriseInventoryBalance.findMany({
      where: { organizationId, inventoryItemId: inventoryItem.id },
      select: { id: true, warehouseId: true, stockLotId: true, storageLocationId: true, quantityOnHand: true, quantityReserved: true, stockLot: { select: { status: true, archivedAt: true, expiryDate: true } }, storageLocation: { select: { status: true, archivedAt: true } } },
    }),
    prisma.enterpriseInventoryReservation.findMany({
      where: activeReservationWhere(organizationId, inventoryItem.id),
      select: { warehouseId: true, quantity: true, fulfilledQuantity: true, lotAllocations: true, storageLocationId: true },
    }),
    readActiveRetailInvoiceStockHoldsTx(prisma, { organizationId, inventoryItemIds: [inventoryItem.id] }),
    tracked ? prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } }) : Promise.resolve(null),
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
  const retailHoldsByWarehouse = new Map<string, Prisma.Decimal>();
  for (const row of retailHolds) {
    retailHoldsByWarehouse.set(row.warehouseId, (retailHoldsByWarehouse.get(row.warehouseId) || decimal()).plus(row.quantity));
  }

  let totalAvailable = decimal();
  const stores = warehouses.map((warehouse) => {
    const balance = balanceByWarehouse.get(warehouse.id) || { onHand: decimal(), legacyReserved: decimal() };
    const reserved = reservationByWarehouse.get(warehouse.id) || decimal();
    const retailHeld = retailHoldsByWarehouse.get(warehouse.id) || decimal();
    let available = Prisma.Decimal.max(decimal(), balance.onHand.minus(balance.legacyReserved).minus(reserved).minus(retailHeld));
    if (tracked) {
      const rows = balances.filter((row) => row.warehouseId === warehouse.id && row.quantityOnHand.gt(0) && (!row.storageLocationId || (row.storageLocation?.status === "ACTIVE" && !row.storageLocation.archivedAt)));
      const physical = rows.reduce((sum, row) => sum.plus(row.quantityOnHand), decimal());
      const plan = physical.gt(0) ? planReservationLotAllocations({ balances: rows, reservations: reservations.filter((row) => row.warehouseId === warehouse.id), holds: retailHolds.filter((row) => row.warehouseId === warehouse.id), quantity: physical, businessDate: businessDateKey(new Date(), organization?.timezone || "UTC"), requireExpiry: inventoryItem.expiryTracking }) : null;
      available = plan ? plan.allocations.reduce((sum, row) => sum.plus(row.quantity), decimal()) : decimal();
    }
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
      retailInvoiceHoldQuantity: retailHeld.toFixed(),
      quantityAvailable: available.toFixed(),
    };
  });
  return { catalogItemId, inventoryItemId: inventoryItem.id, totalAvailable: totalAvailable.toFixed(), stores };
}

export async function createEnterpriseInventoryReservation(organizationId: string, actorUserId: string, input: ReservationCreateInput, options?: { requireTracked?: boolean }) {
  return reservationRetry(() => prisma.$transaction(async (tx) => {
    // Enforce site rights before an idempotency hit can expose another store.
    await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, input.warehouseId);
    const existing = await tx.enterpriseInventoryReservation.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.warehouseId !== input.warehouseId || existing.storageLocationId !== (input.storageLocationId || null) || existing.salesOrderId !== input.salesOrderId
        || existing.salesOrderItemId !== input.salesOrderItemId || !existing.quantity.equals(input.quantity)
        || (existing.expiresAt?.getTime() ?? null) !== (input.expiresAt?.getTime() ?? null) || (options?.requireTracked && !existing.lotAllocations)) {
        throw new EnterpriseDomainConflictError("INVENTORY_RESERVATION_IDEMPOTENCY_COLLISION");
      }
      return { reservation: existing, idempotent: true };
    }

    const [orderItem, warehouse, storageLocation] = await Promise.all([
      tx.enterpriseSalesOrderItem.findFirst({
        where: { id: input.salesOrderItemId, organizationId, salesOrderId: input.salesOrderId, salesOrder: { archivedAt: null } },
        select: { id: true, catalogItemId: true, quantityOrdered: true, quantityFulfilled: true, salesOrder: { select: { id: true, status: true } } },
      }),
      tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      input.storageLocationId
        ? tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: input.warehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!orderItem) throw new EnterpriseDomainError("SALES_ORDER_ITEM_NOT_FOUND", 404);
    if (!orderItem.catalogItemId) throw new EnterpriseDomainError("SALES_ORDER_ITEM_CATALOG_REQUIRED", 409);
    if (!["CONFIRMED", "PROCESSING", "IN_FULFILLMENT", "PARTIALLY_FULFILLED"].includes(orderItem.salesOrder.status)) throw new EnterpriseDomainError("SALES_ORDER_NOT_RESERVABLE", 409);
    if (input.expiresAt && input.expiresAt <= new Date()) throw new EnterpriseDomainError("INVENTORY_RESERVATION_EXPIRY_INVALID", 400);
    if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
    if (input.storageLocationId && !storageLocation) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);

    const remainingOrderQuantity = decimal(orderItem.quantityOrdered).minus(orderItem.quantityFulfilled);
    if (decimal(input.quantity).gt(remainingOrderQuantity)) throw new EnterpriseDomainError("RESERVATION_EXCEEDS_ORDER_REMAINING", 409);

    const catalogItemId = orderItem.catalogItemId;
    const inventoryItem = await tx.enterpriseInventoryItem.findFirst({
      where: { organizationId, catalogItemId, status: "ACTIVE", archivedAt: null, catalogItem: { organizationId, trackInventory: true, status: "ACTIVE", archivedAt: null } },
      select: { id: true, lotTracking: true, expiryTracking: true, catalogItem: { select: { unitOfMeasure: { select: { decimalScale: true } } } } },
    });
    if (!inventoryItem) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);
    requireInventoryQuantity(input.quantity, inventoryItem.catalogItem.unitOfMeasure.decimalScale, { positive: true });
    await assertCommonInventoryCatalogAuthorityTx(tx,organizationId,catalogItemId);

    if (options?.requireTracked && !inventoryItem.lotTracking && !inventoryItem.expiryTracking) throw new EnterpriseDomainError("INVENTORY_RESERVATION_TRACKED_ITEM_REQUIRED", 409);
    const orderPromises = await tx.enterpriseInventoryReservation.findMany({ where: { organizationId, salesOrderItemId: input.salesOrderItemId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { quantity: true, fulfilledQuantity: true } });
    const alreadyPromised = orderPromises.reduce((sum, row) => sum.plus(exactInventoryQuantity(row.quantity).minus(row.fulfilledQuantity)), decimal());
    if (alreadyPromised.plus(input.quantity).gt(remainingOrderQuantity)) throw new EnterpriseDomainError("RESERVATION_EXCEEDS_ORDER_REMAINING", 409);
    const [balances, activeReservations, retailHolds] = await Promise.all([
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
        select: { quantity: true, fulfilledQuantity: true, storageLocationId: true, lotAllocations: true },
      }),
      readActiveRetailInvoiceStockHoldsTx(tx, { organizationId, warehouseId: input.warehouseId, inventoryItemIds: [inventoryItem.id] }),
    ]);
    const onHand = balances.reduce((sum, row) => sum.plus(row.quantityOnHand), decimal());
    const legacyReserved = balances.reduce((sum, row) => sum.plus(row.quantityReserved), decimal());
    const reserved = activeReservations
      .filter((row) => !input.storageLocationId || row.storageLocationId === input.storageLocationId)
      .reduce((sum, row) => sum.plus(decimal(row.quantity).minus(row.fulfilledQuantity)), decimal());
    // Retail invoice promises have no specific storage location. Subtract all
    // of them even when the sales-order request targets one shelf.
    const retailHeld = retailHolds.reduce((sum, row) => sum.plus(row.quantity), decimal());
    const available = onHand.minus(legacyReserved).minus(reserved).minus(retailHeld);
    if (!inventoryItem.lotTracking && !inventoryItem.expiryTracking && decimal(input.quantity).gt(available)) {
      throw new EnterpriseDomainError(
        "INVENTORY_RESERVATION_INSUFFICIENT",
        409,
        `Stock disponible insuffisant: ${available.toFixed()} disponible(s), ${String(input.quantity)} demandé(s).`,
      );
    }

    let lotAllocations: Prisma.InputJsonValue | undefined;
    if (inventoryItem.lotTracking || inventoryItem.expiryTracking) {
      const [pharmacyMapping, sectorEvents] = await Promise.all([
        tx.pharmacyProductExtension.count({ where: { organizationId, catalogItemId } }),
        tx.enterpriseSectorInventoryEvent.count({ where: { organizationId, catalogItemId } }),
      ]);
      if (pharmacyMapping || sectorEvents) throw new EnterpriseDomainError("INVENTORY_RESERVATION_SECTOR_AUTHORITY", 409);
      if (decimal(input.quantity).decimalPlaces() > 6) throw new EnterpriseDomainError("INVENTORY_RESERVATION_ALLOCATION_INVALID", 400);
      const [trackedBalances, organization] = await Promise.all([
        tx.enterpriseInventoryBalance.findMany({
          where: { organizationId, inventoryItemId: inventoryItem.id, warehouseId: input.warehouseId, stockLotId: { not: null }, quantityOnHand: { gt: 0 }, OR: [{ storageLocationId: null }, { storageLocation: { status: "ACTIVE", archivedAt: null } }] },
          select: { id: true, stockLotId: true, storageLocationId: true, quantityOnHand: true, quantityReserved: true, stockLot: { select: { status: true, archivedAt: true, expiryDate: true } } },
        }),
        tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } }),
      ]);
      const plan = planReservationLotAllocations({ balances: trackedBalances, reservations: activeReservations, holds: retailHolds, quantity: input.quantity, businessDate: businessDateKey(new Date(), organization.timezone || "UTC"), requireExpiry: inventoryItem.expiryTracking, storageLocationId: input.storageLocationId });
      if (plan.shortfall.gt(0)) throw new EnterpriseDomainError("INVENTORY_RESERVATION_INSUFFICIENT", 409);
      lotAllocations = plan.allocations;
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
        ...(lotAllocations ? { lotAllocations } : {}),
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
      const allocations = readReservationLotAllocations(reservation);
      if (allocations && consumeQuantity.decimalPlaces() > 6) throw new EnterpriseDomainError("INVENTORY_RESERVATION_ALLOCATION_INVALID", 400);
      const split = allocations ? consumeReservationLotAllocations(allocations, consumeQuantity) : null;
      if (!split) {
        // Historical reservations are never assigned an invented lot. They
        // must be released and re-created if the item now requires lots.
        const inventory = await tx.enterpriseInventoryItem.findFirst({ where: { organizationId: args.organizationId, id: reservation.inventoryItemId }, select: { lotTracking: true, expiryTracking: true } });
        if (inventory?.lotTracking || inventory?.expiryTracking) throw new EnterpriseDomainError("INVENTORY_RESERVATION_REALLOCATION_REQUIRED", 409);
      }
      const nextFulfilled = decimal(reservation.fulfilledQuantity).plus(consumeQuantity);
      const fullyConsumed = nextFulfilled.gte(reservation.quantity);
      // First release only the quantity consumed by this fulfillment. The
      // serializable transaction rolls back both promises and stock on failure.
      const updated = await tx.enterpriseInventoryReservation.updateMany({
        where: { id: reservation.id, organizationId: args.organizationId, revision: reservation.revision, status: "ACTIVE" },
        data: {
          fulfilledQuantity: nextFulfilled,
          ...(split ? { lotAllocations: split.next } : {}),
          status: fullyConsumed ? "FULFILLED" : "ACTIVE",
          fulfilledByUserId: args.actorUserId,
          fulfilledAt: fullyConsumed ? now : null,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError("INVENTORY_RESERVATION_CONFLICT");
      const issues = split ? split.movements.map((entry) => ({ ...entry, quantity: decimal(entry.consumedQuantity), key: `fulfillment:${args.fulfillmentId}:reservation:${reservation.id}:${entry.balanceId}` })) : [{ balanceId: null, stockLotId: null, storageLocationId: reservation.storageLocationId, quantity: consumeQuantity, key: `fulfillment:${args.fulfillmentId}:reservation:${reservation.id}` }];
      for (const issue of issues) {
        if (issue.stockLotId) {
          const [lot, balance, organization] = await Promise.all([
            tx.enterpriseStockLot.findFirst({ where: { organizationId: args.organizationId, id: issue.stockLotId, inventoryItemId: reservation.inventoryItemId, warehouseId: reservation.warehouseId, status: "AVAILABLE", archivedAt: null }, select: { expiryDate: true } }),
            tx.enterpriseInventoryBalance.findFirst({ where: { id: issue.balanceId!, organizationId: args.organizationId, inventoryItemId: reservation.inventoryItemId, warehouseId: reservation.warehouseId, storageLocationId: issue.storageLocationId, stockLotId: issue.stockLotId }, select: { id: true } }),
            tx.organization.findUniqueOrThrow({ where: { id: args.organizationId }, select: { timezone: true } }),
          ]);
          if (!lot || !balance || lotIsExpired(lot.expiryDate, businessDateKey(now, organization.timezone || "UTC"))) throw new EnterpriseDomainError("INVENTORY_RESERVATION_REALLOCATION_REQUIRED", 409);
        }
        const movement = await applyStockMovementTx(tx, args.organizationId, args.actorUserId, {
          inventoryItemId: reservation.inventoryItemId,
          warehouseId: reservation.warehouseId,
          storageLocationId: issue.storageLocationId,
          stockLotId: issue.stockLotId,
          movementType: "SALE_FULFILLMENT",
          direction: "OUT",
          quantity: Number(issue.quantity.toString()),
          sourceEntityType: "EnterpriseFulfillment",
          sourceEntityId: args.fulfillmentId,
          sourceLineId: item.salesOrderItemId,
          idempotencyKey: issue.key,
          reason: "Consommation de réservation lors du fulfillment de commande",
        });
        consumed.push({ reservationId: reservation.id, salesOrderItemId: item.salesOrderItemId, quantity: issue.quantity.toFixed(), movementId: movement.movement.id });
      }
      remainingToFulfill = remainingToFulfill.minus(consumeQuantity);
    }
  }

  return consumed;
}

export async function releaseEnterpriseInventoryReservationTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  reservationId: string,
  actorUserId: string,
  reason: string,
) {
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
}

export async function releaseEnterpriseInventoryReservation(organizationId: string, reservationId: string, actorUserId: string, reason: string) {
  return reservationRetry(() => prisma.$transaction(async (tx) => {
    const reservation = await tx.enterpriseInventoryReservation.findFirst({
      where: { id: reservationId, organizationId }, select: { warehouseId: true },
    });
    if (!reservation) throw new EnterpriseDomainError("INVENTORY_RESERVATION_NOT_FOUND", 404);
    await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, reservation.warehouseId);
    return releaseEnterpriseInventoryReservationTx(tx, organizationId, reservationId, actorUserId, reason);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}
