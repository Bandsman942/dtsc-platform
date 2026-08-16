import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { enqueueWorkflowDomainEvent } from "@/lib/enterprise/workflows/domain-events";

export function hrReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function assertActiveCustomerEmployee(tx: Prisma.TransactionClient, organizationId: string, employeeId: string) {
  const employee = await tx.enterpriseEmployee.findFirst({
    where: { id: employeeId, organizationId, employmentStatus: "ACTIVE", archivedAt: null },
  });
  if (!employee) throw new EnterpriseDomainError("EMPLOYEE_NOT_FOUND", 404);
  return employee;
}

export async function assertOrganizationApprover(
  tx: Prisma.TransactionClient,
  organizationId: string,
  approverUserId: string,
  requesterUserId: string,
  moduleCode?: string,
) {
  if (approverUserId === requesterUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
  const member = await tx.organizationMember.findFirst({
    where: { organizationId, userId: approverUserId, status: "ACTIVE", removedAt: null },
    select: { id: true },
  });
  if (!member) throw new EnterpriseDomainError("APPROVER_NOT_MEMBER", 404);
  if (!moduleCode) return;

  const access = await resolveEnterpriseModuleAccess({
    userId: approverUserId,
    organizationId,
    moduleCode,
    action: "approve",
  });
  if (!access.allowed) throw new EnterpriseDomainError("APPROVER_PERMISSION_DENIED", 403);
}

export async function publishHrEvent(tx: Prisma.TransactionClient, input: { organizationId: string; entityType: string; entityId: string; eventType: string; summary: string; actorUserId: string; fromStatus?: string; toStatus?: string; metadataJson?: Prisma.InputJsonValue }) {
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
