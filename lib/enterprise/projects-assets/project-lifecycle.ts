import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishOperationsEvent } from "@/lib/enterprise/projects-assets/helpers";
import type { projectTransitionSchema } from "@/lib/enterprise/projects-assets/schemas";
import { prisma } from "@/lib/prisma";

type ProjectTransitionInput = z.infer<typeof projectTransitionSchema>;

const PROJECT_TRANSITIONS: Record<string, ProjectTransitionInput["action"][]> = {
  DRAFT: ["PLAN", "CANCEL"],
  PLANNED: ["START", "CANCEL"],
  ACTIVE: ["MARK_AT_RISK", "BLOCK", "COMPLETE", "CANCEL"],
  IN_PROGRESS: ["MARK_AT_RISK", "BLOCK", "COMPLETE", "CANCEL"],
  AT_RISK: ["RESUME", "BLOCK", "COMPLETE", "CANCEL"],
  BLOCKED: ["RESUME", "CANCEL"],
  COMPLETED: ["CLOSE"],
};

const STATUS_BY_ACTION: Record<ProjectTransitionInput["action"], string> = {
  PLAN: "PLANNED",
  START: "ACTIVE",
  MARK_AT_RISK: "AT_RISK",
  BLOCK: "BLOCKED",
  RESUME: "ACTIVE",
  COMPLETE: "COMPLETED",
  CLOSE: "CLOSED",
  CANCEL: "CANCELLED",
};

export async function transitionEnterpriseProject(
  organizationId: string,
  projectId: string,
  actorUserId: string,
  input: ProjectTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.enterpriseProject.findFirst({
      where: { id: projectId, organizationId, archivedAt: null },
    });
    if (!project) throw new EnterpriseDomainError("PROJECT_NOT_FOUND", 404);
    if (!(PROJECT_TRANSITIONS[project.status] || []).includes(input.action)) {
      throw new EnterpriseDomainError("PROJECT_TRANSITION_INVALID", 409);
    }
    if (input.action === "COMPLETE") {
      const [incompleteDeliverables, incompleteMilestones, openRisks, openIssues] = await Promise.all([
        tx.enterpriseProjectDeliverable.count({
          where: { organizationId, projectId, status: { not: "ACCEPTED" } },
        }),
        tx.enterpriseProjectMilestone.count({
          where: { organizationId, projectId, status: { notIn: ["COMPLETED", "APPROVED"] } },
        }),
        tx.enterpriseProjectRisk.count({
          where: { organizationId, projectId, status: "OPEN" },
        }),
        tx.enterpriseProjectIssue.count({
          where: { organizationId, projectId, status: "OPEN" },
        }),
      ]);
      if (incompleteDeliverables > 0) throw new EnterpriseDomainError("PROJECT_DELIVERABLES_INCOMPLETE", 409);
      if (incompleteMilestones > 0) throw new EnterpriseDomainError("PROJECT_MILESTONES_INCOMPLETE", 409);
      if (openRisks > 0) throw new EnterpriseDomainError("PROJECT_RISKS_OPEN", 409);
      if (openIssues > 0) throw new EnterpriseDomainError("PROJECT_ISSUES_OPEN", 409);
    }
    const targetStatus = STATUS_BY_ACTION[input.action];
    const now = new Date();
    const updated = await tx.enterpriseProject.updateMany({
      where: { id: project.id, organizationId, status: project.status, revision: input.revision },
      data: {
        status: targetStatus,
        completedAt: input.action === "COMPLETE" ? now : project.completedAt,
        closedAt: input.action === "CLOSE" ? now : project.closedAt,
        cancelledAt: input.action === "CANCEL" ? now : project.cancelledAt,
        cancellationReason: input.action === "CANCEL" ? input.comment : project.cancellationReason,
        progressPercent: input.action === "COMPLETE" || input.action === "CLOSE" ? 100 : project.progressPercent,
        updatedByUserId: actorUserId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProject",
      entityId: project.id,
      eventType: `PROJECT_${targetStatus}`,
      summary: `Projet ${project.reference}: ${project.status} → ${targetStatus}`,
      actorUserId,
      fromStatus: project.status,
      toStatus: targetStatus,
      metadataJson: input.comment ? { comment: input.comment } : undefined,
    });
    return tx.enterpriseProject.findUniqueOrThrow({ where: { id: project.id } });
  });
}
