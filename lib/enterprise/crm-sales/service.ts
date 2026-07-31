import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { LEAD_TRANSITIONS, QUOTE_TRANSITIONS } from "@/lib/enterprise/crm-sales/constants";
import type {
  contractCreateSchema,
  fulfillmentCreateSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadTransitionSchema,
  opportunityCreateSchema,
  quoteCreateSchema,
  quoteTransitionSchema,
} from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type LeadCreateInput = z.infer<typeof leadCreateSchema>;
type LeadTransitionInput = z.infer<typeof leadTransitionSchema>;
type LeadConvertInput = z.infer<typeof leadConvertSchema>;
type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;
type QuoteTransitionInput = z.infer<typeof quoteTransitionSchema>;
type ContractCreateInput = z.infer<typeof contractCreateSchema>;
type FulfillmentCreateInput = z.infer<typeof fulfillmentCreateSchema>;

function reference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function assertActiveOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { id: true },
  });
  if (!organization) throw new EnterpriseDomainError("ORGANIZATION_NOT_ACTIVE", 403);
}

async function event(tx: Prisma.TransactionClient, input: { organizationId: string; entityType: string; entityId: string; eventType: string; summary: string; actorUserId: string; fromStatus?: string; toStatus?: string; metadataJson?: Prisma.InputJsonValue }) {
  await tx.enterpriseOperationalEvent.create({ data: input });
}

export async function createEnterpriseLead(organizationId: string, actorUserId: string, input: LeadCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveOrganization(tx, organizationId);
    const lead = await tx.enterpriseLead.create({
      data: {
        organizationId,
        reference: reference("LEAD"),
        partyType: input.partyType,
        legalName: input.legalName,
        displayName: input.displayName || null,
        normalizedName: normalizeName(input.legalName),
        email: input.email?.toLocaleLowerCase("fr") || null,
        phone: input.phone || null,
        companyName: input.companyName || null,
        source: input.source || null,
        ownerUserId: input.ownerUserId || actorUserId,
        departmentId: input.departmentId || null,
        expectedValue: input.expectedValue ?? null,
        currency: input.currency || null,
        notes: input.notes || null,
        createdByUserId: actorUserId,
      },
    });
    await event(tx, { organizationId, entityType: "EnterpriseLead", entityId: lead.id, eventType: "LEAD_CREATED", summary: `Lead ${lead.reference} créé`, actorUserId, toStatus: lead.status });
    return lead;
  });
}

export async function transitionEnterpriseLead(organizationId: string, leadId: string, actorUserId: string, input: LeadTransitionInput) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.enterpriseLead.findFirst({ where: { id: leadId, organizationId, archivedAt: null } });
    if (!lead) throw new EnterpriseDomainError("LEAD_NOT_FOUND", 404);
    if (!(LEAD_TRANSITIONS[lead.status] || []).includes(input.targetStatus)) throw new EnterpriseDomainError("LEAD_TRANSITION_INVALID", 409);
    if (input.targetStatus === "LOST" && !input.lostReason) throw new EnterpriseDomainError("LEAD_LOST_REASON_REQUIRED");
    const updated = await tx.enterpriseLead.updateMany({
      where: { id: lead.id, organizationId, revision: input.revision, status: lead.status },
      data: {
        status: input.targetStatus,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
        contactedAt: input.targetStatus === "CONTACTED" ? new Date() : lead.contactedAt,
        qualifiedAt: input.targetStatus === "QUALIFIED" ? new Date() : lead.qualifiedAt,
        lostAt: input.targetStatus === "LOST" ? new Date() : lead.lostAt,
        lostReason: input.targetStatus === "LOST" ? input.lostReason : lead.lostReason,
        archivedAt: input.targetStatus === "ARCHIVED" ? new Date() : lead.archivedAt,
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await event(tx, { organizationId, entityType: "EnterpriseLead", entityId: lead.id, eventType: `LEAD_${input.targetStatus}`, summary: `Lead ${lead.reference}: ${lead.status} → ${input.targetStatus}`, actorUserId, fromStatus: lead.status, toStatus: input.targetStatus });
    return tx.enterpriseLead.findUniqueOrThrow({ where: { id: lead.id } });
  });
}

export async function convertEnterpriseLead(organizationId: string, leadId: string, actorUserId: string, input: LeadConvertInput) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.enterpriseLead.findFirst({ where: { id: leadId, organizationId, archivedAt: null } });
    if (!lead) throw new EnterpriseDomainError("LEAD_NOT_FOUND", 404);
    if (lead.status === "CONVERTED" && lead.convertedPartyId) {
      return { partyId: lead.convertedPartyId, opportunityId: lead.convertedOpportunityId, idempotent: true };
    }
    if (lead.status !== "QUALIFIED") throw new EnterpriseDomainError("LEAD_MUST_BE_QUALIFIED", 409);
    if (lead.revision !== input.revision) throw new EnterpriseDomainConflictError();

    const party = await tx.enterpriseBusinessParty.create({
      data: {
        organizationId,
        partyType: lead.partyType,
        legalName: lead.legalName,
        displayName: lead.displayName,
        normalizedName: lead.normalizedName,
        code: reference(lead.partyType === "PERSON" ? "PER" : "ORG"),
        primaryEmail: lead.email,
        primaryPhone: lead.phone,
        notes: lead.notes,
        createdByUserId: actorUserId,
        roles: { create: [{ organizationId, roleCode: "CUSTOMER", createdByUserId: actorUserId }] },
      },
    });
    const opportunity = input.createOpportunity
      ? await tx.enterpriseOpportunity.create({
          data: {
            organizationId,
            reference: reference("OPP"),
            leadId: lead.id,
            businessPartyId: party.id,
            name: input.opportunityName || `Opportunité ${lead.displayName || lead.legalName}`,
            ownerUserId: lead.ownerUserId || actorUserId,
            departmentId: lead.departmentId,
            estimatedValue: input.estimatedValue ?? lead.expectedValue,
            currency: input.currency || lead.currency,
            expectedCloseDate: input.expectedCloseDate || null,
            source: lead.source,
            createdByUserId: actorUserId,
          },
        })
      : null;
    const updated = await tx.enterpriseLead.updateMany({
      where: { id: lead.id, organizationId, revision: input.revision, status: "QUALIFIED" },
      data: { status: "CONVERTED", convertedPartyId: party.id, convertedOpportunityId: opportunity?.id || null, convertedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await event(tx, { organizationId, entityType: "EnterpriseLead", entityId: lead.id, eventType: "LEAD_CONVERTED", summary: `Lead ${lead.reference} converti`, actorUserId, fromStatus: "QUALIFIED", toStatus: "CONVERTED", metadataJson: { partyId: party.id, opportunityId: opportunity?.id || null } });
    return { partyId: party.id, opportunityId: opportunity?.id || null, idempotent: false };
  });
}

export async function createEnterpriseOpportunity(organizationId: string, actorUserId: string, input: OpportunityCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    const opportunity = await tx.enterpriseOpportunity.create({
      data: {
        organizationId,
        reference: reference("OPP"),
        businessPartyId: input.businessPartyId,
        name: input.name,
        description: input.description || null,
        ownerUserId: input.ownerUserId || actorUserId,
        departmentId: input.departmentId || null,
        estimatedValue: input.estimatedValue ?? null,
        currency: input.currency || null,
        probabilityPercent: input.probabilityPercent,
        expectedCloseDate: input.expectedCloseDate || null,
        source: input.source || null,
        notes: input.notes || null,
        createdByUserId: actorUserId,
      },
    });
    await event(tx, { organizationId, entityType: "EnterpriseOpportunity", entityId: opportunity.id, eventType: "OPPORTUNITY_CREATED", summary: `Opportunité ${opportunity.reference} créée`, actorUserId, toStatus: opportunity.status });
    return opportunity;
  });
}

export async function createEnterpriseQuote(organizationId: string, actorUserId: string, input: QuoteCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    if (input.opportunityId) {
      const opportunity = await tx.enterpriseOpportunity.findFirst({ where: { id: input.opportunityId, organizationId, businessPartyId: input.businessPartyId, archivedAt: null }, select: { id: true } });
      if (!opportunity) throw new EnterpriseDomainError("OPPORTUNITY_NOT_FOUND", 404);
    }
    const catalogIds = [...new Set(input.items.map((item) => item.catalogItemId).filter((id): id is string => Boolean(id)))];
    if (catalogIds.length) {
      const count = await tx.enterpriseCatalogItem.count({ where: { organizationId, id: { in: catalogIds }, status: "ACTIVE", archivedAt: null } });
      if (count !== catalogIds.length) throw new EnterpriseDomainError("CATALOG_ITEM_NOT_FOUND", 404);
    }
    const calculatedItems = input.items.map((item, index) => {
      const lineSubtotal = money(item.quantity * item.unitPrice);
      const discountAmount = money(lineSubtotal * (item.discountRate / 100));
      const taxableBase = money(lineSubtotal - discountAmount);
      const taxAmount = money(taxableBase * (item.taxRate / 100));
      return { ...item, lineSubtotal, discountAmount, taxAmount, lineTotal: money(taxableBase + taxAmount), sortOrder: index };
    });
    const subtotalAmount = money(calculatedItems.reduce((sum, item) => sum + item.lineSubtotal, 0));
    const discountAmount = money(calculatedItems.reduce((sum, item) => sum + item.discountAmount, 0));
    const taxAmount = money(calculatedItems.reduce((sum, item) => sum + item.taxAmount, 0));
    const totalAmount = money(calculatedItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const quote = await tx.enterpriseQuote.create({
      data: {
        organizationId,
        reference: reference("QTE"),
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
        items: { create: calculatedItems.map((item) => ({ organizationId, catalogItemId: item.catalogItemId || null, description: item.description, quantity: item.quantity, unitOfMeasureId: item.unitOfMeasureId || null, unitPrice: item.unitPrice, discountRate: item.discountRate, discountAmount: item.discountAmount, taxRate: item.taxRate, taxAmount: item.taxAmount, lineSubtotal: item.lineSubtotal, lineTotal: item.lineTotal, sortOrder: item.sortOrder })) },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await event(tx, { organizationId, entityType: "EnterpriseQuote", entityId: quote.id, eventType: "QUOTE_CREATED", summary: `Devis ${quote.reference} créé`, actorUserId, toStatus: quote.status, metadataJson: { totalAmount, currency: quote.currency } });
    return quote;
  });
}

export async function transitionEnterpriseQuote(organizationId: string, quoteId: string, actorUserId: string, input: QuoteTransitionInput) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.enterpriseQuote.findFirst({ where: { id: quoteId, organizationId, archivedAt: null } });
    if (!quote) throw new EnterpriseDomainError("QUOTE_NOT_FOUND", 404);
    if (!(QUOTE_TRANSITIONS[quote.status] || []).includes(input.targetStatus)) throw new EnterpriseDomainError("QUOTE_TRANSITION_INVALID", 409);
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
    await event(tx, { organizationId, entityType: "EnterpriseQuote", entityId: quote.id, eventType: `QUOTE_${input.targetStatus}`, summary: `Devis ${quote.reference}: ${quote.status} → ${input.targetStatus}`, actorUserId, fromStatus: quote.status, toStatus: input.targetStatus });
    return tx.enterpriseQuote.findUniqueOrThrow({ where: { id: quote.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  });
}

export async function convertEnterpriseQuoteToOrder(organizationId: string, quoteId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.enterpriseQuote.findFirst({ where: { id: quoteId, organizationId, archivedAt: null }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    if (!quote) throw new EnterpriseDomainError("QUOTE_NOT_FOUND", 404);
    if (quote.status === "CONVERTED" && quote.convertedOrderId) return tx.enterpriseSalesOrder.findUniqueOrThrow({ where: { id: quote.convertedOrderId }, include: { items: true } });
    if (quote.status !== "ACCEPTED") throw new EnterpriseDomainError("QUOTE_MUST_BE_ACCEPTED", 409);
    if (quote.revision !== revision) throw new EnterpriseDomainConflictError();
    const order = await tx.enterpriseSalesOrder.create({
      data: {
        organizationId,
        reference: reference("SO"),
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
        items: { create: quote.items.map((item) => ({ organizationId, catalogItemId: item.catalogItemId, description: item.description, quantityOrdered: item.quantity, unitOfMeasureId: item.unitOfMeasureId, unitPrice: item.unitPrice, discountRate: item.discountRate, discountAmount: item.discountAmount, taxRate: item.taxRate, taxAmount: item.taxAmount, lineSubtotal: item.lineSubtotal, lineTotal: item.lineTotal, sortOrder: item.sortOrder })) },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    const updated = await tx.enterpriseQuote.updateMany({ where: { id: quote.id, organizationId, revision, status: "ACCEPTED" }, data: { status: "CONVERTED", convertedOrderId: order.id, convertedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await event(tx, { organizationId, entityType: "EnterpriseQuote", entityId: quote.id, eventType: "QUOTE_CONVERTED", summary: `Devis ${quote.reference} converti en commande ${order.reference}`, actorUserId, fromStatus: "ACCEPTED", toStatus: "CONVERTED", metadataJson: { salesOrderId: order.id } });
    await event(tx, { organizationId, entityType: "EnterpriseSalesOrder", entityId: order.id, eventType: "SALES_ORDER_CONFIRMED", summary: `Commande ${order.reference} confirmée`, actorUserId, toStatus: "CONFIRMED", metadataJson: { quoteId: quote.id } });
    return order;
  });
}

export async function createEnterpriseContract(organizationId: string, actorUserId: string, input: ContractCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, archivedAt: null }, select: { id: true } });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    const status = input.approverUserId ? "PENDING_APPROVAL" : "DRAFT";
    const contract = await tx.enterpriseContract.create({
      data: {
        organizationId,
        reference: reference("CTR"),
        businessPartyId: input.businessPartyId,
        opportunityId: input.opportunityId || null,
        quoteId: input.quoteId || null,
        contractType: input.contractType,
        title: input.title,
        description: input.description || null,
        status,
        ownerUserId: input.ownerUserId || actorUserId,
        departmentId: input.departmentId || null,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        indicativeAmount: input.indicativeAmount ?? null,
        currency: input.currency || null,
        renewalMode: input.renewalMode,
        renewalNoticeDays: input.renewalNoticeDays ?? null,
        terms: input.terms || null,
        createdByUserId: actorUserId,
      },
    });
    if (input.approverUserId) {
      await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseContract", targetEntityId: contract.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    }
    await event(tx, { organizationId, entityType: "EnterpriseContract", entityId: contract.id, eventType: input.approverUserId ? "CONTRACT_SUBMITTED" : "CONTRACT_CREATED", summary: `Contrat ${contract.reference} créé`, actorUserId, toStatus: status });
    return contract;
  });
}

export async function createEnterpriseFulfillment(organizationId: string, salesOrderId: string, actorUserId: string, input: FulfillmentCreateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseFulfillment.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { items: true } });
    if (existing) return existing;
    const order = await tx.enterpriseSalesOrder.findFirst({ where: { id: salesOrderId, organizationId, archivedAt: null }, include: { items: true } });
    if (!order) throw new EnterpriseDomainError("SALES_ORDER_NOT_FOUND", 404);
    if (!["CONFIRMED", "IN_FULFILLMENT", "PARTIALLY_FULFILLED"].includes(order.status)) throw new EnterpriseDomainError("SALES_ORDER_NOT_FULFILLABLE", 409);
    if (order.revision !== input.revision) throw new EnterpriseDomainConflictError();
    const requestedByItem = new Map(input.items.map((item) => [item.salesOrderItemId, item]));
    if (requestedByItem.size !== input.items.length) throw new EnterpriseDomainError("FULFILLMENT_ITEM_DUPLICATE");
    for (const requestItem of input.items) {
      const orderItem = order.items.find((item) => item.id === requestItem.salesOrderItemId);
      if (!orderItem) throw new EnterpriseDomainError("SALES_ORDER_ITEM_NOT_FOUND", 404);
      const remaining = Number(orderItem.quantityOrdered) - Number(orderItem.quantityFulfilled);
      if (requestItem.quantityFulfilled > remaining + 0.000001) throw new EnterpriseDomainError("FULFILLMENT_QUANTITY_EXCEEDED", 409);
    }
    const fulfillment = await tx.enterpriseFulfillment.create({
      data: {
        organizationId,
        salesOrderId: order.id,
        reference: reference("FUL"),
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
        items: { create: input.items.map((item) => ({ organizationId, salesOrderItemId: item.salesOrderItemId, quantityFulfilled: item.quantityFulfilled, notes: item.notes || null })) },
      },
      include: { items: true },
    });
    for (const item of input.items) {
      await tx.enterpriseSalesOrderItem.update({ where: { id: item.salesOrderItemId }, data: { quantityFulfilled: { increment: item.quantityFulfilled } } });
    }
    const refreshed = await tx.enterpriseSalesOrderItem.findMany({ where: { organizationId, salesOrderId: order.id }, select: { quantityOrdered: true, quantityFulfilled: true } });
    const fullyFulfilled = refreshed.every((item) => Number(item.quantityFulfilled) >= Number(item.quantityOrdered));
    const partiallyFulfilled = refreshed.some((item) => Number(item.quantityFulfilled) > 0);
    const targetStatus = fullyFulfilled ? "FULFILLED" : partiallyFulfilled ? "PARTIALLY_FULFILLED" : "IN_FULFILLMENT";
    const updated = await tx.enterpriseSalesOrder.updateMany({ where: { id: order.id, organizationId, revision: input.revision, status: order.status }, data: { status: targetStatus, fulfilledAt: fullyFulfilled ? new Date() : order.fulfilledAt, revision: { increment: 1 }, updatedByUserId: actorUserId } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await event(tx, { organizationId, entityType: "EnterpriseSalesOrder", entityId: order.id, eventType: fullyFulfilled ? "SALES_ORDER_FULFILLED" : "SALES_ORDER_PARTIALLY_FULFILLED", summary: `Livraison ${fulfillment.reference} enregistrée`, actorUserId, fromStatus: order.status, toStatus: targetStatus, metadataJson: { fulfillmentId: fulfillment.id } });
    return fulfillment;
  });
}
