import { AiProviderError, classifyProviderHttpError } from "@/lib/ai/errors";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import type { AiModelDefinition, AiProviderDefinition, AiProviderToolDefinition } from "@/lib/ai/types";
import type { OpenAIInputMessage } from "@/lib/openai";

type NativeOpenAiEvent = {
  type?: string;
  delta?: string;
  item_id?: string;
  name?: string;
  arguments?: string;
  code?: string;
  response?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
};

function parseSseBlock(block: string): NativeOpenAiEvent | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("");
  if (!data || data === "[DONE]") return null;
  return JSON.parse(data) as NativeOpenAiEvent;
}

function parseToolArguments(value?: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeNativeEvent(event: NativeOpenAiEvent): AiProviderEvent[] {
  if (event.type === "response.output_text.delta" && event.delta) return [{ type: "TEXT_DELTA", text: event.delta }];
  if (event.type === "response.function_call_arguments.delta") {
    return [{ type: "TOOL_CALL_DELTA", id: event.item_id, argumentsDelta: event.delta }];
  }
  if (event.type === "response.function_call_arguments.done") {
    return [{ type: "TOOL_CALL_COMPLETED", id: event.item_id, name: event.name, arguments: parseToolArguments(event.arguments) }];
  }
  if (event.type === "error") return [{ type: "ERROR", reasonCode: "UNKNOWN_PROVIDER_ERROR" }];
  if (event.type === "response.completed") {
    const usage = event.response?.usage;
    const events: AiProviderEvent[] = [];
    if (usage) {
      events.push({
        type: "USAGE",
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
        cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
      });
    }
    events.push({ type: "COMPLETED" });
    return events;
  }
  return [];
}

export async function createOpenAiResponsesEventStream({
  provider,
  model,
  messages,
  instructions,
  tools,
  signal,
}: {
  provider: AiProviderDefinition;
  model: AiModelDefinition;
  messages: OpenAIInputMessage[];
  instructions: string;
  tools?: AiProviderToolDefinition[];
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

  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.providerModelId,
        instructions,
        input: messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role, content: message.content })),
        ...(tools?.length ? {
          tools: tools.map((tool) => ({ type: "function", name: tool.code, description: tool.description, parameters: tool.inputSchema, strict: true })),
          tool_choice: "auto",
        } : {}),
        stream: true,
        store: false,
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
    throw new AiProviderError({ ...classified, message: `${provider.code} response ${response.status}`, providerCode: provider.code, modelCode: model.code });
  }

  const source = response.body;
  const decoder = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let cancelled = false;

  const emitBlock = (controller: ReadableStreamDefaultController<AiProviderEvent>, block: string) => {
    const nativeEvent = parseSseBlock(block);
    if (!nativeEvent) return;
    for (const event of normalizeNativeEvent(nativeEvent)) controller.enqueue(event);
  };

  return new ReadableStream<AiProviderEvent>({
    async start(controller) {
      reader = source.getReader();
      let buffer = "";
      try {
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) emitBlock(controller, block);
        }
        buffer += decoder.decode();
        if (!cancelled && buffer.trim()) emitBlock(controller, buffer);
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
