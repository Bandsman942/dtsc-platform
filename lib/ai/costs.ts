import type { AiModelDefinition } from "@/lib/ai/types";

export function estimateAiCost({
  model,
  inputTokens,
  outputTokens,
  cachedInputTokens = 0,
}: {
  model: AiModelDefinition;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}) {
  const profile = model.costProfile;
  if (!profile || profile.inputPerMillion == null || profile.outputPerMillion == null) {
    return { amount: null, currency: profile?.currency || null, kind: "UNKNOWN" as const };
  }
  const regularInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  const regularInputCost = (regularInputTokens / 1_000_000) * profile.inputPerMillion;
  const cachedInputCost = profile.cachedInputPerMillion == null
    ? (cachedInputTokens / 1_000_000) * profile.inputPerMillion
    : (cachedInputTokens / 1_000_000) * profile.cachedInputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * profile.outputPerMillion;
  return {
    amount: Number((regularInputCost + cachedInputCost + outputCost).toFixed(8)),
    currency: profile.currency || "USD",
    kind: "ESTIMATED" as const,
  };
}
