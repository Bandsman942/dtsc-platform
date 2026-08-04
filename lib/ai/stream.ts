export type AiStreamUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
};

export type AiStreamConsumption = {
  content: string;
  usage: AiStreamUsage;
  firstTokenLatencyMs: number | null;
  durationMs: number;
};

type StreamCallbacks = {
  source: ReadableStream<Uint8Array>;
  signal?: AbortSignal;
  interruptedMessage: string;
  onCompleted: (result: AiStreamConsumption) => Promise<void>;
  onInterrupted: (result: AiStreamConsumption) => Promise<void>;
  onFailed: (error: unknown, result: AiStreamConsumption) => Promise<void>;
};

type ProviderEvent = {
  type?: string;
  delta?: string;
  response?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
};

function parseProviderEvent(block: string): ProviderEvent | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("");
  if (!data || data === "[DONE]") return null;
  return JSON.parse(data) as ProviderEvent;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createAuditedAiTextStream({
  source,
  signal,
  interruptedMessage,
  onCompleted,
  onInterrupted,
  onFailed,
}: StreamCallbacks) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let consumerCancelled = false;
  let interruptionRequested = signal?.aborted || false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = source.getReader();
      const requestInterruption = () => {
        interruptionRequested = true;
        void reader?.cancel("CLIENT_INTERRUPTED").catch(() => undefined);
      };
      signal?.addEventListener("abort", requestInterruption, { once: true });

      let buffer = "";
      let content = "";
      let firstTokenAt: number | null = null;
      let usage: AiStreamUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 };
      let readError: unknown = null;

      try {
        while (!interruptionRequested && !consumerCancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const event = parseProviderEvent(block);
            if (!event) continue;
            if (event.type === "response.output_text.delta" && event.delta) {
              if (!firstTokenAt) firstTokenAt = Date.now();
              content += event.delta;
              if (!consumerCancelled) controller.enqueue(encoder.encode(event.delta));
            }
            if (event.type === "response.completed" && event.response?.usage) {
              usage = {
                inputTokens: event.response.usage.input_tokens ?? 0,
                outputTokens: event.response.usage.output_tokens ?? 0,
                totalTokens: event.response.usage.total_tokens ?? 0,
                cachedInputTokens: event.response.usage.input_tokens_details?.cached_tokens ?? 0,
              };
            }
          }
        }
      } catch (error) {
        readError = error;
        if (isAbortError(error)) interruptionRequested = true;
      }

      const result: AiStreamConsumption = {
        content,
        usage,
        firstTokenLatencyMs: firstTokenAt ? firstTokenAt - startedAt : null,
        durationMs: Date.now() - startedAt,
      };

      try {
        if (interruptionRequested || consumerCancelled) {
          await onInterrupted(result);
        } else if (readError) {
          await onFailed(readError, result);
          if (!consumerCancelled) controller.enqueue(encoder.encode(`\n\n${interruptedMessage}`));
        } else {
          await onCompleted(result);
        }
      } catch (callbackError) {
        await onFailed(callbackError, result).catch(() => undefined);
        if (!consumerCancelled) {
          try {
            controller.enqueue(encoder.encode(`\n\n${interruptedMessage}`));
          } catch {
            // The consumer may already have closed the stream.
          }
        }
      } finally {
        signal?.removeEventListener("abort", requestInterruption);
        if (!consumerCancelled) {
          try {
            controller.close();
          } catch {
            // A concurrent client cancellation already closed the controller.
          }
        }
      }
    },
    async cancel(reason) {
      consumerCancelled = true;
      interruptionRequested = true;
      await reader?.cancel(reason).catch(() => undefined);
    },
  });
}
