import { AiProviderError, classifyProviderHttpError } from "@/lib/ai/errors";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import type { AiModelDefinition, AiProviderDefinition, AiRoutingConstraints } from "@/lib/ai/types";
import { env } from "@/lib/env";
import type { OpenAIInputMessage } from "@/lib/openai";

type OpenRouterToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type OpenRouterChunk = {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: OpenRouterToolCallDelta[] };
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

type ToolCallAccumulator = {
  id?: string;
  name?: string;
  argumentsText: string;
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

function parseToolArguments(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function buildProviderRouting(routingConstraints?: AiRoutingConstraints) {
  const routing: Record<string, unknown> = {
    allow_fallbacks: false,
    data_collection: "deny",
    // AI02 established ZDR as the minimum DTSC OpenRouter baseline. AI03 may
    // tighten provider routing, but it may never turn this protection off.
    zdr: true,
  };
  if (routingConstraints?.requireZeroDataRetention) routing.zdr = true;
  if (routingConstraints?.providerSortPreference) routing.sort = routingConstraints.providerSortPreference;

  const maxPrice: Record<string, number> = {};
  if (
    typeof routingConstraints?.maximumProviderPromptPricePerMillion === "number" &&
    routingConstraints.maximumProviderPromptPricePerMillion >= 0
  ) {
    maxPrice.prompt = routingConstraints.maximumProviderPromptPricePerMillion;
  }
  if (
    typeof routingConstraints?.maximumProviderCompletionPricePerMillion === "number" &&
    routingConstraints.maximumProviderCompletionPricePerMillion >= 0
  ) {
    maxPrice.completion = routingConstraints.maximumProviderCompletionPricePerMillion;
  }
  if (Object.keys(maxPrice).length) routing.max_price = maxPrice;
  return routing;
}

function normalizeChunk(chunk: OpenRouterChunk, toolCalls: Map<number, ToolCallAccumulator>): AiProviderEvent[] {
  if (chunk.error) return [classifyOpenRouterStreamError(chunk)];
  const events: AiProviderEvent[] = [];
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content;
  if (content) events.push({ type: "TEXT_DELTA", text: content });

  for (const toolCall of choice?.delta?.tool_calls || []) {
    const index = toolCall.index ?? 0;
    const current = toolCalls.get(index) || { argumentsText: "" };
    if (toolCall.id) current.id = toolCall.id;
    if (toolCall.function?.name) current.name = toolCall.function.name;
    if (toolCall.function?.arguments) current.argumentsText += toolCall.function.arguments;
    toolCalls.set(index, current);
    events.push({
      type: "TOOL_CALL_DELTA",
      id: toolCall.id || current.id,
      name: toolCall.function?.name || current.name,
      argumentsDelta: toolCall.function?.arguments,
    });
  }

  if (choice?.finish_reason === "tool_calls") {
    for (const [index, toolCall] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
      events.push({
        type: "TOOL_CALL_COMPLETED",
        id: toolCall.id || `tool-${index}`,
        name: toolCall.name,
        arguments: parseToolArguments(toolCall.argumentsText),
      });
    }
    toolCalls.clear();
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
  routingConstraints,
  signal,
}: {
  provider: AiProviderDefinition;
  model: AiModelDefinition;
  messages: OpenAIInputMessage[];
  instructions: string;
  routingConstraints?: AiRoutingConstraints;
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
          ...messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role, content: message.content })),
        ],
        stream: true,
        stream_options: { include_usage: true },
        provider: buildProviderRouting(routingConstraints),
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
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let cancelled = false;

  return new ReadableStream<AiProviderEvent>({
    async start(controller) {
      reader = source.getReader();
      const toolCalls = new Map<number, ToolCallAccumulator>();
      let buffer = "";
      try {
        while (!cancelled) {
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
            for (const event of normalizeChunk(chunk, toolCalls)) controller.enqueue(event);
          }
        }
        buffer += decoder.decode();
        if (!cancelled && buffer.trim()) {
          const data = parseDataLine(buffer);
          if (data && data !== "[DONE]") {
            const chunk = JSON.parse(data) as OpenRouterChunk;
            for (const event of normalizeChunk(chunk, toolCalls)) controller.enqueue(event);
          } else if (data === "[DONE]") {
            controller.enqueue({ type: "COMPLETED" });
          }
        }
        if (!cancelled) controller.close();
      } catch (error) {
        if (!cancelled) controller.error(error);
      } finally {
        reader?.releaseLock();
        reader = null;
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader?.cancel(reason).catch(() => undefined);
    },
  });
}