import type { AiProviderInputMessage } from "@/lib/ai/types";

function serializeToolArguments(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
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
      for (const toolCall of message.toolCalls) {
        input.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.name,
          arguments: serializeToolArguments(toolCall.arguments),
        });
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
