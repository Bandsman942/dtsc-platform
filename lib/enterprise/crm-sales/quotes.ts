import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { QUOTE_TRANSITIONS } from "@/lib/enterprise/crm-sales/constants";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  publishEnterpriseEvent,
  roundMoney,
} from "@/lib/enterprise/crm-sales/helpers";
import type { quoteCreateSchema, quoteTransitionSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;
type QuoteTransitionInput = z.infer<typeof quoteTransitionSchema>;

export async function createEnterpriseQuote(organizationId: string, actorUserId: string, input: QuoteCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);

    if (input.opportunityId) {
      const opportunity = await tx.enterpriseOpportunity.findFirst({
        where: { id: input.opportunityId, organizationId, businessPartyId: input.businessPartyId, archivedAt: null },
        select: { id: true },
      });
      if (!opportunity) throw new EnterpriseDomainError("OPPORTUNITY_NOT_FOUND", 404);
    }

    const catalogIds = [...new Set(input.items.map((item) => item.catalogItemId).filter((id): id is string => Boolean(id)))];
    if (catalogIds.length) {
      const count = await tx.enterpriseCatalogItem.count({
        where: { organizationId, id: { in: catalogIds }, status: "ACTIVE", archivedAt: null },
      });
      if (count !== catalogIds.length) throw new EnterpriseDomainError("CATALOG_ITEM_NOT_FOUND", 404);
    }

    const calculatedItems = input.items.map((item, index) => {
      const lineSubtotal = roundMoney(item.quantity * item.unitPrice);
      const discountAmount = roundMoney(lineSubtotal * (item.discountRate / 100));
      const taxableBase = roundMoney(lineSubtotal - discountAmount);
      const taxAmount = roundMoney(taxableBase * (item.taxRate / 100));
      return {
        ...item,
        lineSubtotal,
        discountAmount,
        taxAmount,
        lineTotal: roundMoney(taxableBase + taxAmount),
        sortOrder: index,
      };
    });
    const subtotalAmount = roundMoney(calculatedItems.reduce((sum, item) => sum + item.lineSubtotal, 0));
    const discountAmount = roundMoney(calculatedItems.reduce((sum, item) => sum + item.discountAmount, 0));
    const taxAmount = roundMoney(calculatedItems.reduce((sum, item) => sum + item.taxAmount, 0));
    const totalAmount = roundMoney(calculatedItems.reduce((sum, item) => sum + item.lineTotal, 0));

    const quote = await tx.enterpriseQuote.create({
      data: {
        organizationId,
        reference: enterpriseReference("QTE"),
        opportunityId: input.opportunityId || null,
        businessPartyId: input.businessPartyId,
        title: input.title,
        description: input.description || null,
        currency: input.currency,
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        validUntil: input.validUntil || null,
        ownerUserId: input.ownerUserId || actorUserId,
        terms: input.terms || null,
        createdByUserId: actorUserId,
        items: {
          create: calculatedItems.map((item) => ({
            organizationId,
            catalogItemId: item.catalogItemId || null,
            description: item.description,
            quantity: item.quantity,
            unitOfMeasureId: item.unitOfMeasureId || null,
            unitPrice: item.unitPrice,
            discountRate: item.discountRate,
            discountAmount: item.discountAmount,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            lineSubtotal: item.lineSubtotal,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseQuote",
      entityId: quote.id,
      eventType: "QUOTE_CREATED",
      summary: `Devis ${quote.reference} créé`,
      actorUserId,
      toStatus: quote.status,
      metadataJson: { totalAmount, currency: quote.currency },
    });
    return quote;
  });
}

export async function transitionEnterpriseQuote(organizationId: string, quoteId: string, actorUserId: string, input: QuoteTransitionInput) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.enterpriseQuote.findFirst({ where: { id: quoteId, organizationId, archivedAt: null } });
    if (!quote) throw new EnterpriseDomainError("QUOTE_NOT_FOUND", 404);
    if (!(QUOTE_TRANSITIONS[quote.status] || []).includes(input.targetStatus)) {
      throw new EnterpriseDomainError("QUOTE_TRANSITION_INVALID", 409);
    }
    const now = new Date();
    const updated = await tx.enterpriseQuote.updateMany({
      where: { id: quote.id, organizationId, revision: input.revision, status: quote.status },
      data: {
        status: input.targetStatus,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
        sentAt: input.targetStatus === "SENT" ? now : quote.sentAt,
        acceptedAt: input.targetStatus === "ACCEPTED" ? now : quote.acceptedAt,
        rejectedAt: input.targetStatus === "REJECTED" ? now : quote.rejectedAt,
        expiredAt: input.targetStatus === "EXPIRED" ? now : quote.expiredAt,
        cancelledAt: input.targetStatus === "CANCELLED" ? now : quote.cancelledAt,
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseQuote",
      entityId: quote.id,
      eventType: `QUOTE_${input.targetStatus}`,
      summary: `Devis ${quote.reference}: ${quote.status} → ${input.targetStatus}`,
      actorUserId,
      fromStatus: quote.status,
      toStatus: input.targetStatus,
    });
    return tx.enterpriseQuote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
  });
}

export async function convertEnterpriseQuoteToOrder(organizationId: string, quoteId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.enterpriseQuote.findFirst({
      where: { id: quoteId, organizationId, archivedAt: null },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!quote) throw new EnterpriseDomainError("QUOTE_NOT_FOUND", 404);
    if (quote.status === "CONVERTED" && quote.convertedOrderId) {
      return tx.enterpriseSalesOrder.findUniqueOrThrow({ where: { id: quote.convertedOrderId }, include: { items: true } });
    }
    if (quote.status !== "ACCEPTED") throw new EnterpriseDomainError("QUOTE_MUST_BE_ACCEPTED", 409);
    if (quote.revision !== revision) throw new EnterpriseDomainConflictError();

    const order = await tx.enterpriseSalesOrder.create({
      data: {
        organizationId,
        reference: enterpriseReference("SO"),
        businessPartyId: quote.businessPartyId,
        opportunityId: quote.opportunityId,
        quoteId: quote.id,
        title: quote.title,
        description: quote.description,
        status: "CONFIRMED",
        currency: quote.currency,
        subtotalAmount: quote.subtotalAmount,
        discountAmount: quote.discountAmount,
        taxAmount: quote.taxAmount,
        totalAmount: quote.totalAmount,
        ownerUserId: quote.ownerUserId,
        confirmedAt: new Date(),
        createdByUserId: actorUserId,
        items: {
          create: quote.items.map((item) => ({
            organizationId,
            catalogItemId: item.catalogItemId,
            description: item.description,
            quantityOrdered: item.quantity,
            unitOfMeasureId: item.unitOfMeasureId,
            unitPrice: item.unitPrice,
            discountRate: item.discountRate,
            discountAmount: item.discountAmount,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            lineSubtotal: item.lineSubtotal,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    const updated = await tx.enterpriseQuote.updateMany({
      where: { id: quote.id, organizationId, revision, status: "ACCEPTED" },
      data: {
        status: "CONVERTED",
        convertedOrderId: order.id,
        convertedAt: new Date(),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseQuote",
      entityId: quote.id,
      eventType: "QUOTE_CONVERTED",
      summary: `Devis ${quote.reference} converti en commande ${order.reference}`,
      actorUserId,
      fromStatus: "ACCEPTED",
      toStatus: "CONVERTED",
      metadataJson: { salesOrderId: order.id },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesOrder",
      entityId: order.id,
      eventType: "SALES_ORDER_CONFIRMED",
      summary: `Commande ${order.reference} confirmée`,
      actorUserId,
      toStatus: "CONFIRMED",
      metadataJson: { quoteId: quote.id },
    });
    return order;
  });
}
