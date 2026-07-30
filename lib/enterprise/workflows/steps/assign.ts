import { resolveWorkflowAssignment } from "@/lib/enterprise/workflows/adapters";
import { workflowStepSchema } from "@/lib/enterprise/workflows/validators";
import type { WorkflowStepHandler } from "@/lib/enterprise/workflows/steps/types";

export const executeAssignStep: WorkflowStepHandler = async ({ run, step, entity, previousStepActorUserId }) => {
  const parsed = workflowStepSchema.parse({ code: step.code, name: step.name, stepType: "ASSIGN", position: 0, configuration: step.configurationJson });
  if (parsed.stepType !== "ASSIGN") throw new Error("Invalid ASSIGN configuration");
  const assignment = parsed.configuration.assignment;
  const assignedUserId = await resolveWorkflowAssignment({ organizationId: run.organizationId, strategy: assignment.strategy, entity, userId: assignment.userId, role: assignment.role, departmentId: assignment.departmentId, previousStepActorUserId });
  return { kind: "SUCCEEDED", outcome: "DEFAULT", assignedUserId, output: { assignedUserId, strategy: assignment.strategy } };
};
