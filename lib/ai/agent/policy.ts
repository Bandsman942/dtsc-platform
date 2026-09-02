import type { SaasPlanCode } from "@/lib/billing/plans";
import type { AiDataClassification } from "@/lib/ai/types";
import type { AiToolMode } from "@/lib/ai/tool-registry";
import { containsSensitiveAgentDomain, type AiAgentBudget, type AiAgentBudgetRequest } from "@/lib/ai/agent/types";

export const SERVER_LIMITS: Record<SaasPlanCode, AiAgentBudget> = {
  STARTER: {
    maxSteps: 4,
    maxToolCalls: 3,
    maxTokens: 8_000,
    maxEstimatedCost: 0.15,
    maxDurationMs: 25_000,
    allowedToolModes: ["READ", "PREPARE"],
  },
  BUSINESS: {
    maxSteps: 10,
    maxToolCalls: 10,
    maxTokens: 32_000,
    maxEstimatedCost: 1,
    maxDurationMs: 45_000,
    allowedToolModes: ["READ", "PREPARE", "MUTATE"],
  },
  ENTERPRISE: {
    maxSteps: 18,
    maxToolCalls: 20,
    maxTokens: 64_000,
    maxEstimatedCost: 4,
    maxDurationMs: 55_000,
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
  const requestedSet = requested === undefined ? null : new Set(requested);
  return allowed.filter((mode) => !requestedSet || requestedSet.has(mode));
}

export function resolveAiAgentBudget(input: { planCode: SaasPlanCode; requested?: AiAgentBudgetRequest | null; dataClassifications: AiDataClassification[] }) {
  const base = SERVER_LIMITS[input.planCode];
  const sensitive = containsSensitiveAgentDomain(input.dataClassifications);
  const serverModes = sensitive ? base.allowedToolModes.filter((mode) => mode === "READ" || mode === "PREPARE") : base.allowedToolModes;
  const requestedCodesSupplied = input.requested?.allowedToolCodes !== undefined;
  const allowedToolCodes = requestedCodesSupplied
    ? Array.from(new Set((input.requested?.allowedToolCodes || []).filter((code) => /^[A-Z0-9_]{3,120}$/.test(code)))).slice(0, 50)
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

export function isAgentBudgetExceeded(input: { budget: AiAgentBudget; currentStep: number; toolCallCount: number; totalTokens: number; estimatedCost: number; elapsedMs: number }) {
  if (input.currentStep >= input.budget.maxSteps) return "MAX_STEPS";
  if (input.totalTokens >= input.budget.maxTokens) return "MAX_TOKENS";
  if (input.estimatedCost >= input.budget.maxEstimatedCost) return "MAX_ESTIMATED_COST";
  if (input.elapsedMs >= input.budget.maxDurationMs) return "MAX_DURATION";
  return null;
}
