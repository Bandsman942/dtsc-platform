import type { Prisma } from "@prisma/client";
import type { WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";

export type WorkflowRuntimeRun = {
  id: string;
  organizationId: string;
  workflowDefinitionId: string;
  workflowVersionId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  startedByUserId: string | null;
  decisionActorUserId: string | null;
  status: string;
  resumeAt: Date | null;
};

export type WorkflowRuntimeStep = {
  id: string;
  code: string;
  name: string;
  stepType: string;
  configurationJson: Prisma.JsonValue;
};

export type WorkflowRuntimeStepRun = {
  id: string;
  status: string;
  attemptCount: number;
  assignedUserId: string | null;
  startedAt: Date | null;
  outputJson: Prisma.JsonValue | null;
};

export type WorkflowStepHandlerContext = {
  run: WorkflowRuntimeRun;
  step: WorkflowRuntimeStep;
  stepRun: WorkflowRuntimeStepRun;
  workflowName: string;
  adapter: WorkflowEntityAdapter;
  entity: WorkflowEntitySnapshot;
  previousStepActorUserId?: string | null;
};

export type WorkflowStepHandlerResult =
  | { kind: "SUCCEEDED"; outcome?: string; assignedUserId?: string | null; output?: Prisma.InputJsonValue; actorUserId?: string | null }
  | { kind: "WAITING"; runStatus: "WAITING_APPROVAL" | "WAITING_TIME"; resumeAt?: Date | null; assignedUserId?: string | null; output?: Prisma.InputJsonValue }
  | { kind: "END"; outcome: "COMPLETED" | "REJECTED"; output?: Prisma.InputJsonValue };

export type WorkflowStepHandler = (context: WorkflowStepHandlerContext) => Promise<WorkflowStepHandlerResult>;
