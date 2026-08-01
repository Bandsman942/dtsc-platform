import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  publishEnterpriseEvent,
} from "@/lib/enterprise/crm-sales/helpers";
import type { opportunityCreateSchema, opportunityTransitionSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
type OpportunityTransitionInput = z.infer<typeof opportunityTransitionSchema>;

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
