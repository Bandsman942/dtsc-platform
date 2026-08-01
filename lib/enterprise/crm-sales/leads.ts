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
    if (input.businessPartyId) {
      const party = await tx.enterpriseBusinessParty.findFirst({
        where: { id: input.businessPartyId, organizationId, archivedAt: null },
        select: { id: true },
      });
      if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    }
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
        businessPartyId: input.businessPartyId || null,
        expectedValue: input.expectedValue ?? null,
        currency: input.currency || null,
        notes: input.notes || null,
        nextAction: input.nextAction || null,
        nextActionAt: input.nextActionAt || null,
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
      metadataJson: { businessPartyId: input.businessPartyId || null },
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

export async function listEnterpriseLeadDuplicateCandidates(organizationId: string, leadId: string) {
  const lead = await prisma.enterpriseLead.findFirst({ where: { id: leadId, organizationId, archivedAt: null } });
  if (!lead) throw new EnterpriseDomainError("LEAD_NOT_FOUND", 404);
  const exactSignals = [
    { normalizedName: lead.normalizedName },
    ...(lead.email ? [{ primaryEmail: { equals: lead.email, mode: "insensitive" as const } }] : []),
    ...(lead.phone ? [{ primaryPhone: lead.phone }] : []),
  ];
  const candidates = lead.businessPartyId
    ? await prisma.enterpriseBusinessParty.findMany({
        where: { organizationId, id: lead.businessPartyId, archivedAt: null },
        take: 1,
        select: { id: true, code: true, partyType: true, legalName: true, displayName: true, primaryEmail: true, primaryPhone: true, status: true },
      })
    : await prisma.enterpriseBusinessParty.findMany({
        where: { organizationId, archivedAt: null, OR: exactSignals },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, code: true, partyType: true, legalName: true, displayName: true, primaryEmail: true, primaryPhone: true, status: true },
      });
  return { lead, candidates };
}

export async function convertEnterpriseLead(organizationId: string, leadId: string, actorUserId: string, input: LeadConvertInput) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.enterpriseLead.findFirst({ where: { id: leadId, organizationId, archivedAt: null } });
    if (!lead) throw new EnterpriseDomainError("LEAD_NOT_FOUND", 404);
    if (lead.status === "CONVERTED" && lead.convertedPartyId) {
      return { partyId: lead.convertedPartyId, opportunityId: lead.convertedOpportunityId, idempotent: true, reusedParty: true };
    }
    if (lead.status !== "QUALIFIED") throw new EnterpriseDomainError("LEAD_MUST_BE_QUALIFIED", 409);
    if (lead.revision !== input.revision) throw new EnterpriseDomainConflictError();

    const selectedPartyId = input.businessPartyId || lead.businessPartyId;
    let party = selectedPartyId
      ? await tx.enterpriseBusinessParty.findFirst({ where: { id: selectedPartyId, organizationId, archivedAt: null } })
      : null;
    if (selectedPartyId && !party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);

    if (!party) {
      const exactCandidates = await tx.enterpriseBusinessParty.findMany({
        where: {
          organizationId,
          archivedAt: null,
          OR: [
            { normalizedName: lead.normalizedName },
            ...(lead.email ? [{ primaryEmail: { equals: lead.email, mode: "insensitive" as const } }] : []),
            ...(lead.phone ? [{ primaryPhone: lead.phone }] : []),
          ],
        },
        select: { id: true },
        take: 2,
      });
      if (exactCandidates.length && !input.createNewParty) {
        throw new EnterpriseDomainError("LEAD_DUPLICATE_PARTY_REQUIRES_SELECTION", 409);
      }
      if (!input.createNewParty) throw new EnterpriseDomainError("LEAD_PARTY_DECISION_REQUIRED", 409);
      party = await tx.enterpriseBusinessParty.create({
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
    } else {
      await tx.enterpriseBusinessPartyRole.upsert({
        where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "CUSTOMER" } },
        update: { status: "ACTIVE", archivedAt: null },
        create: { organizationId, businessPartyId: party.id, roleCode: "CUSTOMER", createdByUserId: actorUserId },
      });
    }

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
            nextAction: lead.nextAction,
            nextActionAt: lead.nextActionAt,
            createdByUserId: actorUserId,
          },
        })
      : null;

    const updated = await tx.enterpriseLead.updateMany({
      where: { id: lead.id, organizationId, revision: input.revision, status: "QUALIFIED" },
      data: {
        status: "CONVERTED",
        businessPartyId: party.id,
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
      metadataJson: { partyId: party.id, opportunityId: opportunity?.id || null, reusedParty: Boolean(selectedPartyId) },
    });
    return { partyId: party.id, opportunityId: opportunity?.id || null, idempotent: false, reusedParty: Boolean(selectedPartyId) };
  });
}
