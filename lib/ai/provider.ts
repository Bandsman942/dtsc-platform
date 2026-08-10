import { AiProviderError } from "@/lib/ai/errors";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import { createOpenAiResponsesEventStream } from "@/lib/ai/providers/openai-responses";
import type { AiModelDefinition, AiProviderDefinition } from "@/lib/ai/types";
import type { OpenAIInputMessage } from "@/lib/openai";

export async function createProviderEventStream({
  provider,
  model,
  messages,
  instructions,
  signal,
}: {
  provider: AiProviderDefinition;
  model: AiModelDefinition;
  messages: OpenAIInputMessage[];
  instructions: string;
  signal?: AbortSignal;
}): Promise<ReadableStream<AiProviderEvent>> {
  if (provider.protocol === "OPENAI_RESPONSES") {
    return createOpenAiResponsesEventStream({ provider, model, messages, instructions, signal });
  }

  throw new AiProviderError({
    reasonCode: "INVALID_REQUEST",
    message: `Unsupported AI provider protocol: ${provider.protocol}`,
    providerCode: provider.code,
    modelCode: model.code,
  });
}
