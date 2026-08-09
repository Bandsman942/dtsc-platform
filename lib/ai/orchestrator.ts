import { getAiModelDefinition, getAiProviderDefinition, listAvailableAiModels } from "@/lib/ai/catalog";
import { estimateAiCost } from "@/lib/ai/costs";
import { AiProviderError, toAiReasonCode } from "@/lib/ai/errors";
import { createProviderResponseStream } from "@/lib/ai/provider";
import type { AiModelDefinition, AiRouteRequest, AiRouteSelection, AiStreamResult } from "@/lib/ai/types";

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

export async function routeAiStream(request: AiRouteRequest): Promise<AiStreamResult> {
  const candidates = selectCandidates(request);
  if (!candidates.length) {
    throw new AiProviderError({ reasonCode: "MODEL_UNAVAILABLE", message: "No policy-allowed AI model is configured", statusCode: 503 });
  }

  const attempts: AiStreamResult["attempts"] = [];
  let lastError: unknown;
  for (const [index, model] of candidates.entries()) {
    const provider = getAiProviderDefinition(model.providerCode);
    if (!provider || provider.status === "DISABLED") continue;
    try {
      const stream = await createProviderResponseStream({ provider, model, messages: request.messages, instructions: request.instructions, signal: request.signal });
      attempts.push({ providerCode: provider.code, modelCode: model.code, outcome: "SUCCESS" });
      return {
        stream,
        selection: buildSelection(request, model),
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
      if (!(error instanceof AiProviderError) || !error.retryable) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new AiProviderError({ reasonCode: "PROVIDER_UNAVAILABLE", message: "All configured AI routes failed", statusCode: 502 });
}
