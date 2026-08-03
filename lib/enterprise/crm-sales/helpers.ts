import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enqueueWorkflowDomainEvent } from "@/lib/enterprise/workflows/domain-events";

export function enterpriseReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export function normalizeEnterpriseName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function assertActiveClientOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { id: true },
  });
  if (!organization) throw new EnterpriseDomainError("ORGANIZATION_NOT_ACTIVE", 403);
}

export async function publishEnterpriseEvent(
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
