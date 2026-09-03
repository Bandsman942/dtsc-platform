import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishOperationsEvent } from "@/lib/enterprise/projects-assets/helpers";
import { prisma } from "@/lib/prisma";

export async function cancelEnterpriseProjectMilestoneApproval({
  organizationId,
  approvalId,
  actorUserId,
  approvalRevision,
  canManage,
}: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  approvalRevision: number;
  canManage: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({
      where: { id: approvalId, organizationId, targetEntityType: "EnterpriseProjectMilestone", status: "PENDING", archivedAt: null },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    if (approval.requestedByUserId !== actorUserId && !canManage) throw new EnterpriseDomainError("APPROVAL_CANCEL_DENIED", 403);
    const milestone = await tx.enterpriseProjectMilestone.findFirst({
      where: { id: approval.targetEntityId, organizationId, status: "SUBMITTED" },
      include: { project: { select: { status: true } } },
    });
    if (!milestone) throw new EnterpriseDomainError("PROJECT_MILESTONE_NOT_FOUND", 404);
    if (["CANCELLED", "CLOSED"].includes(milestone.project.status)) throw new EnterpriseDomainError("PROJECT_NOT_EDITABLE", 409);

    const cancelled = await tx.enterpriseApproval.updateMany({
      where: { id: approval.id, organizationId, status: "PENDING", revision: approvalRevision, archivedAt: null },
      data: { status: "CANCELLED", decidedAt: null, decisionComment: "Validation annulée par le demandeur.", revision: { increment: 1 } },
    });
    if (cancelled.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseProjectMilestone.update({
      where: { id: milestone.id },
      data: { status: "PLANNED", completedAt: null, approvedAt: null, revision: { increment: 1 } },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectMilestone",
      entityId: milestone.id,
      eventType: "PROJECT_MILESTONE_APPROVAL_CANCELLED",
      summary: `Validation du jalon ${milestone.reference} annulée`,
      actorUserId,
      fromStatus: "SUBMITTED",
      toStatus: "PLANNED",
      metadataJson: { approvalId: approval.id },
    });
    return { approvalId: approval.id, milestoneId: milestone.id };
  });
}
