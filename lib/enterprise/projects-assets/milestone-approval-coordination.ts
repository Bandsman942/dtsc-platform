import type { Prisma } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { prisma } from "@/lib/prisma";

function serializeSnapshot(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function ensureProjectMilestoneApprovalSubmissionVersion({
  organizationId,
  approvalId,
  actorUserId,
}: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseApprovalSubmissionVersion.findFirst({
      where: { organizationId, approvalId },
      orderBy: { versionNumber: "desc" },
    });
    if (existing) return existing;
    const approval = await tx.enterpriseApproval.findFirst({
      where: { id: approvalId, organizationId, targetEntityType: "EnterpriseProjectMilestone", archivedAt: null },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    const milestone = await tx.enterpriseProjectMilestone.findFirst({
      where: { id: approval.targetEntityId, organizationId },
      select: {
        id: true,
        projectId: true,
        reference: true,
        name: true,
        description: true,
        status: true,
        dueDate: true,
        ownerUserId: true,
        approvalRequired: true,
        revision: true,
        updatedAt: true,
        project: { select: { reference: true, name: true, status: true } },
      },
    });
    if (!milestone) throw new EnterpriseDomainError("PROJECT_MILESTONE_NOT_FOUND", 404);
    return tx.enterpriseApprovalSubmissionVersion.create({
      data: {
        organizationId,
        approvalId: approval.id,
        versionNumber: 1,
        submittedByUserId: approval.requestedByUserId || actorUserId,
        snapshotJson: serializeSnapshot(milestone as unknown as Record<string, unknown>),
      },
    });
  });
}

export async function recordProjectMilestoneApprovalDecision({
  organizationId,
  approvalId,
  actorUserId,
  decision,
  reason,
  idempotencyKey,
}: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string | null;
  idempotencyKey?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.enterpriseApprovalSubmissionVersion.findFirst({
      where: { organizationId, approvalId },
      orderBy: { versionNumber: "desc" },
    });
    if (!version) throw new EnterpriseDomainError("APPROVAL_REVIEW_REQUIRED", 409);
    const key = idempotencyKey?.trim() || `approval:${approvalId}:version:${version.versionNumber}:actor:${actorUserId}:${decision}`;
    const existing = await tx.enterpriseApprovalDecision.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;
    return tx.enterpriseApprovalDecision.create({
      data: {
        organizationId,
        approvalId,
        submissionVersionId: version.id,
        actorUserId,
        decision,
        reason: reason?.trim() || null,
        idempotencyKey: key,
      },
    });
  });
}
