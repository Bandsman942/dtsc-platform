import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeEndStep: WorkflowStepHandler = async ({ step }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "END", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "END") throw new Error("Invalid END configuration");
  return { kind: "END", outcome: parsed.configuration.outcome, output: { outcome: parsed.configuration.outcome } };
};
