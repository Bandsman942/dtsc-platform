export const MAX_AI_PROVIDER_CONTINUATION_ITEMS = 24;
export const MAX_AI_REASONING_ENCRYPTED_CHARS = 256_000;
export const MAX_AI_PROVIDER_CONTINUATION_CHARS = 512_000;

export type AiOpenAiResponsesContinuationItem =
  | {
      type: "reasoning";
      outputIndex: number;
      id: string;
      encryptedContent: string;
    }
  | {
      type: "function_call";
      outputIndex: number;
      itemId?: string;
      callId: string;
      name: string;
      arguments: string;
    };

export type AiProviderContinuationState = {
  protocol: "OPENAI_RESPONSES";
  items: AiOpenAiResponsesContinuationItem[];
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function finiteIndex(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function sanitizeOpenAiResponsesContinuationItem(value: unknown): AiOpenAiResponsesContinuationItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const outputIndex = finiteIndex(record.outputIndex);
  if (outputIndex === null) return null;

  if (record.type === "reasoning") {
    const id = nonEmptyString(record.id);
    const encryptedContent = nonEmptyString(record.encryptedContent);
    if (!id || !encryptedContent || encryptedContent.length > MAX_AI_REASONING_ENCRYPTED_CHARS) return null;
    return { type: "reasoning", outputIndex, id, encryptedContent };
  }

  if (record.type === "function_call") {
    const callId = nonEmptyString(record.callId);
    const name = nonEmptyString(record.name);
    const args = typeof record.arguments === "string" ? record.arguments : null;
    const itemId = nonEmptyString(record.itemId) || undefined;
    if (!callId || !name || args === null) return null;
    return { type: "function_call", outputIndex, itemId, callId, name, arguments: args };
  }

  return null;
}

export function createAiProviderContinuationState(items: AiOpenAiResponsesContinuationItem[]): AiProviderContinuationState | null {
  if (!items.length || items.length > MAX_AI_PROVIDER_CONTINUATION_ITEMS) return null;
  const sanitized = items
    .map((item) => sanitizeOpenAiResponsesContinuationItem(item))
    .filter((item): item is AiOpenAiResponsesContinuationItem => Boolean(item))
    .sort((left, right) => left.outputIndex - right.outputIndex);
  if (sanitized.length !== items.length) return null;
  const totalChars = sanitized.reduce((sum, item) => {
    if (item.type === "reasoning") return sum + item.encryptedContent.length;
    return sum + item.callId.length + item.name.length + item.arguments.length + (item.itemId?.length || 0);
  }, 0);
  if (totalChars > MAX_AI_PROVIDER_CONTINUATION_CHARS) return null;
  return { protocol: "OPENAI_RESPONSES", items: sanitized };
}

export function parseAiProviderContinuationState(value: unknown): AiProviderContinuationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.protocol !== "OPENAI_RESPONSES" || !Array.isArray(record.items)) return null;
  return createAiProviderContinuationState(record.items as AiOpenAiResponsesContinuationItem[]);
}

export function toOpenAiResponsesContinuationInput(state: AiProviderContinuationState) {
  return state.items.map((item) => {
    if (item.type === "reasoning") {
      return {
        type: "reasoning",
        id: item.id,
        encrypted_content: item.encryptedContent,
        summary: [],
      };
    }
    return {
      type: "function_call",
      ...(item.itemId ? { id: item.itemId } : {}),
      call_id: item.callId,
      name: item.name,
      arguments: item.arguments,
    };
  });
}
