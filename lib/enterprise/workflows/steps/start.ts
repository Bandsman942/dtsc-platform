import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeStartStep: WorkflowStepHandler = async () => ({ kind: "SUCCEEDED", outcome: "DEFAULT", output: { started: true } });
