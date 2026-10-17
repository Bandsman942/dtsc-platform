import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  publishEnterpriseEvent,
} from "@/lib/enterprise/crm-sales/helpers";
import type { opportunityCreateSchema, opportunityTransitionSchema, opportunityUpdateSchema, opportunityNoteCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
type OpportunityTransitionInput = z.infer<typeof opportunityTransitionSchema>;
type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;
type OpportunityNoteInput = z.infer<typeof opportunityNoteCreateSchema>;

export async function createEnterpriseOpportunity(organizationId: string, actorUserId: string, input: OpportunityCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true },
    });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);

    const opportunity = await tx.enterpriseOpportunity.create({
      data: {
        organizationId,
        reference: enterpriseReference("OPP"),
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
        nextAction: input.nextAction || null,
        nextActionAt: input.nextActionAt || null,
        createdByUserId: actorUserId,
      },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseOpportunity",
      entityId: opportunity.id,
      eventType: "OPPORTUNITY_CREATED",
      summary: `Opportunité ${opportunity.reference} créée`,
      actorUserId,
      toStatus: opportunity.status,
    });
    return opportunity;
  });
}


const OPPORTUNITY_TRANSITIONS: Record<string, readonly string[]> = {
  OPEN: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  WON: ["CLOSED"],
  LOST: ["CLOSED"],
};

export async function transitionEnterpriseOpportunity(
  organizationId: string,
  opportunityId: string,
  actorUserId: string,
  input: OpportunityTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    const opportunity = await tx.enterpriseOpportunity.findFirst({
      where: { id: opportunityId, organizationId, archivedAt: null },
    });
    if (!opportunity) throw new EnterpriseDomainError("OPPORTUNITY_NOT_FOUND", 404);
    if (!(OPPORTUNITY_TRANSITIONS[opportunity.status] || []).includes(input.targetStatus)) {
      throw new EnterpriseDomainError("OPPORTUNITY_TRANSITION_INVALID", 409);
    }
    if (input.targetStatus === "LOST" && !input.lostReason) {
      throw new EnterpriseDomainError("OPPORTUNITY_LOST_REASON_REQUIRED");
    }
    const updated = await tx.enterpriseOpportunity.updateMany({
      where: { id: opportunity.id, organizationId, revision: input.revision, status: opportunity.status },
      data: {
        status: input.targetStatus,
        probabilityPercent: input.probabilityPercent ?? (input.targetStatus === "WON" ? 100 : opportunity.probabilityPercent),
        nextAction: input.nextAction ?? opportunity.nextAction,
        nextActionAt: input.nextActionAt ?? opportunity.nextActionAt,
        wonAt: input.targetStatus === "WON" ? new Date() : opportunity.wonAt,
        lostAt: input.targetStatus === "LOST" ? new Date() : opportunity.lostAt,
        lostReason: input.targetStatus === "LOST" ? input.lostReason : opportunity.lostReason,
        closedAt: input.targetStatus === "CLOSED" ? new Date() : opportunity.closedAt,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseOpportunity",
      entityId: opportunity.id,
      eventType: `OPPORTUNITY_${input.targetStatus}`,
      summary: `Opportunité ${opportunity.reference}: ${opportunity.status} → ${input.targetStatus}`,
      actorUserId,
      fromStatus: opportunity.status,
      toStatus: input.targetStatus,
      metadataJson: { nextActionAt: input.nextActionAt?.toISOString() || null },
    });
    return tx.enterpriseOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
  });
}

/**
 * Opportunity edits preserve the canonical businessPartyId and never bypass
 * the managed stage transitions. Events are written in the same transaction.
 */
export async function updateEnterpriseOpportunity(
  organizationId: string,
  opportunityId: string,
  actorUserId: string,
  input: OpportunityUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.enterpriseOpportunity.findFirst({
      where: { id: opportunityId, organizationId, archivedAt: null },
    });
    if (!before) throw new EnterpriseDomainError("OPPORTUNITY_NOT_FOUND", 404, "Opportunité introuvable.");
    if (before.revision !== input.revision) throw new EnterpriseDomainConflictError();
    const candidate = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.estimatedValue !== undefined ? { estimatedValue: input.estimatedValue } : {}),
      ...(input.currency !== undefined ? { currency: input.currency || null } : {}),
      ...(input.probabilityPercent !== undefined ? { probabilityPercent: input.probabilityPercent } : {}),
      ...(input.expectedCloseDate !== undefined ? { expectedCloseDate: input.expectedCloseDate } : {}),
      ...(input.source !== undefined ? { source: input.source || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.nextAction !== undefined ? { nextAction: input.nextAction || null } : {}),
      ...(input.nextActionAt !== undefined ? { nextActionAt: input.nextActionAt } : {}),
    };
    if (!Object.keys(candidate).length) throw new EnterpriseDomainError("OPPORTUNITY_NO_CHANGES", 400, "Aucune modification à enregistrer.");
    if (before.status === "CLOSED") throw new EnterpriseDomainError("OPPORTUNITY_CLOSED", 409, "Cette opportunité est clôturée. Consultez son historique.");
    const updated = await tx.enterpriseOpportunity.updateMany({
      where: { id: opportunityId, organizationId, revision: input.revision, archivedAt: null, status: before.status },
      data: { ...candidate, revision: { increment: 1 }, updatedByUserId: actorUserId },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    const changed = Object.keys(candidate).filter((field) => {
      const previous = before[field as keyof typeof before];
      const next = candidate[field as keyof typeof candidate];
      return String(previous ?? "") !== String(next ?? "");
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseOpportunity",
      entityId: opportunityId,
      eventType: "OPPORTUNITY_UPDATED",
      summary: `Opportunité ${before.reference} modifiée`,
      actorUserId,
      fromStatus: before.status,
      toStatus: before.status,
      metadataJson: { changedFields: changed, beforeRevision: input.revision, afterRevision: input.revision + 1 },
    });
    return tx.enterpriseOpportunity.findFirstOrThrow({ where: { id: opportunityId, organizationId, archivedAt: null } });
  });
}

export async function addEnterpriseOpportunityNote(
  organizationId: string,
  opportunityId: string,
  actorUserId: string,
  input: OpportunityNoteInput,
) {
  return prisma.$transaction(async (tx) => {
    const opportunity = await tx.enterpriseOpportunity.findFirst({
      where: { id: opportunityId, organizationId, archivedAt: null },
      select: { id: true, reference: true, revision: true, status: true },
    });
    if (!opportunity) throw new EnterpriseDomainError("OPPORTUNITY_NOT_FOUND", 404, "Opportunité introuvable.");
    const guarded = await tx.enterpriseOpportunity.updateMany({
      where: { id: opportunityId, organizationId, revision: input.revision, archivedAt: null },
      data: { revision: { increment: 1 }, updatedByUserId: actorUserId },
    });
    if (guarded.count !== 1) throw new EnterpriseDomainConflictError();
    const note = await tx.enterpriseOperationalComment.create({
      data: {
        organizationId,
        entityType: "EnterpriseOpportunity",
        entityId: opportunityId,
        authorUserId: actorUserId,
        content: input.content,
        visibility: "INTERNAL",
      },
    });
    // Notes are immutable through this API; the timeline stores the stable comment ID.
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseOpportunity",
      entityId: opportunityId,
      eventType: "OPPORTUNITY_NOTE_ADDED",
      summary: `Note ajoutée à l’opportunité ${opportunity.reference}`,
      actorUserId,
      fromStatus: opportunity.status,
      toStatus: opportunity.status,
      metadataJson: { commentId: note.id, revision: input.revision + 1 },
    });
    return { note, revision: input.revision + 1 };
  });
}
