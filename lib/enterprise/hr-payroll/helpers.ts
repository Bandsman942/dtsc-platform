import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertEnterpriseApprovalCandidate, assertEnterpriseApprovalDecision } from "@/lib/enterprise/approval-assignment";
import { enqueueWorkflowDomainEvent } from "@/lib/enterprise/workflows/domain-events";

const STRICT_INDEPENDENT_APPROVAL_MODULES = new Set([
  "HUMAN_RESOURCES",
  "TIME_ATTENDANCE",
  "PAYROLL_OPERATIONS",
]);

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

function normalizeApprovalError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "APPROVER_PERMISSION_DENIED";
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 403;
  return new EnterpriseDomainError(code, Number.isFinite(status) ? status : 403);
}

function assertStrictIndependentApproval(moduleCode: string | undefined, requesterUserId: string, approverUserId: string) {
  if (moduleCode && STRICT_INDEPENDENT_APPROVAL_MODULES.has(moduleCode) && requesterUserId === approverUserId) {
    throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
  }
}

export async function assertOrganizationApprover(
  _tx: Prisma.TransactionClient,
  organizationId: string,
  approverUserId: string,
  requesterUserId: string,
  moduleCode?: string,
) {
  assertStrictIndependentApproval(moduleCode, requesterUserId, approverUserId);
  if (!moduleCode) {
    if (approverUserId === requesterUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    return;
  }
  try {
    await assertEnterpriseApprovalCandidate({ organizationId, requesterUserId, approverUserId, moduleCode });
  } catch (error) {
    throw normalizeApprovalError(error);
  }
}

export async function assertOrganizationApprovalDecision({
  organizationId,
  requesterUserId,
  approverUserId,
  actorUserId,
  moduleCode,
}: {
  organizationId: string;
  requesterUserId: string;
  approverUserId: string;
  actorUserId: string;
  moduleCode: string;
}) {
  assertStrictIndependentApproval(moduleCode, requesterUserId, actorUserId);
  try {
    return await assertEnterpriseApprovalDecision({ organizationId, requesterUserId, approverUserId, actorUserId, moduleCode });
  } catch (error) {
    throw normalizeApprovalError(error);
  }
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
