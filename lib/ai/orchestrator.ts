import { randomUUID } from "node:crypto";
import { getAiModelDefinition, getAiProviderDefinition, listAvailableAiModels } from "@/lib/ai/catalog";
import { estimateAiCost } from "@/lib/ai/costs";
import { AiProviderError, toAiReasonCode } from "@/lib/ai/errors";
import { completeAiProviderAttempt, startAiProviderAttempt } from "@/lib/ai/observability";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import { createProviderEventStream } from "@/lib/ai/provider";
import type { AiModelDefinition, AiRouteRequest, AiRouteSelection, AiStreamResult } from "@/lib/ai/types";
import { getCanonicalAiUsageLimits } from "@/lib/billing/ai-usage-limits";

function selectCandidates(request: AiRouteRequest) {
  const available = listAvailableAiModels({
    context: request.context,
    locale: request.locale,
    taskType: request.taskType,
    planCode: request.planCode,
    dataClassifications: request.dataClassifications,
    requiredCapabilities: request.requiredCapabilities,
    maximumContextTokens: request.maximumContextTokens,
    allowSensitiveExternalModel: request.policyFlags?.allowSensitiveExternalModel,
  });
  const requested = getAiModelDefinition(request.requestedModel);

  if (request.requestedModel) {
    const requestedAllowed = requested && available.some((candidate) => candidate.code === requested.code);
    if (!requestedAllowed) {
      throw new AiProviderError({
        reasonCode: "MODEL_UNAVAILABLE",
        message: "The requested AI model is not allowed by the active plan or policy",
        statusCode: 403,
      });
    }
  }

  const ordered: AiModelDefinition[] = [];
  const add = (model: AiModelDefinition | null | undefined) => {
    if (model && available.some((candidate) => candidate.code === model.code) && !ordered.some((candidate) => candidate.code === model.code)) ordered.push(model);
  };
  add(requested);
  if (requested) for (const fallbackCode of requested.fallbackModelCodes) add(getAiModelDefinition(fallbackCode));
  for (const candidate of available) add(candidate);
  return ordered;
}

function buildSelection(request: AiRouteRequest, model: AiModelDefinition): AiRouteSelection {
  const estimated = estimateAiCost({ model, inputTokens: request.messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0), outputTokens: 0 });
  return {
    strategyCode: "POLICY_CAPABILITY_PLAN_DATA_V1",
    taskType: request.taskType,
    requestedModel: request.requestedModel || null,
    selectedModel: model,
    fallbackModelCodes: [...model.fallbackModelCodes],
    selectionReason: request.requestedModel ? "REQUESTED_MODEL_POLICY_ALLOWED" : "DEFAULT_POLICY_ALLOWED_MODEL",
    estimatedInputCost: estimated.amount,
    currency: estimated.currency,
  };
}

async function resolveServerPlanCode(request: AiRouteRequest) {
  if (request.context === "DTSC_INTERNAL") return "ENTERPRISE" as const;
  const limits = await getCanonicalAiUsageLimits({ userId: request.userId, organizationId: request.organizationId });
  return limits.planCode;
}

function observeProviderEventStream({
  source,
  attemptId,
  startedAt,
}: {
  source: ReadableStream<AiProviderEvent>;
  attemptId?: string | null;
  startedAt: number;
}) {
  let finalized = false;
  const finalize = async (status: "SUCCESS" | "FAILED" | "CANCELLED", reasonCode?: string | null) => {
    if (finalized) return;
    finalized = true;
    await completeAiProviderAttempt({ attemptId, status, reasonCode, durationMs: Date.now() - startedAt });
  };

  return new ReadableStream<AiProviderEvent>({
    async start(controller) {
      const reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await finalize("FAILED", "STREAM_INTERRUPTED");
            controller.close();
            return;
          }
          controller.enqueue(value);
          if (value.type === "COMPLETED") {
            await finalize("SUCCESS");
            controller.close();
            await reader.cancel("PROVIDER_COMPLETED").catch(() => undefined);
            return;
          }
          if (value.type === "ERROR") {
            await finalize("FAILED", value.reasonCode);
            controller.close();
            await reader.cancel("PROVIDER_ERROR").catch(() => undefined);
            return;
          }
        }
      } catch (error) {
        const reasonCode = toAiReasonCode(error);
        await finalize(reasonCode === "STREAM_INTERRUPTED" ? "CANCELLED" : "FAILED", reasonCode);
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      await finalize("CANCELLED", "STREAM_INTERRUPTED");
      await source.cancel(reason).catch(() => undefined);
    },
  });
}

export async function routeAiStream(request: AiRouteRequest): Promise<AiStreamResult> {
  const effectiveRequest: AiRouteRequest = {
    ...request,
    planCode: await resolveServerPlanCode(request),
  };
  const candidates = selectCandidates(effectiveRequest);
  if (!candidates.length) {
    throw new AiProviderError({ reasonCode: "MODEL_UNAVAILABLE", message: "No policy-allowed AI model is configured", statusCode: 503 });
  }

  const attempts: AiStreamResult["attempts"] = [];
  const routeRequestId = randomUUID();
  let lastError: unknown;
  for (const [index, model] of candidates.entries()) {
    const provider = getAiProviderDefinition(model.providerCode);
    if (!provider || provider.status === "DISABLED") continue;
    const attemptStartedAt = Date.now();
    const attempt = await startAiProviderAttempt({
      routeRequestId,
      userId: effectiveRequest.userId,
      organizationId: effectiveRequest.organizationId,
      contextCode: effectiveRequest.context,
      taskType: effectiveRequest.taskType,
      providerCode: provider.code,
      modelCode: model.code,
      providerModelId: model.providerModelId,
      attemptIndex: index,
    });
    try {
      const providerStream = await createProviderEventStream({ provider, model, messages: effectiveRequest.messages, instructions: effectiveRequest.instructions, signal: effectiveRequest.signal });
      const stream = observeProviderEventStream({ source: providerStream, attemptId: attempt?.id, startedAt: attemptStartedAt });
      attempts.push({ providerCode: provider.code, modelCode: model.code, outcome: "SUCCESS" });
      return {
        stream,
        selection: buildSelection(effectiveRequest, model),
        providerCode: provider.code,
        modelCode: model.code,
        providerModelId: model.providerModelId,
        fallbackUsed: index > 0,
        attempts,
      };
    } catch (error) {
      lastError = error;
      const reasonCode = toAiReasonCode(error);
      attempts.push({ providerCode: provider.code, modelCode: model.code, outcome: "FAILED", reasonCode });
      await completeAiProviderAttempt({
        attemptId: attempt?.id,
        status: reasonCode === "STREAM_INTERRUPTED" ? "CANCELLED" : "FAILED",
        reasonCode,
        durationMs: Date.now() - attemptStartedAt,
      });
      if (!(error instanceof AiProviderError) || !error.retryable) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new AiProviderError({ reasonCode: "PROVIDER_UNAVAILABLE", message: "All configured AI routes failed", statusCode: 502 });
}
