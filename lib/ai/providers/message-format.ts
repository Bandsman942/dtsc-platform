import { AiProviderError } from "@/lib/ai/errors";
import { toOpenAiResponsesContinuationInput } from "@/lib/ai/provider-continuation";
import type { AiProviderInputMessage } from "@/lib/ai/types";

function serializeToolArguments(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function validatedOpenAiContinuation(message: Extract<AiProviderInputMessage, { role: "assistant" }> & { toolCalls: NonNullable<Extract<AiProviderInputMessage, { role: "assistant" }>["toolCalls"]> }) {
  const state = message.providerContinuation;
  if (!state) return null;
  if (state.protocol !== "OPENAI_RESPONSES") {
    throw new AiProviderError({ reasonCode: "PROVIDER_PROTOCOL_INVALID", message: "Unsupported provider continuation protocol" });
  }
  const expectedCallIds = message.toolCalls.map((toolCall) => toolCall.id);
  const continuationCallIds = state.items.filter((item) => item.type === "function_call").map((item) => item.callId);
  if (expectedCallIds.length !== continuationCallIds.length || expectedCallIds.some((id, index) => id !== continuationCallIds[index])) {
    throw new AiProviderError({ reasonCode: "PROVIDER_PROTOCOL_INVALID", message: "Provider continuation tool call identity mismatch" });
  }
  return toOpenAiResponsesContinuationInput(state);
}

export function buildOpenAiResponsesInput(messages: AiProviderInputMessage[]) {
  const input: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId,
        output: message.content,
      });
      continue;
    }
    if (message.role === "assistant" && "toolCalls" in message && message.toolCalls?.length) {
      if (message.content.trim()) input.push({ role: "assistant", content: message.content });
      const continuation = validatedOpenAiContinuation(message);
      if (continuation) {
        input.push(...continuation);
      } else {
        for (const toolCall of message.toolCalls) {
          input.push({
            type: "function_call",
            call_id: toolCall.id,
            name: toolCall.name,
            arguments: serializeToolArguments(toolCall.arguments),
          });
        }
      }
      continue;
    }
    input.push({ role: message.role, content: message.content });
  }
  return input;
}

export function buildChatCompletionsMessages(messages: AiProviderInputMessage[], instructions: string) {
  const output: Array<Record<string, unknown>> = [{ role: "system", content: instructions }];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      output.push({ role: "tool", tool_call_id: message.toolCallId, content: message.content });
      continue;
    }
    if (message.role === "assistant" && "toolCalls" in message && message.toolCalls?.length) {
      output.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: { name: toolCall.name, arguments: serializeToolArguments(toolCall.arguments) },
        })),
      });
      continue;
    }
    output.push({ role: message.role, content: message.content });
  }
  return output;
}
