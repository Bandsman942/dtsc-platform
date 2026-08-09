import { AiProviderError, classifyProviderHttpError } from "@/lib/ai/errors";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import type { AiModelDefinition, AiProviderDefinition } from "@/lib/ai/types";
import { env } from "@/lib/env";
import type { OpenAIInputMessage } from "@/lib/openai";

type OpenRouterToolCallDelta = {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenRouterChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: OpenRouterToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: {
    code?: number | string;
    message?: string;
    metadata?: { error_type?: string };
  };
};

function classifyOpenRouterStreamError(chunk: OpenRouterChunk): AiProviderEvent {
  const errorType = chunk.error?.metadata?.error_type?.toLowerCase() || "";
  const code = Number(chunk.error?.code);
  if (code === 429 || errorType.includes("rate")) return { type: "ERROR", reasonCode: "RATE_LIMITED" };
  if (code === 401 || code === 403 || errorType.includes("auth")) return { type: "ERROR", reasonCode: "AUTHENTICATION_FAILED" };
  if (code === 408 || code === 504 || errorType.includes("timeout")) return { type: "ERROR", reasonCode: "TIMEOUT" };
  if (code >= 500 || errorType.includes("provider")) return { type: "ERROR", reasonCode: "PROVIDER_UNAVAILABLE" };
  return { type: "ERROR", reasonCode: "UNKNOWN_PROVIDER_ERROR" };
}

function parseDataLine(block: string) {
  const data = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("");
  return data || null;
}

function normalizeChunk(chunk: OpenRouterChunk): AiProviderEvent[] {
  if (chunk.error) return [classifyOpenRouterStreamError(chunk)];
  const events: AiProviderEvent[] = [];
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content;
  if (content) events.push({ type: "TEXT_DELTA", text: content });

  for (const toolCall of choice?.delta?.tool_calls || []) {
    events.push({
      type: "TOOL_CALL_DELTA",
      id: toolCall.id,
      name: toolCall.function?.name,
      argumentsDelta: toolCall.function?.arguments,
    });
  }

  if (chunk.usage) {
    events.push({
      type: "USAGE",
      inputTokens: chunk.usage.prompt_tokens ?? 0,
      outputTokens: chunk.usage.completion_tokens ?? 0,
      totalTokens: chunk.usage.total_tokens ?? 0,
      cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
    });
  }
  return events;
}

export async function createOpenRouterChatCompletionsEventStream({
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
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new AiProviderError({
      reasonCode: "AUTHENTICATION_FAILED",
      message: `Missing credential for ${provider.code}`,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (env.OPENROUTER_HTTP_REFERER) headers["HTTP-Referer"] = env.OPENROUTER_HTTP_REFERER;
  if (env.OPENROUTER_APP_TITLE) headers["X-OpenRouter-Title"] = env.OPENROUTER_APP_TITLE;

  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model.providerModelId,
        messages: [
          { role: "system", content: instructions },
          ...messages.map((message) => ({ role: message.role, content: message.content })),
        ],
        stream: true,
        stream_options: { include_usage: true },
        provider: {
          allow_fallbacks: false,
          data_collection: "deny",
        },
      }),
      signal,
    });
  } catch (error) {
    const interrupted = error instanceof DOMException && error.name === "AbortError";
    throw new AiProviderError({
      reasonCode: interrupted ? "STREAM_INTERRUPTED" : "PROVIDER_UNAVAILABLE",
      message: interrupted ? "AI provider request interrupted" : "AI provider request failed",
      retryable: !interrupted,
      statusCode: interrupted ? 499 : 502,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }

  if (!response.ok || !response.body) {
    const classified = classifyProviderHttpError(response.status);
    throw new AiProviderError({
      ...classified,
      message: `${provider.code} response ${response.status}`,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }

  const source = response.body;
  const decoder = new TextDecoder();
  return new ReadableStream<AiProviderEvent>({
    async start(controller) {
      const reader = source.getReader();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const data = parseDataLine(block);
            if (!data) continue;
            if (data === "[DONE]") {
              controller.enqueue({ type: "COMPLETED" });
              continue;
            }
            const chunk = JSON.parse(data) as OpenRouterChunk;
            for (const event of normalizeChunk(chunk)) controller.enqueue(event);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
