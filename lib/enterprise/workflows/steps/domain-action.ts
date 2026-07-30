import { beginWorkflowActionAttempt, completeWorkflowActionAttempt, failWorkflowActionAttempt } from "@/lib/enterprise/workflows/action-attempts";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { renderWorkflowTemplate } from "@/lib/enterprise/workflows/template";
import { resolveWorkflowExecutionUser } from "@/lib/enterprise/workflows/runtime-utils";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeDomainActionStep: WorkflowStepHandler = async ({ run, step, stepRun, workflowName, adapter, entity }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "DOMAIN_ACTION", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "DOMAIN_ACTION") throw new Error("Invalid DOMAIN_ACTION configuration");
  if (!adapter.domainActions.has(parsed.configuration.action)) throw new EnterpriseWorkflowError("Cette commande métier n’est pas autorisée.", 400, "WORKFLOW_DOMAIN_ACTION_DENIED", "CONFIGURATION");
  const action = await beginWorkflowActionAttempt({ organizationId: run.organizationId, stepRunId: stepRun.id, runId: run.id, stepId: step.id, actionType: `DOMAIN_ACTION:${parsed.configuration.action}` });
  if (action.alreadySucceeded) return { kind: "SUCCEEDED", outcome: "DEFAULT", output: { entityType: action.attempt.resultEntityType, entityId: action.attempt.resultEntityId, idempotent: true } };
  try {
    const actorUserId = await resolveWorkflowExecutionUser({ organizationId: run.organizationId, startedByUserId: run.startedByUserId, adapter, entity });
    const revision = typeof entity.revision === "number" ? entity.revision : 1;
    const comment = parsed.configuration.commentTemplate ? renderWorkflowTemplate(parsed.configuration.commentTemplate, adapter.getTemplateValues(entity, workflowName), adapter.placeholders) : `Action ${parsed.configuration.action} exécutée par le workflow ${workflowName}.`;
    const result = await adapter.executeDomainAction({ organizationId: run.organizationId, entityId: run.sourceEntityId, actorUserId, action: parsed.configuration.action, revision, comment });
    await completeWorkflowActionAttempt(action.attempt.id, { entityType: result.entityType, entityId: result.entityId });
    return { kind: "SUCCEEDED", outcome: "DEFAULT", actorUserId, output: { entityType: result.entityType, entityId: result.entityId, status: result.status || null, revision: result.revision || null } };
  } catch (error) {
    await failWorkflowActionAttempt(action.attempt.id, error);
    throw error;
  }
};
