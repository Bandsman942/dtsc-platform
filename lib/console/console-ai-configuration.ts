import "server-only";
import { getAiModelCatalog, getAiProviderCatalog } from "@/lib/ai/catalog";
import { getAiPlatformPolicy, type AiPlatformPolicy } from "@/lib/ai/platform-runtime-policy";
import { SERVER_LIMITS } from "@/lib/ai/agent/policy";
import { SAAS_PLAN_CODES, getSaasPlanLabel } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

export type ConsoleAiConfiguration = {
  providers: Array<{ code: string; status: string; protocol: string; credentialConfigured: boolean; modelCount: number }>;
  models: Array<{ code: string; providerCode: string; profileCodes: string[]; status: string; contexts: string[]; minimumPlan: string | null; costKnown: boolean; credentialConfigured: boolean }>;
  agentBudgets: Array<{ planCode: string; labelFr: string; labelEn: string; maxSteps: number; maxToolCalls: number; maxTokens: number; maxEstimatedCost: number; maxDurationMs: number; allowedToolModes: string[] }>;
  commercialOffers: Array<{ name: string; audience: string; dailyMessageLimit: number; dailyTokenLimit: number; maxDocuments: number }> | null;
  policy: AiPlatformPolicy;
  source: { models: "AI_MODEL_CATALOG"; agent: "SERVER_LIMITS"; offers: "BillingPlan" };
};

/**
 * Only certified catalog metadata, boolean secret-presence and commercial
 * plan limits. No secrets, customer identity or private tenant records.
 * This is a read projection, NOT an alternate source of AI entitlements.
 */
export async function getConsoleAiConfiguration(): Promise<ConsoleAiConfiguration> {
  const providers = getAiProviderCatalog();
  const models = getAiModelCatalog();
  const configured = new Set(providers.filter((p) => Boolean(process.env[p.apiKeyEnv]?.trim())).map((p) => p.code));
  const policy = await getAiPlatformPolicy();
  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, audience: true, dailyMessageLimit: true, dailyTokenLimit: true, maxDocuments: true },
    take: 100,
  }).catch(() => null);

  return {
    policy,
    providers: providers.map((p) => ({
      code: p.code,
      status: p.status,
      protocol: p.protocol,
      credentialConfigured: configured.has(p.code),
      modelCount: models.filter((m) => m.providerCode === p.code).length,
    })),
    models: models.map((m) => ({
      code: m.code,
      providerCode: m.providerCode,
      status: m.status,
      profileCodes: m.profileCodes || [],
      contexts: m.allowedContexts,
      minimumPlan: m.minimumPlan || null,
      costKnown: m.costProfile?.inputPerMillion != null && m.costProfile?.outputPerMillion != null,
      credentialConfigured: configured.has(m.providerCode),
    })),
    agentBudgets: SAAS_PLAN_CODES.map((code) => ({
      planCode: code,
      labelFr: getSaasPlanLabel(code, "fr"),
      labelEn: getSaasPlanLabel(code, "en"),
      maxSteps: SERVER_LIMITS[code].maxSteps,
      maxToolCalls: SERVER_LIMITS[code].maxToolCalls,
      maxTokens: SERVER_LIMITS[code].maxTokens,
      maxEstimatedCost: SERVER_LIMITS[code].maxEstimatedCost,
      maxDurationMs: SERVER_LIMITS[code].maxDurationMs,
      allowedToolModes: SERVER_LIMITS[code].allowedToolModes,
    })),
    commercialOffers: plans,
    source: { models: "AI_MODEL_CATALOG", agent: "SERVER_LIMITS", offers: "BillingPlan" },
  };
}
