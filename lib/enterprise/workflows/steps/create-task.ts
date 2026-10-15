import { prisma } from "@/lib/prisma";
import { requireWorkflowExecution, workflowLeaseLost } from "@/lib/enterprise/workflows/execution-lease";
import { createEnterpriseTaskInTransaction } from "@/lib/enterprise/core-v2/service";
import { resolveWorkflowAssignment } from "@/lib/enterprise/workflows/adapters";
import { beginWorkflowActionAttempt, completeWorkflowActionAttempt, failWorkflowActionAttempt } from "@/lib/enterprise/workflows/action-attempts";
import { renderWorkflowTemplate } from "@/lib/enterprise/workflows/template";
import { resolveWorkflowExecutionUser, workflowSourceModule } from "@/lib/enterprise/workflows/runtime-utils";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeCreateTaskStep: WorkflowStepHandler = async ({ run, step, stepRun, workflowName, adapter, entity, previousStepActorUserId }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "CREATE_TASK", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "CREATE_TASK") throw new Error("Invalid CREATE_TASK configuration");
  const action = await beginWorkflowActionAttempt({ organizationId: run.organizationId, stepRunId: stepRun.id, runId: run.id, stepId: step.id, executionToken: run.executionToken, actionType: "CREATE_TASK", effectProtocol: "ATOMIC_TASK_V1" });
  if (action.alreadySucceeded) return { kind: "SUCCEEDED", outcome: "DEFAULT", output: { taskId: action.attempt.resultEntityId, idempotent: true } };
  try {
    const values = adapter.getTemplateValues(entity, workflowName);
    const actorUserId = await resolveWorkflowExecutionUser({ organizationId: run.organizationId, startedByUserId: run.startedByUserId, adapter, entity });
    const assignment = parsed.configuration.assignment;
    const assignedToUserId = assignment ? await resolveWorkflowAssignment({ organizationId: run.organizationId, strategy: assignment.strategy, entity, userId: assignment.userId, role: assignment.role, departmentId: assignment.departmentId, previousStepActorUserId }) : null;
    const task = await prisma.$transaction(async (tx) => {
      if (!run.executionToken) throw workflowLeaseLost();
      await requireWorkflowExecution(tx, run.id, run.organizationId, run.executionToken);
      const created = await createEnterpriseTaskInTransaction(tx, run.organizationId, actorUserId, {
      taskType: parsed.configuration.taskType,
      title: renderWorkflowTemplate(parsed.configuration.titleTemplate, values, adapter.placeholders),
      description: parsed.configuration.descriptionTemplate ? renderWorkflowTemplate(parsed.configuration.descriptionTemplate, values, adapter.placeholders) : null,
      priority: parsed.configuration.priority === "URGENT" ? "CRITICAL" : parsed.configuration.priority,
      assignedToUserId,
      dueAt: parsed.configuration.dueInHours ? new Date(Date.now() + parsed.configuration.dueInHours * 60 * 60 * 1000) : null,
      sourceModule: workflowSourceModule(run.sourceEntityType),
      sourceEntityType: run.sourceEntityType,
      sourceEntityId: run.sourceEntityId,
    });
      await completeWorkflowActionAttempt(action.attempt, { entityType: "EnterpriseTask", entityId: created.id }, tx);
      return created;
    });
    return { kind: "SUCCEEDED", outcome: "DEFAULT", assignedUserId: assignedToUserId, actorUserId, output: { taskId: task.id, taskStatus: task.status } };
  } catch (error) {
    await failWorkflowActionAttempt(action.attempt, error, true);
    throw error;
  }
};
