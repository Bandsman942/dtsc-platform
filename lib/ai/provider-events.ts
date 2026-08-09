import type { AiProviderErrorCode } from "@/lib/ai/types";

export type AiProviderEvent =
  | { type: "TEXT_DELTA"; text: string }
  | { type: "TOOL_CALL_DELTA"; id?: string; name?: string; argumentsDelta?: string }
  | { type: "TOOL_CALL_COMPLETED"; id?: string; name?: string; arguments?: unknown }
  | { type: "USAGE"; inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number }
  | { type: "COMPLETED" }
  | { type: "ERROR"; reasonCode: AiProviderErrorCode };
