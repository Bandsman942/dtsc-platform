import { AiProviderError } from "@/lib/ai/errors";
import type { AiStreamResult } from "@/lib/ai/types";
import type { AiAgentTurnResult } from "@/lib/ai/agent/types";

export class AiAgentCancelledError extends Error {
  constructor() {
    super("AGENT_CANCELLED");
    this.name = "AiAgentCancelledError";
  }
}

export async function consumeAiAgentModelTurn(input: {
  routed: AiStreamResult;
  signal?: AbortSignal;
  shouldCancel?: () => Promise<boolean>;
}): Promise<AiAgentTurnResult> {
  const startedAt = Date.now();
  const reader = input.routed.stream.getReader();
  let content = "";
  const toolCalls: AiAgentTurnResult["toolCalls"] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let cachedInputTokens = 0;
  let lastCancellationCheck = 0;

  try {
    while (true) {
      if (input.signal?.aborted) throw new AiAgentCancelledError();
      const now = Date.now();
      if (input.shouldCancel && now - lastCancellationCheck >= 750) {
        lastCancellationCheck = now;
        if (await input.shouldCancel()) throw new AiAgentCancelledError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "TEXT_DELTA") content += value.text;
      if (value.type === "TOOL_CALL_COMPLETED") {
        toolCalls.push({ id: value.id, name: value.name, arguments: value.arguments });
      }
      if (value.type === "USAGE") {
        inputTokens = Math.max(inputTokens, value.inputTokens || 0);
        outputTokens = Math.max(outputTokens, value.outputTokens || 0);
        totalTokens = Math.max(totalTokens, value.totalTokens || 0);
        cachedInputTokens = Math.max(cachedInputTokens, value.cachedInputTokens || 0);
      }
      if (value.type === "ERROR") {
        throw new AiProviderError({ reasonCode: value.reasonCode, message: `Agent model turn failed: ${value.reasonCode}` });
      }
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (!totalTokens) totalTokens = inputTokens + outputTokens;
  return {
    content,
    toolCalls,
    usage: { inputTokens, outputTokens, totalTokens, cachedInputTokens, estimatedCost: 0 },
    providerCode: input.routed.providerCode,
    modelCode: input.routed.modelCode,
    durationMs: Date.now() - startedAt,
  };
}
