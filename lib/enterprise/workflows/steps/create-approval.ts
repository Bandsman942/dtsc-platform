import { createEnterpriseApproval } from "@/lib/enterprise/core-v2/service";
import { createEnterpriseBudgetApproval } from "@/lib/enterprise/finance/budget-service";
import { createEnterpriseExpenseApproval } from "@/lib/enterprise/finance/expense-service";
import { createEnterprisePurchaseApproval } from "@/lib/enterprise/procurement/purchase-service";
import { resolveWorkflowAssignment } from "@/lib/enterprise/workflows/adapters";
import { beginWorkflowActionAttempt, completeWorkflowActionAttempt, failWorkflowActionAttempt } from "@/lib/enterprise/workflows/action-attempts";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { resolveWorkflowExecutionUser } from "@/lib/enterprise/workflows/runtime-utils";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";
import { prisma } from "@/lib/prisma";

export const executeCreateApprovalStep: WorkflowStepHandler = async ({ run, step, stepRun, adapter, entity, previousStepActorUserId }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "CREATE_APPROVAL", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "CREATE_APPROVAL") throw new Error("Invalid CREATE_APPROVAL configuration");

  const alreadyLinked = await prisma.enterpriseApproval.findFirst({ where: { organizationId: run.organizationId, workflowRunId: run.id, workflowStepRunId: stepRun.id, archivedAt: null }, orderBy: { requestedAt: "desc" } });
  if (alreadyLinked) {
    if (alreadyLinked.status === "PENDING") return { kind: "WAITING", runStatus: "WAITING_APPROVAL", assignedUserId: alreadyLinked.approverUserId, output: { approvalId: alreadyLinked.id } };
    return { kind: "SUCCEEDED", outcome: alreadyLinked.status, assignedUserId: alreadyLinked.approverUserId, actorUserId: alreadyLinked.status === "CANCELLED" ? null : alreadyLinked.approverUserId, output: { approvalId: alreadyLinked.id, decision: alreadyLinked.status } };
  }

  const assignment = parsed.configuration.assignment;
  const approverUserId = await resolveWorkflowAssignment({ organizationId: run.organizationId, strategy: assignment.strategy, entity, userId: assignment.userId, role: assignment.role, departmentId: assignment.departmentId, previousStepActorUserId });
  const requesterUserId = await resolveWorkflowExecutionUser({ organizationId: run.organizationId, startedByUserId: run.startedByUserId, adapter, entity });
  if (approverUserId === requesterUserId) throw new EnterpriseWorkflowError("Le workflow ne peut pas assigner l’approbation au demandeur lui-même.", 409, "WORKFLOW_SELF_APPROVAL_BLOCKED", "BUSINESS");

  const existingPending = await prisma.enterpriseApproval.findFirst({ where: { organizationId: run.organizationId, targetEntityType: run.sourceEntityType, targetEntityId: run.sourceEntityId, status: "PENDING", archivedAt: null }, orderBy: { requestedAt: "desc" } });
  if (existingPending && existingPending.approverUserId !== approverUserId) throw new EnterpriseWorkflowError("Une validation en attente existe déjà pour un autre approbateur.", 409, "WORKFLOW_APPROVAL_CONFLICT", "BUSINESS");

  const action = await beginWorkflowActionAttempt({ organizationId: run.organizationId, stepRunId: stepRun.id, runId: run.id, stepId: step.id, actionType: "CREATE_APPROVAL" });
  if (action.alreadySucceeded && action.attempt.resultEntityId) {
    const approval = await prisma.enterpriseApproval.findFirst({ where: { id: action.attempt.resultEntityId, organizationId: run.organizationId } });
    if (approval?.status === "PENDING") return { kind: "WAITING", runStatus: "WAITING_APPROVAL", assignedUserId: approval.approverUserId, output: { approvalId: approval.id, idempotent: true } };
    if (approval) return { kind: "SUCCEEDED", outcome: approval.status, assignedUserId: approval.approverUserId, output: { approvalId: approval.id, decision: approval.status, idempotent: true } };
  }

  try {
    let approval = existingPending;
    if (!approval) {
      if (["EnterpriseRequest", "EnterpriseTask", "EnterpriseMeeting"].includes(run.sourceEntityType)) {
        approval = await createEnterpriseApproval({ organizationId: run.organizationId, actorUserId: requesterUserId, targetEntityType: run.sourceEntityType, targetEntityId: run.sourceEntityId, approverUserId });
      } else if (run.sourceEntityType === "EnterprisePurchase") {
        approval = await createEnterprisePurchaseApproval({ organizationId: run.organizationId, purchaseId: run.sourceEntityId, actorUserId: requesterUserId, approverUserId, purchaseRevision: typeof entity.revision === "number" ? entity.revision : undefined });
      } else if (run.sourceEntityType === "EnterpriseBudget") {
        approval = await createEnterpriseBudgetApproval({ organizationId: run.organizationId, budgetId: run.sourceEntityId, actorUserId: requesterUserId, approverUserId, budgetRevision: typeof entity.revision === "number" ? entity.revision : undefined });
      } else if (run.sourceEntityType === "EnterpriseExpense") {
        approval = await createEnterpriseExpenseApproval({ organizationId: run.organizationId, expenseId: run.sourceEntityId, actorUserId: requesterUserId, approverUserId, expenseRevision: typeof entity.revision === "number" ? entity.revision : undefined });
      } else {
        throw new EnterpriseWorkflowError("Ce type d’objet ne prend pas en charge les validations métier.", 400, "WORKFLOW_APPROVAL_TARGET_UNSUPPORTED", "CONFIGURATION");
      }
    }
    const linked = await prisma.enterpriseApproval.updateMany({ where: { id: approval.id, organizationId: run.organizationId, workflowRunId: null, workflowStepRunId: null }, data: { workflowRunId: run.id, workflowStepRunId: stepRun.id } });
    if (linked.count !== 1) {
      const current = await prisma.enterpriseApproval.findFirst({ where: { id: approval.id, organizationId: run.organizationId } });
      if (current?.workflowRunId !== run.id || current.workflowStepRunId !== stepRun.id) throw new EnterpriseWorkflowError("Cette validation est déjà liée à une autre exécution.", 409, "WORKFLOW_APPROVAL_ALREADY_LINKED", "BUSINESS");
    }
    await completeWorkflowActionAttempt(action.attempt.id, { entityType: "EnterpriseApproval", entityId: approval.id });
    return { kind: "WAITING", runStatus: "WAITING_APPROVAL", assignedUserId: approverUserId, output: { approvalId: approval.id } };
  } catch (error) {
    await failWorkflowActionAttempt(action.attempt.id, error);
    throw error;
  }
};
