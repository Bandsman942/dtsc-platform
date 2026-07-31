import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseReference, publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import type { fulfillmentCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type FulfillmentCreateInput = z.infer<typeof fulfillmentCreateSchema>;

export async function createEnterpriseFulfillment(organizationId: string, salesOrderId: string, actorUserId: string, input: FulfillmentCreateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseFulfillment.findFirst({
      where: { organizationId, idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (existing) return existing;

    const order = await tx.enterpriseSalesOrder.findFirst({
      where: { id: salesOrderId, organizationId, archivedAt: null },
      include: { items: true },
    });
    if (!order) throw new EnterpriseDomainError("SALES_ORDER_NOT_FOUND", 404);
    if (!["CONFIRMED", "IN_FULFILLMENT", "PARTIALLY_FULFILLED"].includes(order.status)) {
      throw new EnterpriseDomainError("SALES_ORDER_NOT_FULFILLABLE", 409);
    }
    if (order.revision !== input.revision) throw new EnterpriseDomainConflictError();

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
            organizationId,
            salesOrderItemId: item.salesOrderItemId,
            quantityFulfilled: item.quantityFulfilled,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true },
    });

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

    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesOrder",
      entityId: order.id,
      eventType: fullyFulfilled ? "SALES_ORDER_FULFILLED" : "SALES_ORDER_PARTIALLY_FULFILLED",
      summary: `Livraison ${fulfillment.reference} enregistrée`,
      actorUserId,
      fromStatus: order.status,
      toStatus: targetStatus,
      metadataJson: { fulfillmentId: fulfillment.id },
    });
    return fulfillment;
  });
}
