import type { AiDataClassification } from "@/lib/ai/types";
import type { AiToolMode } from "@/lib/ai/tool-registry";

export type AiAgentExecutionClass = "INTERACTIVE" | "DURABLE";
export type AiAgentScope = "GLOBAL_CHAT" | "ENTERPRISE_CHAT";
export type AiAgentRunStatus = "RUNNING" | "WAITING_CONFIRMATION" | "READY_TO_RESUME" | "COMPLETED" | "FAILED" | "CANCELLED" | "BUDGET_EXHAUSTED";

export type AiAgentBudget = {
  maxSteps: number;
  maxToolCalls: number;
  maxTokens: number;
  maxEstimatedCost: number;
  maxDurationMs: number;
  allowedToolModes: AiToolMode[];
  allowedToolCodes?: string[] | null;
};

export type AiAgentBudgetRequest = Partial<{
  maxSteps: number;
  maxToolCalls: number;
  maxTokens: number;
  maxEstimatedCost: number;
  maxDurationMs: number;
  allowedToolModes: AiToolMode[];
  allowedToolCodes: string[];
}>;

export type AiAgentUsage = { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number };
export type AiAgentToolCall = { id?: string; name?: string; arguments?: unknown };
export type AiAgentTurnResult = {
  content: string;
  toolCalls: AiAgentToolCall[];
  usage: AiAgentUsage & { cachedInputTokens: number };
  providerCode: string;
  modelCode: string;
  durationMs: number;
};
export type AiAgentCompletion = {
  runId: string;
  status: AiAgentRunStatus;
  content: string;
  reasonCode?: string | null;
  pendingConfirmationId?: string | null;
  providerCode?: string | null;
  modelCode?: string | null;
  usage: AiAgentUsage;
};

export function containsSensitiveAgentDomain(classifications: AiDataClassification[]) {
  return classifications.some((classification) =>
    ["RESTRICTED", "HEALTH_SENSITIVE", "HR_SENSITIVE", "FINANCIAL_SENSITIVE", "LEGAL_SENSITIVE", "SECRET"].includes(classification)
  );
}
