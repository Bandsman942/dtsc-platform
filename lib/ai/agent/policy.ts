import type { SaasPlanCode } from "@/lib/billing/plans";
import type { AiDataClassification } from "@/lib/ai/types";
import type { AiToolMode } from "@/lib/ai/tool-registry";
import { containsSensitiveAgentDomain, type AiAgentBudget, type AiAgentBudgetRequest } from "@/lib/ai/agent/types";

const SERVER_LIMITS: Record<SaasPlanCode, AiAgentBudget> = {
  STARTER: {
    maxSteps: 3,
    maxToolCalls: 2,
    maxTokens: 4_000,
    maxEstimatedCost: 0.1,
    maxDurationMs: 20_000,
    allowedToolModes: ["READ", "PREPARE"],
  },
  BUSINESS: {
    maxSteps: 6,
    maxToolCalls: 4,
    maxTokens: 12_000,
    maxEstimatedCost: 0.5,
    maxDurationMs: 45_000,
    allowedToolModes: ["READ", "PREPARE", "MUTATE"],
  },
  ENTERPRISE: {
    maxSteps: 8,
    maxToolCalls: 6,
    maxTokens: 24_000,
    maxEstimatedCost: 2,
    maxDurationMs: 50_000,
    allowedToolModes: ["READ", "PREPARE", "MUTATE"],
  },
};

function clampInteger(requested: number | undefined, ceiling: number, minimum = 1) {
  if (!Number.isFinite(requested)) return ceiling;
  return Math.max(minimum, Math.min(Math.floor(requested as number), ceiling));
}

function clampNumber(requested: number | undefined, ceiling: number, minimum = 0.000001) {
  if (!Number.isFinite(requested)) return ceiling;
  return Math.max(minimum, Math.min(requested as number, ceiling));
}

function intersectModes(requested: AiToolMode[] | undefined, allowed: AiToolMode[]) {
  const requestedSet = requested?.length ? new Set(requested) : null;
  return allowed.filter((mode) => !requestedSet || requestedSet.has(mode));
}

export function resolveAiAgentBudget(input: {
  planCode: SaasPlanCode;
  requested?: AiAgentBudgetRequest | null;
  dataClassifications: AiDataClassification[];
}) {
  const base = SERVER_LIMITS[input.planCode];
  const sensitive = containsSensitiveAgentDomain(input.dataClassifications);
  const serverModes = sensitive ? base.allowedToolModes.filter((mode) => mode === "READ" || mode === "PREPARE") : base.allowedToolModes;
  const allowedToolCodes = input.requested?.allowedToolCodes?.length
    ? Array.from(new Set(input.requested.allowedToolCodes.filter((code) => /^[A-Z0-9_]{3,120}$/.test(code)))).slice(0, 50)
    : null;

  return {
    maxSteps: clampInteger(input.requested?.maxSteps, base.maxSteps),
    maxToolCalls: clampInteger(input.requested?.maxToolCalls, base.maxToolCalls, 0),
    maxTokens: clampInteger(input.requested?.maxTokens, base.maxTokens),
    maxEstimatedCost: clampNumber(input.requested?.maxEstimatedCost, base.maxEstimatedCost),
    maxDurationMs: clampInteger(input.requested?.maxDurationMs, base.maxDurationMs, 1_000),
    allowedToolModes: intersectModes(input.requested?.allowedToolModes, serverModes),
    allowedToolCodes,
  } satisfies AiAgentBudget;
}

export function isAgentBudgetExceeded(input: {
  budget: AiAgentBudget;
  currentStep: number;
  toolCallCount: number;
  totalTokens: number;
  estimatedCost: number;
  elapsedMs: number;
}) {
  if (input.currentStep >= input.budget.maxSteps) return "MAX_STEPS";
  if (input.toolCallCount >= input.budget.maxToolCalls) return "MAX_TOOL_CALLS";
  if (input.totalTokens >= input.budget.maxTokens) return "MAX_TOKENS";
  if (input.estimatedCost >= input.budget.maxEstimatedCost) return "MAX_ESTIMATED_COST";
  if (input.elapsedMs >= input.budget.maxDurationMs) return "MAX_DURATION";
  return null;
}
