import { AiProviderError, classifyProviderHttpError } from "@/lib/ai/errors";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import { buildOpenAiResponsesInput } from "@/lib/ai/providers/message-format";
import type { AiModelDefinition, AiProviderDefinition, AiProviderInputMessage, AiProviderToolDefinition } from "@/lib/ai/types";

type NativeOpenAiEvent = {
  type?: string;
  delta?: string;
  item_id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  code?: string;
  output_index?: number;
  item?: {
    id?: string;
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    encrypted_content?: string;
  };
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

function normalizeNativeEvent(event: NativeOpenAiEvent, toolCallIds: Map<string, string>): AiProviderEvent[] {
  if ((event.type === "response.output_item.added" || event.type === "response.output_item.done") && event.item?.type === "function_call") {
    if (event.item.id && event.item.call_id) toolCallIds.set(event.item.id, event.item.call_id);
    return [];
  }
  if (event.type === "response.output_item.done" && event.item?.type === "reasoning") {
    if (typeof event.output_index !== "number" || !event.item.id || !event.item.encrypted_content) return [];
    return [{
      type: "CONTINUATION_STATE_ITEM",
      item: {
        type: "reasoning",
        outputIndex: event.output_index,
        id: event.item.id,
        encryptedContent: event.item.encrypted_content,
      },
    }];
  }
  if (event.type === "response.output_text.delta" && event.delta) return [{ type: "TEXT_DELTA", text: event.delta }];
  if (event.type === "response.function_call_arguments.delta") {
    const id = event.item_id ? toolCallIds.get(event.item_id) || event.item_id : event.call_id;
    return [{ type: "TOOL_CALL_DELTA", id, argumentsDelta: event.delta }];
  }
  if (event.type === "response.function_call_arguments.done") {
    const id = event.item_id ? toolCallIds.get(event.item_id) || event.item_id : event.call_id;
    const events: AiProviderEvent[] = [{ type: "TOOL_CALL_COMPLETED", id, name: event.name, arguments: parseToolArguments(event.arguments) }];
    if (id && event.name && typeof event.arguments === "string" && typeof event.output_index === "number") {
      events.push({
        type: "CONTINUATION_STATE_ITEM",
        item: {
          type: "function_call",
          outputIndex: event.output_index,
          itemId: event.item_id,
          callId: id,
          name: event.name,
          arguments: event.arguments,
        },
      });
    }
    return events;
  }
  if (event.type === "error" || event.type === "response.failed") return [{ type: "ERROR", reasonCode: "UNKNOWN_PROVIDER_ERROR" }];
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

async function readProviderErrorFingerprint(response: Response) {
  try {
    const text = (await response.text()).slice(0, 8_000);
    const parsed = JSON.parse(text) as { error?: { type?: unknown; code?: unknown } };
    const type = typeof parsed.error?.type === "string" ? parsed.error.type : null;
    const code = typeof parsed.error?.code === "string" ? parsed.error.code : null;
    return [type, code].filter(Boolean).join(":").slice(0, 120);
  } catch {
    return "";
  }
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
  messages: AiProviderInputMessage[];
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
        input: buildOpenAiResponsesInput(messages),
        ...(tools?.length ? {
          tools: tools.map((tool) => ({ type: "function", name: tool.code, description: tool.description, parameters: tool.inputSchema, strict: true })),
          tool_choice: "auto",
        } : {}),
        ...(model.capabilities.reasoning ? { include: ["reasoning.encrypted_content"] } : {}),
        stream: true,
        store: false,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
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

  if (!response.ok) {
    const classified = classifyProviderHttpError(response.status);
    const fingerprint = await readProviderErrorFingerprint(response);
    throw new AiProviderError({
      ...classified,
      message: `${provider.code} response ${response.status}${fingerprint ? ` (${fingerprint})` : ""}`,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }
  if (!response.body) {
    throw new AiProviderError({
      reasonCode: "UNKNOWN_PROVIDER_ERROR",
      message: `${provider.code} response body missing`,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }

  const source = response.body;
  const decoder = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let cancelled = false;

  const emitBlock = (controller: ReadableStreamDefaultController<AiProviderEvent>, block: string, toolCallIds: Map<string, string>) => {
    const nativeEvent = parseSseBlock(block);
    if (!nativeEvent) return;
    for (const event of normalizeNativeEvent(nativeEvent, toolCallIds)) controller.enqueue(event);
  };

  return new ReadableStream<AiProviderEvent>({
    async start(controller) {
      reader = source.getReader();
      const toolCallIds = new Map<string, string>();
      let buffer = "";
      try {
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) emitBlock(controller, block, toolCallIds);
        }
        buffer += decoder.decode();
        if (!cancelled && buffer.trim()) emitBlock(controller, buffer, toolCallIds);
        if (!cancelled) controller.close();
      } catch (error) {
        if (!cancelled) {
          controller.error(error instanceof AiProviderError ? error : new AiProviderError({
            reasonCode: "STREAM_INTERRUPTED",
            message: "AI provider stream interrupted",
            retryable: !signal?.aborted,
            statusCode: signal?.aborted ? 499 : 502,
            providerCode: provider.code,
            modelCode: model.code,
          }));
        }
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
