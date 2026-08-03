import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enqueueWorkflowDomainEvent } from "@/lib/enterprise/workflows/domain-events";

export function operationsReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function publishOperationsEvent(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    summary: string;
    actorUserId: string;
    fromStatus?: string;
    toStatus?: string;
    metadataJson?: Prisma.InputJsonValue;
  },
) {
  await tx.enterpriseOperationalEvent.create({ data: input });
  await enqueueWorkflowDomainEvent(tx, {
    organizationId: input.organizationId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    metadata: input.metadataJson,
  });
}

export async function assertActiveOrganizationMember(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
) {
  const membership = await tx.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null },
    select: { id: true },
  });
  if (!membership) throw new EnterpriseDomainError("ORGANIZATION_MEMBER_NOT_FOUND", 404);
}

export async function assertProjectRelations(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    businessPartyId?: string | null;
    contractId?: string | null;
    ownerUserId?: string | null;
    siteId?: string | null;
    memberEmployeeIds?: string[];
  },
) {
  const [party, contract, site] = await Promise.all([
    input.businessPartyId
      ? tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, archivedAt: null }, select: { id: true } })
      : Promise.resolve(null),
    input.contractId
      ? tx.enterpriseContract.findFirst({ where: { id: input.contractId, organizationId, archivedAt: null }, select: { id: true, businessPartyId: true } })
      : Promise.resolve(null),
    input.siteId
      ? tx.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, archivedAt: null, status: "ACTIVE" }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (input.businessPartyId && !party) throw new EnterpriseDomainError("BUSINESS_PARTY_NOT_FOUND", 404);
  if (input.contractId && !contract) throw new EnterpriseDomainError("CONTRACT_NOT_FOUND", 404);
  if (contract && input.businessPartyId && contract.businessPartyId !== input.businessPartyId) {
    throw new EnterpriseDomainError("PROJECT_CONTRACT_PARTY_MISMATCH", 409);
  }
  if (input.siteId && !site) throw new EnterpriseDomainError("SITE_NOT_FOUND", 404);
  if (input.ownerUserId) await assertActiveOrganizationMember(tx, organizationId, input.ownerUserId);

  const employeeIds = [...new Set(input.memberEmployeeIds || [])];
  if (employeeIds.length) {
    const count = await tx.enterpriseEmployee.count({
      where: { organizationId, id: { in: employeeIds }, employmentStatus: "ACTIVE", archivedAt: null },
    });
    if (count !== employeeIds.length) throw new EnterpriseDomainError("PROJECT_MEMBER_EMPLOYEE_NOT_FOUND", 404);
  }
}
