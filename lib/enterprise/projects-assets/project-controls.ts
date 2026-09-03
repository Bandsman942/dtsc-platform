import type { z } from "zod";
import { assertEnterpriseApprovalCandidate, assertEnterpriseApprovalDecision } from "@/lib/enterprise/approval-assignment";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishOperationsEvent } from "@/lib/enterprise/projects-assets/helpers";
import type {
  projectIssueTransitionSchema,
  projectMilestoneTransitionSchema,
  projectRiskTransitionSchema,
} from "@/lib/enterprise/projects-assets/schemas";
import { prisma } from "@/lib/prisma";

type MilestoneTransitionInput = z.infer<typeof projectMilestoneTransitionSchema>;
type RiskTransitionInput = z.infer<typeof projectRiskTransitionSchema>;
type IssueTransitionInput = z.infer<typeof projectIssueTransitionSchema>;
type MilestoneDecisionInput = {
  decision: "APPROVE" | "REJECT";
  revision: number;
  comment?: string | null;
};

const EDITABLE_PROJECT_STATUSES = new Set(["DRAFT", "PLANNED", "ACTIVE", "IN_PROGRESS", "AT_RISK", "BLOCKED"]);

function approvalError(error: unknown, fallback: string) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : fallback;
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 403;
  return new EnterpriseDomainError(code, Number.isFinite(status) ? status : 403);
}

async function assertIndependentProjectApprover(organizationId: string, requesterUserId: string, approverUserId: string) {
  try {
    const candidate = await assertEnterpriseApprovalCandidate({
      organizationId,
      requesterUserId,
      approverUserId,
      moduleCode: "PROJECTS_SERVICES",
    });
    if (candidate.isRequester || candidate.selfApprovalOverride) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    return candidate;
  } catch (error) {
    if (error instanceof EnterpriseDomainError) throw error;
    throw approvalError(error, "APPROVER_NOT_ELIGIBLE");
  }
}

async function assertIndependentProjectDecision(
  organizationId: string,
  requesterUserId: string,
  approverUserId: string,
  actorUserId: string,
) {
  if (requesterUserId === actorUserId) throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
  try {
    await assertEnterpriseApprovalDecision({
      organizationId,
      requesterUserId,
      approverUserId,
      actorUserId,
      moduleCode: "PROJECTS_SERVICES",
    });
  } catch (error) {
    throw approvalError(error, "APPROVAL_DECISION_DENIED");
  }
}

export async function transitionEnterpriseProjectMilestone(
  organizationId: string,
  projectId: string,
  milestoneId: string,
  actorUserId: string,
  input: MilestoneTransitionInput,
) {
  if (input.action === "SUBMIT_APPROVAL") {
    if (!input.approverUserId) throw new EnterpriseDomainError("MILESTONE_APPROVER_REQUIRED", 400);
    await assertIndependentProjectApprover(organizationId, actorUserId, input.approverUserId);
  }

  return prisma.$transaction(async (tx) => {
    const milestone = await tx.enterpriseProjectMilestone.findFirst({
      where: { id: milestoneId, projectId, organizationId },
      include: { project: { select: { status: true, reference: true } } },
    });
    if (!milestone) throw new EnterpriseDomainError("PROJECT_MILESTONE_NOT_FOUND", 404);
    if (!EDITABLE_PROJECT_STATUSES.has(milestone.project.status)) throw new EnterpriseDomainError("PROJECT_NOT_EDITABLE", 409);

    if (input.action === "COMPLETE") {
      if (milestone.approvalRequired) throw new EnterpriseDomainError("MILESTONE_APPROVAL_REQUIRED", 409);
      if (milestone.status !== "PLANNED") throw new EnterpriseDomainError("MILESTONE_TRANSITION_INVALID", 409);
      const updated = await tx.enterpriseProjectMilestone.updateMany({
        where: { id: milestone.id, organizationId, projectId, status: "PLANNED", revision: input.revision },
        data: { status: "COMPLETED", completedAt: new Date(), revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await publishOperationsEvent(tx, {
        organizationId,
        entityType: "EnterpriseProjectMilestone",
        entityId: milestone.id,
        eventType: "PROJECT_MILESTONE_COMPLETED",
        summary: `Jalon ${milestone.reference} terminé`,
        actorUserId,
        fromStatus: milestone.status,
        toStatus: "COMPLETED",
        metadataJson: input.comment ? { comment: input.comment } : undefined,
      });
      return { milestone: await tx.enterpriseProjectMilestone.findUniqueOrThrow({ where: { id: milestone.id } }), approval: null };
    }

    if (!milestone.approvalRequired) throw new EnterpriseDomainError("MILESTONE_APPROVAL_NOT_REQUIRED", 409);
    if (!["PLANNED", "REJECTED"].includes(milestone.status)) throw new EnterpriseDomainError("MILESTONE_TRANSITION_INVALID", 409);
    if (!input.approverUserId) throw new EnterpriseDomainError("MILESTONE_APPROVER_REQUIRED", 400);
    const pending = await tx.enterpriseApproval.findFirst({
      where: { organizationId, targetEntityType: "EnterpriseProjectMilestone", targetEntityId: milestone.id, status: "PENDING", archivedAt: null },
      select: { id: true },
    });
    if (pending) throw new EnterpriseDomainError("PENDING_APPROVAL_EXISTS", 409);

    const promoted = await tx.enterpriseProjectMilestone.updateMany({
      where: { id: milestone.id, organizationId, projectId, status: milestone.status, revision: input.revision },
      data: { status: "SUBMITTED", completedAt: null, approvedAt: null, revision: { increment: 1 } },
    });
    if (promoted.count !== 1) throw new EnterpriseDomainConflictError();
    const approval = await tx.enterpriseApproval.create({
      data: {
        organizationId,
        targetEntityType: "EnterpriseProjectMilestone",
        targetEntityId: milestone.id,
        requestedByUserId: actorUserId,
        approverUserId: input.approverUserId,
        status: "PENDING",
      },
    });
    await tx.enterpriseEntityLink.create({
      data: {
        organizationId,
        sourceModule: "PROJECTS_SERVICES",
        sourceEntityType: "EnterpriseProjectMilestone",
        sourceEntityId: milestone.id,
        targetModule: "VALIDATIONS",
        targetEntityType: "EnterpriseApproval",
        targetEntityId: approval.id,
        linkType: "REQUIRES_APPROVAL",
        createdById: actorUserId,
      },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectMilestone",
      entityId: milestone.id,
      eventType: "PROJECT_MILESTONE_SUBMITTED",
      summary: `Jalon ${milestone.reference} soumis à validation`,
      actorUserId,
      fromStatus: milestone.status,
      toStatus: "SUBMITTED",
      metadataJson: { approvalId: approval.id, approverUserId: input.approverUserId },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseApproval",
      entityId: approval.id,
      eventType: "ENTERPRISE_APPROVAL_REQUESTED",
      summary: `Validation demandée pour le jalon ${milestone.reference}`,
      actorUserId,
      toStatus: "PENDING",
      metadataJson: { targetEntityType: "EnterpriseProjectMilestone", targetEntityId: milestone.id },
    });
    return { milestone: await tx.enterpriseProjectMilestone.findUniqueOrThrow({ where: { id: milestone.id } }), approval };
  });
}

export async function decideEnterpriseProjectMilestone(
  organizationId: string,
  milestoneId: string,
  actorUserId: string,
  input: MilestoneDecisionInput,
) {
  if (input.decision === "REJECT" && (!input.comment || input.comment.trim().length < 3)) {
    throw new EnterpriseDomainError("MILESTONE_REJECTION_REASON_REQUIRED", 400);
  }
  const pending = await prisma.enterpriseApproval.findFirst({
    where: { organizationId, targetEntityType: "EnterpriseProjectMilestone", targetEntityId: milestoneId, status: "PENDING", archivedAt: null },
    select: { requestedByUserId: true, approverUserId: true },
  });
  if (!pending) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
  await assertIndependentProjectDecision(organizationId, pending.requestedByUserId, pending.approverUserId, actorUserId);

  return prisma.$transaction(async (tx) => {
    const milestone = await tx.enterpriseProjectMilestone.findFirst({
      where: { id: milestoneId, organizationId, status: "SUBMITTED" },
      include: { project: { select: { status: true } } },
    });
    if (!milestone) throw new EnterpriseDomainError("PROJECT_MILESTONE_NOT_FOUND", 404);
    if (["CANCELLED", "CLOSED"].includes(milestone.project.status)) throw new EnterpriseDomainError("PROJECT_NOT_EDITABLE", 409);
    const approval = await tx.enterpriseApproval.findFirst({
      where: { organizationId, targetEntityType: "EnterpriseProjectMilestone", targetEntityId: milestone.id, status: "PENDING", approverUserId: actorUserId, archivedAt: null },
    });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    const targetStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const now = new Date();
    const updated = await tx.enterpriseProjectMilestone.updateMany({
      where: { id: milestone.id, organizationId, status: "SUBMITTED", revision: input.revision },
      data: {
        status: targetStatus,
        completedAt: input.decision === "APPROVE" ? now : null,
        approvedAt: input.decision === "APPROVE" ? now : null,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({
      where: { id: approval.id },
      data: { status: targetStatus, decidedAt: now, decisionComment: input.comment || null, revision: { increment: 1 } },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectMilestone",
      entityId: milestone.id,
      eventType: `PROJECT_MILESTONE_${targetStatus}`,
      summary: `Jalon ${milestone.reference} ${targetStatus.toLowerCase()}`,
      actorUserId,
      fromStatus: "SUBMITTED",
      toStatus: targetStatus,
      metadataJson: input.comment ? { comment: input.comment, approvalId: approval.id } : { approvalId: approval.id },
    });
    return tx.enterpriseProjectMilestone.findUniqueOrThrow({ where: { id: milestone.id } });
  });
}

export async function transitionEnterpriseProjectRisk(
  organizationId: string,
  riskId: string,
  actorUserId: string,
  input: RiskTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    const risk = await tx.enterpriseProjectRisk.findFirst({
      where: { id: riskId, organizationId },
      include: { project: { select: { status: true } } },
    });
    if (!risk) throw new EnterpriseDomainError("PROJECT_RISK_NOT_FOUND", 404);
    if (["CANCELLED", "CLOSED"].includes(risk.project.status)) throw new EnterpriseDomainError("PROJECT_NOT_EDITABLE", 409);
    const targetStatus = input.action === "CLOSE" ? "CLOSED" : "OPEN";
    if (input.action === "CLOSE" && risk.status !== "OPEN") throw new EnterpriseDomainError("PROJECT_RISK_TRANSITION_INVALID", 409);
    if (input.action === "REOPEN" && risk.status !== "CLOSED") throw new EnterpriseDomainError("PROJECT_RISK_TRANSITION_INVALID", 409);
    const updated = await tx.enterpriseProjectRisk.updateMany({
      where: { id: risk.id, organizationId, status: risk.status, revision: input.revision },
      data: { status: targetStatus, closedAt: input.action === "CLOSE" ? new Date() : null, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectRisk",
      entityId: risk.id,
      eventType: input.action === "CLOSE" ? "PROJECT_RISK_CLOSED" : "PROJECT_RISK_REOPENED",
      summary: input.comment || `Risque ${risk.reference}: ${risk.status} → ${targetStatus}`,
      actorUserId,
      fromStatus: risk.status,
      toStatus: targetStatus,
      metadataJson: input.comment ? { comment: input.comment } : undefined,
    });
    return tx.enterpriseProjectRisk.findUniqueOrThrow({ where: { id: risk.id } });
  });
}

export async function transitionEnterpriseProjectIssue(
  organizationId: string,
  issueId: string,
  actorUserId: string,
  input: IssueTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    const issue = await tx.enterpriseProjectIssue.findFirst({
      where: { id: issueId, organizationId },
      include: { project: { select: { status: true } } },
    });
    if (!issue) throw new EnterpriseDomainError("PROJECT_ISSUE_NOT_FOUND", 404);
    if (["CANCELLED", "CLOSED"].includes(issue.project.status)) throw new EnterpriseDomainError("PROJECT_NOT_EDITABLE", 409);
    const now = new Date();
    let targetStatus = issue.status;
    if (input.action === "RESOLVE") {
      if (issue.status !== "OPEN") throw new EnterpriseDomainError("PROJECT_ISSUE_TRANSITION_INVALID", 409);
      targetStatus = "RESOLVED";
    } else if (input.action === "CLOSE") {
      if (issue.status !== "RESOLVED") throw new EnterpriseDomainError("PROJECT_ISSUE_TRANSITION_INVALID", 409);
      targetStatus = "CLOSED";
    } else {
      if (!["RESOLVED", "CLOSED"].includes(issue.status)) throw new EnterpriseDomainError("PROJECT_ISSUE_TRANSITION_INVALID", 409);
      targetStatus = "OPEN";
    }
    const updated = await tx.enterpriseProjectIssue.updateMany({
      where: { id: issue.id, organizationId, status: issue.status, revision: input.revision },
      data: {
        status: targetStatus,
        resolution: input.action === "RESOLVE" ? input.resolution : input.action === "REOPEN" ? null : issue.resolution,
        resolvedAt: input.action === "RESOLVE" ? now : input.action === "REOPEN" ? null : issue.resolvedAt,
        closedAt: input.action === "CLOSE" ? now : input.action === "REOPEN" ? null : issue.closedAt,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectIssue",
      entityId: issue.id,
      eventType: `PROJECT_ISSUE_${targetStatus}`,
      summary: input.resolution || `Incident ${issue.reference}: ${issue.status} → ${targetStatus}`,
      actorUserId,
      fromStatus: issue.status,
      toStatus: targetStatus,
      metadataJson: input.action === "REOPEN" && issue.resolution
        ? { previousResolution: issue.resolution }
        : input.resolution
          ? { resolution: input.resolution }
          : undefined,
    });
    return tx.enterpriseProjectIssue.findUniqueOrThrow({ where: { id: issue.id } });
  });
}
