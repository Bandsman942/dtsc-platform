import { compareWorkflowCondition } from "@/lib/enterprise/workflows/adapters";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeConditionStep: WorkflowStepHandler = async ({ step, adapter, entity }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "CONDITION", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "CONDITION") throw new EnterpriseWorkflowError("Configuration de condition invalide.", 400, "WORKFLOW_CONDITION_INVALID", "CONFIGURATION");
  if (!adapter.conditionFields.has(parsed.configuration.condition.field)) throw new EnterpriseWorkflowError("Ce champ conditionnel n’est pas autorisé.", 400, "WORKFLOW_CONDITION_FIELD_DENIED", "SECURITY");
  const left = adapter.getConditionField(entity, parsed.configuration.condition.field);
  const result = compareWorkflowCondition(left, parsed.configuration.condition.operator, parsed.configuration.condition.value);
  return { kind: "SUCCEEDED", outcome: result ? "TRUE" : "FALSE", output: { field: parsed.configuration.condition.field, operator: parsed.configuration.condition.operator, result } };
};
