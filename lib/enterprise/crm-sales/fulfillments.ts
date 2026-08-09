import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseReference, publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import type { fulfillmentCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { consumeEnterpriseInventoryReservationsTx } from "@/lib/enterprise/inventory/reservations";
import { prisma } from "@/lib/prisma";

type FulfillmentCreateInput = z.infer<typeof fulfillmentCreateSchema>;

export async function createEnterpriseFulfillment(organizationId: string, salesOrderId: string, actorUserId: string, input: FulfillmentCreateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseFulfillment.findFirst({
      where: { organizationId, idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (existing) return existing;

    const [order, retailOrchestration] = await Promise.all([
      tx.enterpriseSalesOrder.findFirst({
        where: { id: salesOrderId, organizationId, archivedAt: null },
        include: { items: { include: { catalogItem: { select: { trackInventory: true } } } } },
      }),
      tx.enterpriseRetailOrderOrchestration.findFirst({
        where: { organizationId, salesOrderId, archivedAt: null },
      }),
    ]);
    if (!order) throw new EnterpriseDomainError("SALES_ORDER_NOT_FOUND", 404);
    if (!["CONFIRMED", "IN_FULFILLMENT", "PARTIALLY_FULFILLED"].includes(order.status)) {
      throw new EnterpriseDomainError("SALES_ORDER_NOT_FULFILLABLE", 409);
    }
    if (order.revision !== input.revision) throw new EnterpriseDomainConflictError();
    if (retailOrchestration && input.fulfillmentType === "PRODUCT_DELIVERY" && input.warehouseId !== retailOrchestration.fulfillmentWarehouseId) {
      throw new EnterpriseDomainError("RETAIL_FULFILLMENT_WAREHOUSE_MISMATCH", 409);
    }

    const requestedByItem = new Map(input.items.map((item) => [item.salesOrderItemId, item]));
    if (requestedByItem.size !== input.items.length) throw new EnterpriseDomainError("FULFILLMENT_ITEM_DUPLICATE");
    for (const requestItem of input.items) {
      const orderItem = order.items.find((item) => item.id === requestItem.salesOrderItemId);
      if (!orderItem) throw new EnterpriseDomainError("SALES_ORDER_ITEM_NOT_FOUND", 404);
      const remaining = Number(orderItem.quantityOrdered) - Number(orderItem.quantityFulfilled);
      if (requestItem.quantityFulfilled > remaining + 0.000001) {
        throw new EnterpriseDomainError("FULFILLMENT_QUANTITY_EXCEEDED", 409);
      }
    }

    const fulfillment = await tx.enterpriseFulfillment.create({
      data: {
        organizationId,
        salesOrderId: order.id,
        reference: enterpriseReference("FUL"),
        fulfillmentType: input.fulfillmentType,
        status: "COMPLETED",
        warehouseId: input.warehouseId || null,
        fulfilledByUserId: actorUserId,
        fulfilledAt: new Date(),
        acceptedByCustomerAt: input.acceptedByCustomer ? new Date() : null,
        acceptanceNotes: input.acceptanceNotes || null,
        proofDocumentId: input.proofDocumentId || null,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes || null,
        createdByUserId: actorUserId,
        items: {
          create: input.items.map((item) => ({
            salesOrderItemId: item.salesOrderItemId,
            quantityFulfilled: item.quantityFulfilled,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true },
    });

    if (retailOrchestration && input.fulfillmentType === "PRODUCT_DELIVERY") {
      const trackedItems = input.items.filter((requestItem) => {
        const orderItem = order.items.find((item) => item.id === requestItem.salesOrderItemId);
        return Boolean(orderItem?.catalogItem?.trackInventory);
      });
      if (trackedItems.length) {
        if (!input.warehouseId) throw new EnterpriseDomainError("RETAIL_FULFILLMENT_WAREHOUSE_REQUIRED", 409);
        await consumeEnterpriseInventoryReservationsTx(tx, {
          organizationId,
          salesOrderId: order.id,
          warehouseId: input.warehouseId,
          fulfillmentId: fulfillment.id,
          actorUserId,
          items: trackedItems.map((item) => ({ salesOrderItemId: item.salesOrderItemId, quantityFulfilled: item.quantityFulfilled })),
        });
      }
    }

    for (const item of input.items) {
      await tx.enterpriseSalesOrderItem.update({
        where: { id: item.salesOrderItemId },
        data: { quantityFulfilled: { increment: item.quantityFulfilled } },
      });
    }
    const refreshed = await tx.enterpriseSalesOrderItem.findMany({
      where: { organizationId, salesOrderId: order.id },
      select: { quantityOrdered: true, quantityFulfilled: true },
    });
    const fullyFulfilled = refreshed.every((item) => Number(item.quantityFulfilled) >= Number(item.quantityOrdered));
    const partiallyFulfilled = refreshed.some((item) => Number(item.quantityFulfilled) > 0);
    const targetStatus = fullyFulfilled ? "FULFILLED" : partiallyFulfilled ? "PARTIALLY_FULFILLED" : "IN_FULFILLMENT";
    const updated = await tx.enterpriseSalesOrder.updateMany({
      where: { id: order.id, organizationId, revision: input.revision, status: order.status },
      data: {
        status: targetStatus,
        fulfilledAt: fullyFulfilled ? new Date() : order.fulfilledAt,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();

    if (retailOrchestration) {
      await tx.enterpriseRetailOrderOrchestration.updateMany({
        where: { id: retailOrchestration.id, organizationId, archivedAt: null },
        data: {
          status: fullyFulfilled ? "FULFILLED" : partiallyFulfilled ? "PARTIALLY_FULFILLED" : retailOrchestration.status,
          updatedByUserId: actorUserId,
        },
      });
    }

    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesOrder",
      entityId: order.id,
      eventType: fullyFulfilled ? "SALES_ORDER_FULFILLED" : "SALES_ORDER_PARTIALLY_FULFILLED",
      summary: `Livraison ${fulfillment.reference} enregistrée`,
      actorUserId,
      fromStatus: order.status,
      toStatus: targetStatus,
      metadataJson: { fulfillmentId: fulfillment.id, retailOrchestrationId: retailOrchestration?.id || null },
    });
    return fulfillment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
