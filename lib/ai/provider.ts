import { AiProviderError } from "@/lib/ai/errors";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import { createOpenAiResponsesEventStream } from "@/lib/ai/providers/openai-responses";
import { createOpenRouterChatCompletionsEventStream } from "@/lib/ai/providers/openrouter-chat-completions";
import type { AiModelDefinition, AiProviderDefinition, AiProviderInputMessage, AiProviderToolDefinition, AiRoutingConstraints } from "@/lib/ai/types";

export async function createProviderEventStream({
  provider,
  model,
  messages,
  instructions,
  routingConstraints,
  tools,
  signal,
}: {
  provider: AiProviderDefinition;
  model: AiModelDefinition;
  messages: AiProviderInputMessage[];
  instructions: string;
  routingConstraints?: AiRoutingConstraints;
  tools?: AiProviderToolDefinition[];
  signal?: AbortSignal;
}): Promise<ReadableStream<AiProviderEvent>> {
  if (provider.protocol === "OPENAI_RESPONSES") {
    return createOpenAiResponsesEventStream({ provider, model, messages, instructions, tools, signal });
  }
  if (provider.protocol === "OPENROUTER_CHAT_COMPLETIONS") {
    return createOpenRouterChatCompletionsEventStream({ provider, model, messages, instructions, routingConstraints, tools, signal });
  }

  throw new AiProviderError({
    reasonCode: "PROVIDER_PROTOCOL_INVALID",
    message: `Unsupported AI provider protocol: ${provider.protocol}`,
    providerCode: provider.code,
    modelCode: model.code,
  });
}
