import { resolveWorkflowAssignment } from "@/lib/enterprise/workflows/adapters";
import { beginWorkflowActionAttempt, completeWorkflowActionAttempt, failWorkflowActionAttempt } from "@/lib/enterprise/workflows/action-attempts";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { resolveWorkflowExecutionUser, workflowSourceModule } from "@/lib/enterprise/workflows/runtime-utils";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

export const executeCreateApprovalStep: WorkflowStepHandler = async ({ run, step, stepRun, adapter, entity, previousStepActorUserId }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "CREATE_APPROVAL", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "CREATE_APPROVAL") throw new Error("Invalid CREATE_APPROVAL configuration");

  const alreadyLinked = await prisma.enterpriseApproval.findFirst({ where: { organizationId: run.organizationId, workflowRunId: run.id, workflowStepRunId: stepRun.id, archivedAt: null }, orderBy: { requestedAt: "desc" } });
  if (alreadyLinked) {
    if (alreadyLinked.status === "PENDING") return { kind: "WAITING", runStatus: "WAITING_APPROVAL", assignedUserId: alreadyLinked.approverUserId, output: { approvalId: alreadyLinked.id } };
    return { kind: "SUCCEEDED", outcome: alreadyLinked.status, assignedUserId: alreadyLinked.approverUserId, actorUserId: alreadyLinked.status === "CANCELLED" ? null : alreadyLinked.approverUserId, output: { approvalId: alreadyLinked.id, decision: alreadyLinked.status } };
  }

  // Finance steps only attach a PREEXISTING canonical decision. They cannot
  // create a shadow approval, nominate an approver or mutate financial status.
  const canonicalTarget = parsed.configuration.canonicalApprovalTarget;
  if (canonicalTarget) {
    if (!adapter.canonicalApprovalTargets?.has(canonicalTarget)) {
      throw new EnterpriseWorkflowError("Cette validation canonique n’est pas compatible avec la source.", 409, "WORKFLOW_APPROVAL_TARGET_UNSUPPORTED", "CONFIGURATION");
    }
    const candidate = await prisma.enterpriseApproval.findFirst({
      where: {
        organizationId: run.organizationId,
        targetEntityType: canonicalTarget,
        targetEntityId: run.sourceEntityId,
        status: { in: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] },
        archivedAt: null,
      },
      orderBy: { requestedAt: "desc" },
    });
    if (!candidate) throw new EnterpriseWorkflowError(
      "Soumettez d’abord ce document dans son module financier pour créer la validation officielle.",
      409, "WORKFLOW_CANONICAL_APPROVAL_MISSING", "BUSINESS",
    );
    // Mandatory live module permission, exact active member, and SoD check.
    const requesterUserId = candidate.requestedByUserId;
    const requester = await prisma.organizationMember.findFirst({
      where: { organizationId: run.organizationId, userId: requesterUserId, status: "ACTIVE", removedAt: null },
      select: { userId: true },
    });
    if (!requester) throw new EnterpriseWorkflowError(
      "Le demandeur de cette validation n’est plus membre actif de l’entreprise.",
      403, "WORKFLOW_EXECUTION_MANDATE_REVOKED", "SECURITY",
    );
    if (candidate.approverUserId === requesterUserId) throw new EnterpriseWorkflowError(
      "Le demandeur ne peut pas valider sa propre opération.",
      409, "WORKFLOW_SELF_APPROVAL_BLOCKED", "BUSINESS",
    );
    const decision = await resolveEnterpriseModuleAccess({
      userId: candidate.approverUserId, organizationId: run.organizationId,
      moduleCode: workflowSourceModule(run.sourceEntityType), action: "approve",
    });
    if (!decision.allowed) throw new EnterpriseWorkflowError(
      "Le valideur officiel n’a plus les droits nécessaires sur le module financier.",
      403, "WORKFLOW_APPROVER_MODULE_DENIED", "SECURITY",
    );
    const linked = await prisma.enterpriseApproval.updateMany({
      where: {
        id: candidate.id, organizationId: run.organizationId,
        workflowRunId: null, workflowStepRunId: null,
        status: candidate.status, revision: candidate.revision, archivedAt: null,
      },
      data: { workflowRunId: run.id, workflowStepRunId: stepRun.id },
    });
    if (linked.count !== 1) {
      const changed = await prisma.enterpriseApproval.findFirst({
        where: { id: candidate.id, organizationId: run.organizationId },
      });
      if (changed?.workflowRunId !== run.id || changed.workflowStepRunId !== stepRun.id) {
        throw new EnterpriseWorkflowError(
          "Cette validation a changé ou est déjà associée à une autre exécution.",
          409, "WORKFLOW_APPROVAL_ALREADY_LINKED", "BUSINESS",
        );
      }
    }
    if (candidate.status === "PENDING") return {
      kind: "WAITING", runStatus: "WAITING_APPROVAL",
      assignedUserId: candidate.approverUserId, output: { approvalId: candidate.id },
    };
    return { kind: "SUCCEEDED", outcome: candidate.status,
      assignedUserId: candidate.approverUserId,
      actorUserId: candidate.status === "CANCELLED" ? null : candidate.approverUserId,
      output: { approvalId: candidate.id, decision: candidate.status },
    };
  }

  // An already-linked canonical approval is recovery evidence even when the
  // adapter no longer offers creation of fresh approvals. Never block its receipt.
  if (!adapter.createApproval) throw new EnterpriseWorkflowError("Ce type d’objet ne prend pas en charge les validations métier dans un workflow.", 400, "WORKFLOW_APPROVAL_TARGET_UNSUPPORTED", "CONFIGURATION");

  const assignment = parsed.configuration.assignment;
  const requesterUserId = await resolveWorkflowExecutionUser({ organizationId: run.organizationId, startedByUserId: run.startedByUserId, adapter, entity, action: "submit" });
  const existingPending = await prisma.enterpriseApproval.findFirst({
    where: { organizationId: run.organizationId, targetEntityType: run.sourceEntityType, targetEntityId: run.sourceEntityId, status: "PENDING", archivedAt: null },
    orderBy: { requestedAt: "desc" },
  });
  const moduleCode = workflowSourceModule(run.sourceEntityType);
  let approverUserId: string;
  try {
    approverUserId = await resolveWorkflowAssignment({
      organizationId: run.organizationId, strategy: assignment.strategy, entity,
      userId: assignment.userId, role: assignment.role, departmentId: assignment.departmentId,
      previousStepActorUserId, requiredApprovalModuleCode: moduleCode,
      excludeUserId: assignment.strategy === "SPECIFIC_ROLE" ? requesterUserId : undefined,
    });
  } catch (error) {
    // An ERP submission can already have an authoritative, designated
    // approval. For an unconfigured *template default* department manager,
    // reuse ONLY that same pending approval, never nominate another user.
    // An explicitly configured department/user/role must still fail closed.
    if (!(existingPending && assignment.strategy === "DEPARTMENT_MANAGER" && !assignment.departmentId
      && error instanceof EnterpriseWorkflowError
      && ["WORKFLOW_ASSIGNEE_NOT_FOUND", "WORKFLOW_APPROVER_MODULE_DENIED"].includes(error.code))) throw error;
    const mandate = await resolveEnterpriseModuleAccess({
      organizationId: run.organizationId, userId: existingPending.approverUserId,
      moduleCode, action: "approve",
    });
    if (!mandate.allowed) throw new EnterpriseWorkflowError(
      "Le validateur de la demande ERP ne possède plus le droit de valider ce module.",
      403, "WORKFLOW_APPROVER_MODULE_DENIED", "SECURITY",
    );
    approverUserId = existingPending.approverUserId;
  }
  if (approverUserId === requesterUserId) throw new EnterpriseWorkflowError("Le workflow ne peut pas assigner l’approbation au demandeur lui-même.", 409, "WORKFLOW_SELF_APPROVAL_BLOCKED", "BUSINESS");
  if (existingPending && existingPending.approverUserId !== approverUserId) throw new EnterpriseWorkflowError("Une validation en attente existe déjà pour un autre approbateur.", 409, "WORKFLOW_APPROVAL_CONFLICT", "BUSINESS");

  const action = await beginWorkflowActionAttempt({ organizationId: run.organizationId, stepRunId: stepRun.id, runId: run.id, stepId: step.id, executionToken: run.executionToken, actionType: "CREATE_APPROVAL" });
  if (action.alreadySucceeded && action.attempt.resultEntityId) {
    const approval = await prisma.enterpriseApproval.findFirst({ where: { id: action.attempt.resultEntityId, organizationId: run.organizationId } });
    if (approval?.status === "PENDING") return { kind: "WAITING", runStatus: "WAITING_APPROVAL", assignedUserId: approval.approverUserId, output: { approvalId: approval.id, idempotent: true } };
    if (approval) return { kind: "SUCCEEDED", outcome: approval.status, assignedUserId: approval.approverUserId, output: { approvalId: approval.id, decision: approval.status, idempotent: true } };
  }

  try {
    let approval = existingPending;
    if (!approval) {
      approval = await adapter.createApproval({ organizationId: run.organizationId, entityId: run.sourceEntityId, actorUserId: requesterUserId, approverUserId, revision: typeof entity.revision === "number" ? entity.revision : undefined });
    }
    const linked = await prisma.enterpriseApproval.updateMany({ where: { id: approval.id, organizationId: run.organizationId, workflowRunId: null, workflowStepRunId: null }, data: { workflowRunId: run.id, workflowStepRunId: stepRun.id } });
    if (linked.count !== 1) {
      const current = await prisma.enterpriseApproval.findFirst({ where: { id: approval.id, organizationId: run.organizationId } });
      if (current?.workflowRunId !== run.id || current.workflowStepRunId !== stepRun.id) throw new EnterpriseWorkflowError("Cette validation est déjà liée à une autre exécution.", 409, "WORKFLOW_APPROVAL_ALREADY_LINKED", "BUSINESS");
    }
    await completeWorkflowActionAttempt(action.attempt, { entityType: "EnterpriseApproval", entityId: approval.id });
    return { kind: "WAITING", runStatus: "WAITING_APPROVAL", assignedUserId: approverUserId, output: { approvalId: approval.id } };
  } catch (error) {
    await failWorkflowActionAttempt(action.attempt, error);
    throw error;
  }
};
