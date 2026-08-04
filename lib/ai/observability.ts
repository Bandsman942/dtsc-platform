import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { estimateAiCost } from "@/lib/ai/costs";
import type { AiRouteSelection } from "@/lib/ai/types";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function startAiModelCall({
  userId,
  organizationId,
  contextCode,
  locale,
  conversationId,
  enterpriseConversationId,
  selection,
  providerCode,
  providerModelId,
  fallbackUsed,
  attempts,
  promptVersion,
}: {
  userId: string;
  organizationId?: string | null;
  contextCode: string;
  locale: string;
  conversationId?: string | null;
  enterpriseConversationId?: string | null;
  selection: AiRouteSelection;
  providerCode: string;
  providerModelId: string;
  fallbackUsed: boolean;
  attempts: unknown;
  promptVersion?: string | null;
}) {
  return prisma.aiModelCall.create({
    data: {
      userId,
      organizationId: organizationId || null,
      contextCode,
      taskType: selection.taskType,
      locale,
      conversationId: conversationId || null,
      enterpriseConversationId: enterpriseConversationId || null,
      providerCode,
      modelCode: selection.selectedModel.code,
      providerModelId,
      strategyCode: selection.strategyCode,
      promptVersion: promptVersion || null,
      fallbackUsed,
      retryCount: Math.max((attempts as Array<unknown>).length - 1, 0),
      metadataJson: jsonValue({ attempts, selectionReason: selection.selectionReason, requestedModel: selection.requestedModel }),
    },
  });
}

export async function completeAiModelCall({
  callId,
  model,
  inputTokens,
  outputTokens,
  cachedInputTokens = 0,
  durationMs,
  firstTokenLatencyMs,
}: {
  callId: string;
  model: AiRouteSelection["selectedModel"];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  durationMs: number;
  firstTokenLatencyMs?: number | null;
}) {
  const totalTokens = inputTokens + outputTokens;
  const cost = estimateAiCost({ model, inputTokens, outputTokens, cachedInputTokens });
  return prisma.aiModelCall.update({
    where: { id: callId },
    data: {
      status: "SUCCESS",
      inputTokens,
      outputTokens,
      cachedInputTokens,
      totalTokens,
      estimatedCost: cost.amount == null ? null : new Prisma.Decimal(cost.amount),
      costCurrency: cost.currency,
      costKind: cost.kind,
      durationMs,
      firstTokenLatencyMs: firstTokenLatencyMs || null,
      completedAt: new Date(),
    },
  });
}

export async function interruptAiModelCall(callId: string, durationMs: number) {
  return prisma.aiModelCall.update({
    where: { id: callId },
    data: { status: "CANCELLED", reasonCode: "STREAM_INTERRUPTED", durationMs, completedAt: new Date() },
  }).catch(() => null);
}

export async function failAiModelCall(callId: string, reasonCode: string, durationMs: number) {
  return prisma.aiModelCall.update({
    where: { id: callId },
    data: { status: "FAILED", reasonCode, durationMs, completedAt: new Date() },
  }).catch(() => null);
}
