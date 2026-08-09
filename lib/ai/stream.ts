import type { AiProviderEvent } from "@/lib/ai/provider-events";

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
  source: ReadableStream<AiProviderEvent>;
  signal?: AbortSignal;
  interruptedMessage: string;
  onCompleted: (result: AiStreamConsumption) => Promise<void>;
  onInterrupted: (result: AiStreamConsumption) => Promise<void>;
  onFailed: (error: unknown, result: AiStreamConsumption) => Promise<void>;
};

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
  const startedAt = Date.now();
  let reader: ReadableStreamDefaultReader<AiProviderEvent> | null = null;
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

      let content = "";
      let firstTokenAt: number | null = null;
      let usage: AiStreamUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 };
      let readError: unknown = null;

      try {
        while (!interruptionRequested && !consumerCancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.type === "TEXT_DELTA") {
            if (!firstTokenAt) firstTokenAt = Date.now();
            content += value.text;
            if (!consumerCancelled) controller.enqueue(encoder.encode(value.text));
          } else if (value.type === "USAGE") {
            usage = {
              inputTokens: value.inputTokens,
              outputTokens: value.outputTokens,
              totalTokens: value.totalTokens,
              cachedInputTokens: value.cachedInputTokens,
            };
          } else if (value.type === "ERROR") {
            readError = new Error(value.reasonCode);
            break;
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
            // Consumer may already be closed.
          }
        }
      } finally {
        signal?.removeEventListener("abort", requestInterruption);
        if (!consumerCancelled) {
          try {
            controller.close();
          } catch {
            // Concurrent client cancellation may already have closed the controller.
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
