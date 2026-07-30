import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeWaitUntilStep: WorkflowStepHandler = async ({ run, step, adapter, entity }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "WAIT_UNTIL", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "WAIT_UNTIL") throw new Error("Invalid WAIT_UNTIL configuration");
  let resumeAt: Date;
  if (parsed.configuration.mode === "RELATIVE_HOURS") {
    resumeAt = run.resumeAt || new Date(Date.now() + parsed.configuration.hours * 60 * 60 * 1000);
  } else {
    if (!adapter.conditionFields.has(parsed.configuration.field)) throw new EnterpriseWorkflowError("Le champ de date d’attente n’est pas autorisé.", 400, "WORKFLOW_WAIT_FIELD_DENIED", "CONFIGURATION");
    const raw = adapter.getConditionField(entity, parsed.configuration.field);
    resumeAt = raw instanceof Date ? raw : new Date(String(raw || ""));
    if (Number.isNaN(resumeAt.getTime())) throw new EnterpriseWorkflowError("La date d’attente est invalide.", 400, "WORKFLOW_WAIT_DATE_INVALID", "CONFIGURATION");
  }
  if (resumeAt.getTime() <= Date.now()) return { kind: "SUCCEEDED", outcome: "DEFAULT", output: { resumedAt: new Date().toISOString() } };
  return { kind: "WAITING", runStatus: "WAITING_TIME", resumeAt, output: { resumeAt: resumeAt.toISOString() } };
};
