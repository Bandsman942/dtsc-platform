import type { z } from "zod";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import {
  assertActiveClientOrganization,
  enterpriseReference,
  publishEnterpriseEvent,
} from "@/lib/enterprise/crm-sales/helpers";
import type { contractCreateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { prisma } from "@/lib/prisma";

type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export async function createEnterpriseContract(organizationId: string, actorUserId: string, input: ContractCreateInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
    if (input.approverUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);

    const status = input.approverUserId ? "PENDING_APPROVAL" : "DRAFT";
    const contract = await tx.enterpriseContract.create({
      data: {
        organizationId,
        reference: enterpriseReference("CTR"),
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
      await tx.enterpriseApproval.create({
        data: {
          organizationId,
          targetEntityType: "EnterpriseContract",
          targetEntityId: contract.id,
          requestedByUserId: actorUserId,
          approverUserId: input.approverUserId,
        },
      });
    }
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseContract",
      entityId: contract.id,
      eventType: input.approverUserId ? "CONTRACT_SUBMITTED" : "CONTRACT_CREATED",
      summary: `Contrat ${contract.reference} créé`,
      actorUserId,
      toStatus: status,
    });
    return contract;
  });
}
