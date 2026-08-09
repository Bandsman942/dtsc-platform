import { estimateAiCost } from "@/lib/ai/costs";
import type { AiRuntimeHealth } from "@/lib/ai/health";
import type { AiModelDefinition, AiRouteRequest } from "@/lib/ai/types";

export type AiCandidateScore = {
  total: number;
  capabilityScore: number;
  preferenceScore: number;
  healthScore: number;
  costScore: number;
  latencyScore: number;
  estimatedInputCost: number | null;
  reasonParts: string[];
};

function estimateInputTokens(request: AiRouteRequest) {
  return request.messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0);
}

export function scoreAiCandidate({
  request,
  model,
  health,
}: {
  request: AiRouteRequest;
  model: AiModelDefinition;
  health: AiRuntimeHealth;
}): AiCandidateScore {
  let capabilityScore = 40;
  const reasonParts: string[] = ["POLICY_ELIGIBLE"];

  if (request.taskType === "REASONING" && model.capabilities.reasoning) {
    capabilityScore += 25;
    reasonParts.push("REASONING_MATCH");
  }
  if (request.taskType === "TOOL_EXECUTION" && model.capabilities.tools) {
    capabilityScore += 20;
    reasonParts.push("TOOLS_MATCH");
  }
  if (request.taskType === "VISION" && model.capabilities.vision) {
    capabilityScore += 25;
    reasonParts.push("VISION_MATCH");
  }
  if (model.profileCodes?.includes("FAST") && ["GENERAL_CHAT", "SUMMARIZATION", "TRANSLATION"].includes(request.taskType)) {
    capabilityScore += 8;
    reasonParts.push("FAST_PROFILE_MATCH");
  }
  if (model.profileCodes?.includes("BALANCED") && request.taskType === "GENERAL_CHAT") {
    capabilityScore += 6;
    reasonParts.push("BALANCED_PROFILE_MATCH");
  }

  const preferenceScore = request.requestedModel && (request.requestedModel === model.code || request.requestedModel === model.providerModelId) ? 30 : 0;
  if (preferenceScore) reasonParts.push("USER_PREFERENCE_ALLOWED");

  const healthScore = health.status === "HEALTHY" ? 20 : health.status === "DEGRADED" ? -20 : -1000;
  reasonParts.push(`HEALTH_${health.status}`);

  const estimated = estimateAiCost({ model, inputTokens: estimateInputTokens(request), outputTokens: 0 });
  const estimatedInputCost = estimated.amount;
  let costScore = 0;
  if (estimatedInputCost != null) {
    costScore = request.routingConstraints?.preferLowerCost === false ? 0 : Math.max(-20, -Math.round(estimatedInputCost * 1000));
    reasonParts.push("COST_KNOWN");
  } else {
    reasonParts.push("COST_UNKNOWN");
  }

  let latencyScore = 0;
  if (health.averageFirstTokenLatencyMs != null) {
    latencyScore = request.routingConstraints?.preferLowerLatency === false
      ? 0
      : Math.max(-20, -Math.round(health.averageFirstTokenLatencyMs / 250));
    reasonParts.push("LATENCY_OBSERVED");
  } else {
    reasonParts.push("LATENCY_UNKNOWN");
  }

  return {
    total: capabilityScore + preferenceScore + healthScore + costScore + latencyScore,
    capabilityScore,
    preferenceScore,
    healthScore,
    costScore,
    latencyScore,
    estimatedInputCost,
    reasonParts,
  };
}
