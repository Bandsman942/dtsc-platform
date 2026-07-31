import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { LEAD_TRANSITIONS } from "@/lib/enterprise/crm-sales/constants";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  normalizeEnterpriseName,
  publishEnterpriseEvent,
} from "@/lib/enterprise/crm-sales/helpers";
import type {
  leadConvertSchema,
  leadCreateSchema,
  leadTransitionSchema,
} from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type LeadCreateInput = z.infer<typeof leadCreateSchema>;
type LeadTransitionInput = z.infer<typeof leadTransitionSchema>;
type LeadConvertInput = z.infer<typeof leadConvertSchema>;

export async function createEnterpriseLead(organizationId: string, actorUserId: string, input: LeadCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const lead = await tx.enterpriseLead.create({
      data: {
        organizationId,
        reference: enterpriseReference("LEAD"),
        partyType: input.partyType,
        legalName: input.legalName,
        displayName: input.displayName || null,
        normalizedName: normalizeEnterpriseName(input.legalName),
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
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseLead",
      entityId: lead.id,
      eventType: "LEAD_CREATED",
      summary: `Lead ${lead.reference} créé`,
      actorUserId,
      toStatus: lead.status,
    });
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
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseLead",
      entityId: lead.id,
      eventType: `LEAD_${input.targetStatus}`,
      summary: `Lead ${lead.reference}: ${lead.status} → ${input.targetStatus}`,
      actorUserId,
      fromStatus: lead.status,
      toStatus: input.targetStatus,
    });
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
        code: enterpriseReference(lead.partyType === "PERSON" ? "PER" : "ORG"),
        primaryEmail: lead.email,
        primaryPhone: lead.phone,
        notes: lead.notes,
        createdByUserId: actorUserId,
        roles: { create: [{ roleCode: "CUSTOMER", createdByUserId: actorUserId }] },
      },
    });

    const opportunity = input.createOpportunity
      ? await tx.enterpriseOpportunity.create({
          data: {
            organizationId,
            reference: enterpriseReference("OPP"),
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
      data: {
        status: "CONVERTED",
        convertedPartyId: party.id,
        convertedOpportunityId: opportunity?.id || null,
        convertedAt: new Date(),
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();

    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseLead",
      entityId: lead.id,
      eventType: "LEAD_CONVERTED",
      summary: `Lead ${lead.reference} converti`,
      actorUserId,
      fromStatus: "QUALIFIED",
      toStatus: "CONVERTED",
      metadataJson: { partyId: party.id, opportunityId: opportunity?.id || null },
    });
    return { partyId: party.id, opportunityId: opportunity?.id || null, idempotent: false };
  });
}
