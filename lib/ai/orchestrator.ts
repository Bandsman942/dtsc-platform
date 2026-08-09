import { randomUUID } from "node:crypto";
import { getAiModelDefinition, getAiProviderDefinition, listAvailableAiModels } from "@/lib/ai/catalog";
import { estimateAiCost } from "@/lib/ai/costs";
import { AiProviderError, toAiReasonCode } from "@/lib/ai/errors";
import { getAiRuntimeHealth, type AiRuntimeHealth } from "@/lib/ai/health";
import { completeAiProviderAttempt, startAiProviderAttempt } from "@/lib/ai/observability";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import { createProviderEventStream } from "@/lib/ai/provider";
import { scoreAiCandidate, type AiCandidateScore } from "@/lib/ai/routing-score";
import type { AiModelDefinition, AiProviderDefinition, AiRouteRequest, AiRouteSelection, AiStreamResult } from "@/lib/ai/types";
import { getCanonicalAiUsageLimits } from "@/lib/billing/ai-usage-limits";

type RankedCandidate = {
  model: AiModelDefinition;
  provider: AiProviderDefinition;
  health: AiRuntimeHealth;
  score: AiCandidateScore;
};

async function rankCandidates(request: AiRouteRequest): Promise<RankedCandidate[]> {
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

  const ranked = (await Promise.all(available.map(async (model) => {
    const provider = getAiProviderDefinition(model.providerCode);
    if (!provider) return null;
    const health = await getAiRuntimeHealth({ provider, model });
    if (health.status === "UNAVAILABLE" || health.status === "DISABLED_BY_POLICY") return null;
    const score = scoreAiCandidate({ request, model, health });
    const maximumCost = request.routingConstraints?.maximumEstimatedInputCost;
    if (maximumCost != null && (score.estimatedInputCost == null || score.estimatedInputCost > maximumCost)) return null;
    return { model, provider, health, score } satisfies RankedCandidate;
  }))).filter((candidate): candidate is RankedCandidate => Boolean(candidate));

  return ranked.sort((left, right) => {
    if (right.score.total !== left.score.total) return right.score.total - left.score.total;
    const leftCost = left.score.estimatedInputCost ?? Number.POSITIVE_INFINITY;
    const rightCost = right.score.estimatedInputCost ?? Number.POSITIVE_INFINITY;
    if (leftCost !== rightCost) return leftCost - rightCost;
    const leftLatency = left.health.averageFirstTokenLatencyMs ?? Number.POSITIVE_INFINITY;
    const rightLatency = right.health.averageFirstTokenLatencyMs ?? Number.POSITIVE_INFINITY;
    if (leftLatency !== rightLatency) return leftLatency - rightLatency;
    return left.model.code.localeCompare(right.model.code);
  });
}

function buildSelection(request: AiRouteRequest, candidate: RankedCandidate): AiRouteSelection {
  const estimated = estimateAiCost({
    model: candidate.model,
    inputTokens: request.messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0),
    outputTokens: 0,
  });
  return {
    strategyCode: "POLICY_CAPABILITY_COST_HEALTH_V2",
    taskType: request.taskType,
    requestedModel: request.requestedModel || null,
    selectedModel: candidate.model,
    fallbackModelCodes: [...candidate.model.fallbackModelCodes],
    selectionReason: candidate.score.reasonParts.join("|"),
    selectionScore: candidate.score.total,
    selectionCriteria: {
      capabilityScore: candidate.score.capabilityScore,
      preferenceScore: candidate.score.preferenceScore,
      healthScore: candidate.score.healthScore,
      costScore: candidate.score.costScore,
      latencyScore: candidate.score.latencyScore,
      healthStatus: candidate.health.status,
      reasonParts: candidate.score.reasonParts,
    },
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
  let reader: ReadableStreamDefaultReader<AiProviderEvent> | null = null;
  const finalize = async (status: "SUCCESS" | "FAILED" | "CANCELLED", reasonCode?: string | null) => {
    if (finalized) return;
    finalized = true;
    await completeAiProviderAttempt({ attemptId, status, reasonCode, durationMs: Date.now() - startedAt });
  };

  return new ReadableStream<AiProviderEvent>({
    async start(controller) {
      reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await finalize("FAILED", "STREAM_INTERRUPTED");
            controller.enqueue({ type: "ERROR", reasonCode: "STREAM_INTERRUPTED" });
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
        reader?.releaseLock();
        reader = null;
      }
    },
    async cancel(reason) {
      await finalize("CANCELLED", "STREAM_INTERRUPTED");
      await reader?.cancel(reason).catch(() => undefined);
    },
  });
}

export async function routeAiStream(request: AiRouteRequest): Promise<AiStreamResult> {
  const effectiveRequest: AiRouteRequest = {
    ...request,
    planCode: await resolveServerPlanCode(request),
  };
  const candidates = await rankCandidates(effectiveRequest);
  if (!candidates.length) {
    throw new AiProviderError({ reasonCode: "MODEL_UNAVAILABLE", message: "No policy-allowed and healthy AI model is configured", statusCode: 503 });
  }

  const attempts: AiStreamResult["attempts"] = [];
  const routeRequestId = randomUUID();
  let lastError: unknown;
  for (const [index, candidate] of candidates.entries()) {
    const { model, provider } = candidate;
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
      const providerStream = await createProviderEventStream({
        provider,
        model,
        messages: effectiveRequest.messages,
        instructions: effectiveRequest.instructions,
        routingConstraints: effectiveRequest.routingConstraints,
        signal: effectiveRequest.signal,
      });
      const stream = observeProviderEventStream({ source: providerStream, attemptId: attempt?.id, startedAt: attemptStartedAt });
      attempts.push({ providerCode: provider.code, modelCode: model.code, outcome: "SUCCESS" });
      const requestedBypassed = Boolean(effectiveRequest.requestedModel && effectiveRequest.requestedModel !== model.code && effectiveRequest.requestedModel !== model.providerModelId);
      return {
        stream,
        selection: buildSelection(effectiveRequest, candidate),
        providerCode: provider.code,
        modelCode: model.code,
        providerModelId: model.providerModelId,
        fallbackUsed: index > 0 || requestedBypassed,
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
