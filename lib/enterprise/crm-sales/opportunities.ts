import type { z } from "zod";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  publishEnterpriseEvent,
} from "@/lib/enterprise/crm-sales/helpers";
import type { opportunityCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;

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
