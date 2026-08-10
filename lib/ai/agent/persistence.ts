import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AiAgentBudget, AiAgentExecutionClass, AiAgentRunStatus, AiAgentScope, AiAgentUsage } from "@/lib/ai/agent/types";

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function createAiAgentRun(input: {
  userId: string;
  organizationId?: string | null;
  scope: AiAgentScope;
  executionClass: AiAgentExecutionClass;
  contextCode: string;
  assistantCode?: string | null;
  conversationId?: string | null;
  enterpriseConversationId?: string | null;
  budget: AiAgentBudget;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.aiAgentRun.create({
    data: {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId || null,
      scope: input.scope,
      executionClass: input.executionClass,
      contextCode: input.contextCode,
      assistantCode: input.assistantCode || null,
      conversationId: input.conversationId || null,
      enterpriseConversationId: input.enterpriseConversationId || null,
      status: "RUNNING",
      maxSteps: input.budget.maxSteps,
      maxToolCalls: input.budget.maxToolCalls,
      maxTokens: input.budget.maxTokens,
      maxEstimatedCost: input.budget.maxEstimatedCost,
      maxDurationMs: input.budget.maxDurationMs,
      allowedToolModesJson: jsonValue(input.budget.allowedToolModes),
      allowedToolCodesJson: input.budget.allowedToolCodes ? jsonValue(input.budget.allowedToolCodes) : Prisma.JsonNull,
      metadataJson: input.metadata ? jsonValue(input.metadata) : Prisma.JsonNull,
    },
  });
}

export async function recordAiAgentStep(input: {
  runId: string;
  stepIndex: number;
  kind: "MODEL" | "TOOL" | "CONFIRMATION" | "SYSTEM";
  status: string;
  toolCode?: string | null;
  providerCode?: string | null;
  modelCode?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  durationMs?: number | null;
  reasonCode?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.aiAgentStep.create({
    data: {
      id: randomUUID(),
      runId: input.runId,
      stepIndex: input.stepIndex,
      kind: input.kind,
      status: input.status,
      toolCode: input.toolCode || null,
      providerCode: input.providerCode || null,
      modelCode: input.modelCode || null,
      inputTokens: input.inputTokens || 0,
      outputTokens: input.outputTokens || 0,
      totalTokens: input.totalTokens || 0,
      estimatedCost: input.estimatedCost || 0,
      durationMs: input.durationMs ?? null,
      reasonCode: input.reasonCode || null,
      metadataJson: input.metadata ? jsonValue(input.metadata) : Prisma.JsonNull,
      completedAt: new Date(),
    },
  });
}

export async function updateAiAgentRunProgress(input: {
  runId: string;
  status?: AiAgentRunStatus;
  currentStep?: number;
  toolCallCount?: number;
  usage?: AiAgentUsage;
  pendingConfirmationId?: string | null;
  reasonCode?: string | null;
  completed?: boolean;
  cancelled?: boolean;
}) {
  return prisma.aiAgentRun.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      currentStep: input.currentStep,
      toolCallCount: input.toolCallCount,
      inputTokens: input.usage?.inputTokens,
      outputTokens: input.usage?.outputTokens,
      totalTokens: input.usage?.totalTokens,
      estimatedCost: input.usage?.estimatedCost,
      pendingConfirmationId: input.pendingConfirmationId === undefined ? undefined : input.pendingConfirmationId,
      reasonCode: input.reasonCode === undefined ? undefined : input.reasonCode,
      completedAt: input.completed ? new Date() : undefined,
      cancelledAt: input.cancelled ? new Date() : undefined,
    },
  });
}

export async function getAiAgentRunForUser(input: { runId: string; userId: string; organizationId?: string | null }) {
  return prisma.aiAgentRun.findFirst({
    where: {
      id: input.runId,
      userId: input.userId,
      ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId || null }),
    },
    include: {
      steps: {
        orderBy: [{ stepIndex: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          stepIndex: true,
          kind: true,
          status: true,
          toolCode: true,
          providerCode: true,
          modelCode: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedCost: true,
          durationMs: true,
          reasonCode: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  });
}

export async function requestAiAgentCancellation(input: { runId: string; userId: string; organizationId?: string | null }) {
  const scopedWhere = {
    id: input.runId,
    userId: input.userId,
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId || null }),
  };
  const run = await prisma.aiAgentRun.findFirst({ where: scopedWhere, select: { id: true, status: true } });
  if (!run || !["RUNNING", "WAITING_CONFIRMATION", "READY_TO_RESUME"].includes(run.status)) return false;
  const now = new Date();
  if (run.status === "RUNNING") {
    await prisma.aiAgentRun.update({ where: { id: run.id }, data: { cancelRequestedAt: now } });
  } else {
    await prisma.aiAgentRun.update({
      where: { id: run.id },
      data: { status: "CANCELLED", cancelRequestedAt: now, cancelledAt: now, completedAt: now, reasonCode: "CANCELLED_BY_USER" },
    });
  }
  return true;
}

export async function isAiAgentCancellationRequested(runId: string) {
  const run = await prisma.aiAgentRun.findUnique({ where: { id: runId }, select: { cancelRequestedAt: true, status: true } });
  return Boolean(run?.cancelRequestedAt || run?.status === "CANCELLED");
}

export async function markAiAgentReadyAfterConfirmation(input: { confirmationId: string; userId: string }) {
  const result = await prisma.aiAgentRun.updateMany({
    where: { pendingConfirmationId: input.confirmationId, userId: input.userId, status: "WAITING_CONFIRMATION" },
    data: { status: "READY_TO_RESUME" },
  });
  return result.count;
}
