import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { assertProjectRelations, operationsReference, publishOperationsEvent } from "@/lib/enterprise/projects-assets/helpers";
import type {
  enterpriseProjectCreateSchema,
  projectDeliverableCreateSchema,
  projectDeliverableTransitionSchema,
  projectIssueCreateSchema,
  projectMilestoneCreateSchema,
  projectRiskCreateSchema,
} from "@/lib/enterprise/projects-assets/schemas";
import { prisma } from "@/lib/prisma";

type ProjectCreateInput = z.infer<typeof enterpriseProjectCreateSchema>;
type MilestoneCreateInput = z.infer<typeof projectMilestoneCreateSchema>;
type DeliverableCreateInput = z.infer<typeof projectDeliverableCreateSchema>;
type DeliverableTransitionInput = z.infer<typeof projectDeliverableTransitionSchema>;
type RiskCreateInput = z.infer<typeof projectRiskCreateSchema>;
type IssueCreateInput = z.infer<typeof projectIssueCreateSchema>;

const DELIVERABLE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMIT"],
  CHANGES_REQUESTED: ["SUBMIT"],
  SUBMITTED: ["ACCEPT", "REQUEST_CHANGES", "REJECT"],
};

export async function createEnterpriseProject(
  organizationId: string,
  actorUserId: string,
  input: ProjectCreateInput,
) {
  if (input.startDate && input.targetEndDate && input.targetEndDate < input.startDate) {
    throw new EnterpriseDomainError("PROJECT_DATE_RANGE_INVALID");
  }
  const employeeIds = input.members.map((member) => member.employeeId);
  if (new Set(employeeIds).size !== employeeIds.length) {
    throw new EnterpriseDomainError("PROJECT_MEMBER_DUPLICATE");
  }

  return prisma.$transaction(async (tx) => {
    await assertProjectRelations(tx, organizationId, {
      businessPartyId: input.businessPartyId,
      contractId: input.contractId,
      ownerUserId: input.ownerUserId,
      siteId: input.siteId,
      memberEmployeeIds: employeeIds,
    });
    const project = await tx.enterpriseProject.create({
      data: {
        organizationId,
        reference: operationsReference("PRJ"),
        name: input.name,
        description: input.description || null,
        projectType: input.projectType,
        status: "DRAFT",
        businessPartyId: input.businessPartyId || null,
        contractId: input.contractId || null,
        ownerUserId: input.ownerUserId || actorUserId,
        departmentId: input.departmentId || null,
        siteId: input.siteId || null,
        budgetId: input.budgetId || null,
        currency: input.currency || null,
        indicativeBudget: input.indicativeBudget ?? null,
        startDate: input.startDate || null,
        targetEndDate: input.targetEndDate || null,
        createdByUserId: actorUserId,
        members: {
          create: input.members.map((member) => ({
            organizationId,
            employeeId: member.employeeId,
            role: member.role,
            allocationPercent: member.allocationPercent,
            startsAt: input.startDate || null,
            createdByUserId: actorUserId,
          })),
        },
      },
      include: { members: { include: { employee: true } } },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProject",
      entityId: project.id,
      eventType: "PROJECT_CREATED",
      summary: `Projet ${project.reference} créé`,
      actorUserId,
      toStatus: "DRAFT",
    });
    return project;
  });
}

export async function createEnterpriseProjectMilestone(
  organizationId: string,
  projectId: string,
  actorUserId: string,
  input: MilestoneCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.enterpriseProject.findFirst({ where: { id: projectId, organizationId, archivedAt: null } });
    if (!project) throw new EnterpriseDomainError("PROJECT_NOT_FOUND", 404);
    if (input.ownerUserId) await assertProjectRelations(tx, organizationId, { ownerUserId: input.ownerUserId });
    if (project.targetEndDate && input.dueDate && input.dueDate > project.targetEndDate) {
      throw new EnterpriseDomainError("MILESTONE_AFTER_PROJECT_END", 409);
    }
    const milestone = await tx.enterpriseProjectMilestone.create({
      data: {
        organizationId,
        projectId,
        reference: operationsReference("MS"),
        name: input.name,
        description: input.description || null,
        dueDate: input.dueDate || null,
        ownerUserId: input.ownerUserId || null,
        approvalRequired: input.approvalRequired,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectMilestone",
      entityId: milestone.id,
      eventType: "PROJECT_MILESTONE_CREATED",
      summary: `Jalon ${milestone.reference} créé pour ${project.reference}`,
      actorUserId,
      toStatus: milestone.status,
    });
    return milestone;
  });
}

export async function createEnterpriseProjectDeliverable(
  organizationId: string,
  projectId: string,
  actorUserId: string,
  input: DeliverableCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.enterpriseProject.findFirst({ where: { id: projectId, organizationId, archivedAt: null } });
    if (!project) throw new EnterpriseDomainError("PROJECT_NOT_FOUND", 404);
    if (input.milestoneId) {
      const milestone = await tx.enterpriseProjectMilestone.findFirst({ where: { id: input.milestoneId, organizationId, projectId } });
      if (!milestone) throw new EnterpriseDomainError("PROJECT_MILESTONE_NOT_FOUND", 404);
    }
    if (input.ownerUserId) await assertProjectRelations(tx, organizationId, { ownerUserId: input.ownerUserId });
    const deliverable = await tx.enterpriseProjectDeliverable.create({
      data: {
        organizationId,
        projectId,
        milestoneId: input.milestoneId || null,
        reference: operationsReference("DLV"),
        name: input.name,
        description: input.description || null,
        ownerUserId: input.ownerUserId || actorUserId,
        dueDate: input.dueDate || null,
        documentId: input.documentId || null,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectDeliverable",
      entityId: deliverable.id,
      eventType: "PROJECT_DELIVERABLE_CREATED",
      summary: `Livrable ${deliverable.reference} créé`,
      actorUserId,
      toStatus: deliverable.status,
    });
    return deliverable;
  });
}

export async function transitionEnterpriseProjectDeliverable(
  organizationId: string,
  deliverableId: string,
  actorUserId: string,
  input: DeliverableTransitionInput,
) {
  return prisma.$transaction(async (tx) => {
    const deliverable = await tx.enterpriseProjectDeliverable.findFirst({
      where: { id: deliverableId, organizationId },
    });
    if (!deliverable) throw new EnterpriseDomainError("PROJECT_DELIVERABLE_NOT_FOUND", 404);
    if (!(DELIVERABLE_TRANSITIONS[deliverable.status] || []).includes(input.action)) {
      throw new EnterpriseDomainError("DELIVERABLE_TRANSITION_INVALID", 409);
    }
    if (["ACCEPT", "REJECT"].includes(input.action) && deliverable.createdByUserId === actorUserId) {
      throw new EnterpriseDomainError("SELF_APPROVAL_FORBIDDEN", 409);
    }
    const statusByAction = {
      SUBMIT: "SUBMITTED",
      ACCEPT: "ACCEPTED",
      REQUEST_CHANGES: "CHANGES_REQUESTED",
      REJECT: "REJECTED",
    } as const;
    const targetStatus = statusByAction[input.action];
    const now = new Date();
    const updated = await tx.enterpriseProjectDeliverable.updateMany({
      where: { id: deliverable.id, organizationId, status: deliverable.status, revision: input.revision },
      data: {
        status: targetStatus,
        submittedAt: input.action === "SUBMIT" ? now : deliverable.submittedAt,
        acceptedAt: input.action === "ACCEPT" ? now : deliverable.acceptedAt,
        changesRequestedAt: input.action === "REQUEST_CHANGES" ? now : deliverable.changesRequestedAt,
        rejectedAt: input.action === "REJECT" ? now : deliverable.rejectedAt,
        reviewComment: input.comment || null,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await publishOperationsEvent(tx, {
      organizationId,
      entityType: "EnterpriseProjectDeliverable",
      entityId: deliverable.id,
      eventType: `PROJECT_DELIVERABLE_${targetStatus}`,
      summary: `Livrable ${deliverable.reference}: ${deliverable.status} → ${targetStatus}`,
      actorUserId,
      fromStatus: deliverable.status,
      toStatus: targetStatus,
    });
    return tx.enterpriseProjectDeliverable.findUniqueOrThrow({ where: { id: deliverable.id } });
  });
}

export async function createEnterpriseProjectRisk(
  organizationId: string,
  projectId: string,
  actorUserId: string,
  input: RiskCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.enterpriseProject.findFirst({ where: { id: projectId, organizationId, archivedAt: null }, select: { id: true, reference: true } });
    if (!project) throw new EnterpriseDomainError("PROJECT_NOT_FOUND", 404);
    if (input.ownerUserId) await assertProjectRelations(tx, organizationId, { ownerUserId: input.ownerUserId });
    const risk = await tx.enterpriseProjectRisk.create({
      data: {
        organizationId,
        projectId,
        reference: operationsReference("RSK"),
        title: input.title,
        description: input.description,
        category: input.category || null,
        probability: input.probability,
        impact: input.impact,
        severity: input.severity,
        ownerUserId: input.ownerUserId || null,
        mitigationPlan: input.mitigationPlan || null,
        dueDate: input.dueDate || null,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseProjectRisk", entityId: risk.id, eventType: "PROJECT_RISK_CREATED", summary: `Risque ${risk.reference} créé sur ${project.reference}`, actorUserId, toStatus: risk.status });
    return risk;
  });
}

export async function createEnterpriseProjectIssue(
  organizationId: string,
  projectId: string,
  actorUserId: string,
  input: IssueCreateInput,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.enterpriseProject.findFirst({ where: { id: projectId, organizationId, archivedAt: null }, select: { id: true, reference: true } });
    if (!project) throw new EnterpriseDomainError("PROJECT_NOT_FOUND", 404);
    if (input.ownerUserId) await assertProjectRelations(tx, organizationId, { ownerUserId: input.ownerUserId });
    const issue = await tx.enterpriseProjectIssue.create({
      data: {
        organizationId,
        projectId,
        reference: operationsReference("ISS"),
        title: input.title,
        description: input.description,
        issueType: input.issueType || null,
        priority: input.priority,
        ownerUserId: input.ownerUserId || null,
        dueDate: input.dueDate || null,
        createdByUserId: actorUserId,
      },
    });
    await publishOperationsEvent(tx, { organizationId, entityType: "EnterpriseProjectIssue", entityId: issue.id, eventType: "PROJECT_ISSUE_CREATED", summary: `Incident projet ${issue.reference} créé sur ${project.reference}`, actorUserId, toStatus: issue.status });
    return issue;
  });
}
