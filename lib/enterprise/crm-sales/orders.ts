import { createHash } from "node:crypto";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertActiveClientOrganization, publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { prisma } from "@/lib/prisma";

export type EnterpriseDirectSalesOrderInput = {
  idempotencyKey: string;
  businessPartyId: string;
  title: string;
  description?: string | null;
  currency: string;
  expectedFulfillmentAt?: Date | null;
  ownerUserId?: string | null;
  items: Array<{
    catalogItemId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxRatePercent: number;
    taxAmount: number;
    lineSubtotal: number;
    lineTotal: number;
  }>;
  eventMetadata?: Record<string, unknown>;
};

function deterministicOrderReference(organizationId: string, idempotencyKey: string) {
  const digest = createHash("sha256").update(`${organizationId}:${idempotencyKey}`).digest("hex").slice(0, 14).toUpperCase();
  return `SO-R-${digest}`;
}

export async function createEnterpriseDirectSalesOrder(organizationId: string, actorUserId: string, input: EnterpriseDirectSalesOrderInput) {
  if (!input.items.length) throw new EnterpriseDomainError("SALES_ORDER_ITEMS_REQUIRED", 400);
  const reference = deterministicOrderReference(organizationId, input.idempotencyKey);
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const existing = await tx.enterpriseSalesOrder.findFirst({
      where: { organizationId, reference, archivedAt: null },
      include: { items: { orderBy: { sortOrder: "asc" } }, fulfillments: { include: { items: true } } },
    });
    if (existing) return { order: existing, idempotent: true };

    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);

    const catalogIds = [...new Set(input.items.map((item) => item.catalogItemId))];
    const catalogCount = await tx.enterpriseCatalogItem.count({
      where: { organizationId, id: { in: catalogIds }, status: "ACTIVE", archivedAt: null },
    });
    if (catalogCount !== catalogIds.length) throw new EnterpriseDomainError("CATALOG_ITEM_NOT_FOUND", 404);

    const subtotalAmount = input.items.reduce((sum, item) => sum + item.lineSubtotal, 0);
    const discountAmount = input.items.reduce((sum, item) => sum + item.discountAmount, 0);
    const taxAmount = input.items.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalAmount = input.items.reduce((sum, item) => sum + item.lineTotal, 0);

    const order = await tx.enterpriseSalesOrder.create({
      data: {
        organizationId,
        reference,
        businessPartyId: input.businessPartyId,
        title: input.title,
        description: input.description || null,
        status: "CONFIRMED",
        currency: input.currency,
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        ownerUserId: input.ownerUserId || actorUserId,
        expectedFulfillmentAt: input.expectedFulfillmentAt || null,
        confirmedAt: new Date(),
        createdByUserId: actorUserId,
        items: {
          create: input.items.map((item, index) => ({
            catalogItemId: item.catalogItemId,
            description: item.description,
            quantityOrdered: item.quantity,
            unitPrice: item.unitPrice,
            discountRate: 0,
            discountAmount: item.discountAmount,
            taxRate: item.taxRatePercent,
            taxAmount: item.taxAmount,
            lineSubtotal: item.lineSubtotal,
            lineTotal: item.lineTotal,
            sortOrder: index,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } }, fulfillments: { include: { items: true } } },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesOrder",
      entityId: order.id,
      eventType: "SALES_ORDER_CONFIRMED",
      summary: `Commande ${order.reference} confirmée`,
      actorUserId,
      toStatus: "CONFIRMED",
      metadataJson: { directOrder: true, idempotencyFingerprint: reference, ...(input.eventMetadata || {}) },
    });
    return { order, idempotent: false };
  });
}
