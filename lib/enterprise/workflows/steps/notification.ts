import { notifyUser } from "@/lib/notifications";
import { resolveWorkflowAssignment } from "@/lib/enterprise/workflows/adapters";
import { beginWorkflowActionAttempt, completeWorkflowActionAttempt, failWorkflowActionAttempt, workflowActionIdempotencyKey } from "@/lib/enterprise/workflows/action-attempts";
import { renderWorkflowTemplate } from "@/lib/enterprise/workflows/template";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeNotificationStep: WorkflowStepHandler = async ({ run, step, stepRun, workflowName, adapter, entity, previousStepActorUserId }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "NOTIFICATION", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "NOTIFICATION") throw new Error("Invalid NOTIFICATION configuration");
  const action = await beginWorkflowActionAttempt({ organizationId: run.organizationId, stepRunId: stepRun.id, runId: run.id, stepId: step.id, actionType: "NOTIFICATION" });
  if (action.alreadySucceeded) return { kind: "SUCCEEDED", outcome: "DEFAULT", output: { notificationId: action.attempt.resultEntityId, idempotent: true } };
  try {
    const recipient = parsed.configuration.recipient;
    const userId = await resolveWorkflowAssignment({ organizationId: run.organizationId, strategy: recipient.strategy, entity, userId: recipient.userId, role: recipient.role, departmentId: recipient.departmentId, previousStepActorUserId });
    const values = adapter.getTemplateValues(entity, workflowName);
    const notification = await notifyUser({
      userId,
      organizationId: run.organizationId,
      title: renderWorkflowTemplate(parsed.configuration.titleTemplate, values, adapter.placeholders),
      body: renderWorkflowTemplate(parsed.configuration.bodyTemplate, values, adapter.placeholders),
      type: "WORKFLOW",
      targetUrl: parsed.configuration.targetUrl || `/enterprise-modules/WORKFLOWS?runId=${encodeURIComponent(run.id)}`,
      idempotencyKey: workflowActionIdempotencyKey(run.id, step.id, "NOTIFICATION"),
    });
    await completeWorkflowActionAttempt(action.attempt.id, { entityType: "Notification", entityId: notification?.id || null });
    return { kind: "SUCCEEDED", outcome: "DEFAULT", assignedUserId: userId, output: { notificationId: notification?.id || null, recipientUserId: userId } };
  } catch (error) {
    await failWorkflowActionAttempt(action.attempt.id, error);
    throw error;
  }
};
