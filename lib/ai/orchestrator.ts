import { randomUUID } from "node:crypto";
import { buildApplicationInterfaceContext } from "@/lib/ai/application-interface-context";
import { getAiModelDefinition, getAiProviderDefinition, listAvailableAiModels } from "@/lib/ai/catalog";
import { estimateAiCost } from "@/lib/ai/costs";
import { AiProviderError, toAiReasonCode } from "@/lib/ai/errors";
import { getAiRuntimeHealth, type AiRuntimeHealth } from "@/lib/ai/health";
import { completeAiProviderAttempt, observeAiProviderAttemptStream, startAiProviderAttempt } from "@/lib/ai/observability";
import { createProviderEventStream } from "@/lib/ai/provider";
import { scoreAiCandidate, type AiCandidateScore } from "@/lib/ai/routing-score";
import type {
  AiDataClassification,
  AiModelDefinition,
  AiProviderDefinition,
  AiRouteRequest,
  AiRouteSelection,
  AiStreamResult,
} from "@/lib/ai/types";
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

  const ranked = (
    await Promise.all(
      available.map(async (model) => {
        const provider = getAiProviderDefinition(model.providerCode);
        if (!provider) return null;
        const health = await getAiRuntimeHealth({ provider, model });
        if (health.status === "UNAVAILABLE" || health.status === "DISABLED_BY_POLICY") return null;
        const score = scoreAiCandidate({ request, model, health });
        const maximumCost = request.routingConstraints?.maximumEstimatedInputCost;
        if (maximumCost != null && (score.estimatedInputCost == null || score.estimatedInputCost > maximumCost)) return null;
        return { model, provider, health, score } satisfies RankedCandidate;
      })
    )
  ).filter((candidate): candidate is RankedCandidate => Boolean(candidate));

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
      fallbackPenalty: candidate.score.fallbackPenalty,
      healthStatus: candidate.health.status,
      healthReason: candidate.health.reason,
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

function resolveServerDataClassifications(request: AiRouteRequest): AiDataClassification[] {
  if (request.dataClassifications?.length) return [...new Set(request.dataClassifications)];
  if (request.context === "ORGANIZATION" || request.organizationId) return ["CONFIDENTIAL"];
  return ["INTERNAL"];
}

export async function routeAiStream(request: AiRouteRequest): Promise<AiStreamResult> {
  const interfaceContext = request.assistantCode
    ? buildApplicationInterfaceContext({ contextCode: request.context, locale: request.locale })
    : "";
  const effectiveRequest: AiRouteRequest = {
    ...request,
    instructions: [request.instructions, interfaceContext].filter(Boolean).join("\n\n"),
    planCode: await resolveServerPlanCode(request),
    dataClassifications: resolveServerDataClassifications(request),
    policyFlags: { ...request.policyFlags, allowSensitiveExternalModel: false },
  };
  const candidates = await rankCandidates(effectiveRequest);
  if (!candidates.length) {
    throw new AiProviderError({
      reasonCode: "MODEL_UNAVAILABLE",
      message: "No policy-allowed and healthy AI model satisfies the active routing constraints",
      statusCode: 503,
    });
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
        tools: effectiveRequest.tools,
        signal: effectiveRequest.signal,
      });
      const stream = observeAiProviderAttemptStream({ source: providerStream, attemptId: attempt?.id, startedAt: attemptStartedAt });
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
      await completeAiProviderAttempt({ attemptId: attempt?.id, status: reasonCode === "STREAM_INTERRUPTED" ? "CANCELLED" : "FAILED", reasonCode, durationMs: Date.now() - attemptStartedAt });
      if (!(error instanceof AiProviderError) || !error.retryable) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiProviderError({ reasonCode: "PROVIDER_UNAVAILABLE", message: "All configured AI routes failed", statusCode: 502 });
}
