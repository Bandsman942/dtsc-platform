import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const ceiling = z.object({
  maxSteps: z.number().int().min(1).optional(),
  maxToolCalls: z.number().int().min(0).optional(),
  maxTokens: z.number().int().min(1).optional(),
  maxEstimatedCost: z.number().positive().finite().optional(),
  maxDurationMs: z.number().int().min(1000).optional(),
}).strict();

export const DEFAULT_AI_ASSISTANT_SETTINGS = {
  generalKnowledgeEnabled: true,
  generalGuidance: "",
  enterpriseGuidance: "",
  landingGuidance: "",
  landingModelCodes: [] as string[],
  agentMaxReadToolsPerRun: 6,
};

export const aiAssistantSettingsSchema = z.object({
  generalKnowledgeEnabled: z.boolean(),
  generalGuidance: z.string().trim().max(800),
  enterpriseGuidance: z.string().trim().max(800),
  landingGuidance: z.string().trim().max(800),
  landingModelCodes: z.array(z.string().regex(/^[A-Za-z0-9_./:-]{2,120}$/)).max(5).refine((items) => new Set(items).size === items.length, "Duplicate model"),
  agentMaxReadToolsPerRun: z.number().int().min(1).max(8),
}).strict();

export const agentCeilingsSchema = z.object({
  STARTER: ceiling.optional(),
  BUSINESS: ceiling.optional(),
  ENTERPRISE: ceiling.optional(),
}).strict();

// Provider codes are uppercase, while model codes include lower-case letters,
// hyphens and sometimes provider/model separators (OpenRouter).
const codes = z.array(z.string().regex(/^[A-Za-z0-9_./:-]{2,120}$/)).max(100).superRefine((arr,ctx) => {
  if (new Set(arr).size !== arr.length) ctx.addIssue({ code: "custom", message: "Duplicate code" });
});

export const aiPlatformPolicyInputSchema = z.object({
  expectedRevision: z.number().int().min(0),
  disabledProviderCodes: codes,
  disabledModelCodes: codes,
  agentCeilings: agentCeilingsSchema,
  assistantSettings: aiAssistantSettingsSchema.optional(),
  reason: z.string().trim().min(8).max(500),
}).strict();

export type AiPlatformPolicy = {
  revision: number;
  disabledProviderCodes: string[];
  disabledModelCodes: string[];
  agentCeilings: z.infer<typeof agentCeilingsSchema>;
  assistantSettings: z.infer<typeof aiAssistantSettingsSchema>;
};

/**
 * The runtime policy is restrictive only. It cannot increase plan benefits,
 * bypass model data policy or broaden Agent modes. Missing row means default
 * server policy. DB errors propagate to prevent accidental re-enabling of a
 * previously disabled provider or model during a control-plane incident.
 */
export async function getAiPlatformPolicy(): Promise<AiPlatformPolicy> {
  const row = await prisma.aiPlatformRuntimePolicy.findUnique({ where: { id: "global" } });
  if (!row) return { revision: 0, disabledProviderCodes: [], disabledModelCodes: [], agentCeilings: {}, assistantSettings: DEFAULT_AI_ASSISTANT_SETTINGS };
  return {
    revision: row.revision,
    disabledProviderCodes: codes.parse(row.disabledProviderCodes),
    disabledModelCodes: codes.parse(row.disabledModelCodes),
    agentCeilings: agentCeilingsSchema.parse(row.agentCeilings),
    assistantSettings: aiAssistantSettingsSchema.parse({ ...DEFAULT_AI_ASSISTANT_SETTINGS, ...(row.assistantSettings && typeof row.assistantSettings === "object" && !Array.isArray(row.assistantSettings) ? row.assistantSettings : {}) }),
  };
}

export function isPlatformAllowedAiModel(model: { code: string; providerCode: string }, policy: AiPlatformPolicy): boolean {
  return !policy.disabledModelCodes.includes(model.code) && !policy.disabledProviderCodes.includes(model.providerCode);
}

export function filterPlatformAllowedAiModels<T extends { id: string; providerCode: string }>(models: T[], policy: AiPlatformPolicy): T[] {
  return models.filter((model) => isPlatformAllowedAiModel({ code: model.id, providerCode: model.providerCode }, policy));
}
