import type { AiExecutionContext } from "@/lib/ai/context-engine";
import { getCanonicalAiUsageLimits } from "@/lib/billing/ai-usage-limits";
import { formatPublishedBillingCatalogForAi, getPublishedBillingCatalog } from "@/lib/billing/commercial-catalog";

export type AiCagPack = {
  code: string;
  version: string;
  content: string;
  cacheKey: string;
  cacheHit: boolean;
};

export type AiCagBuilderDefinition = {
  code: string;
  version: string | ((context: AiExecutionContext) => string | Promise<string>);
  build: (context: AiExecutionContext) => Promise<string>;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: Omit<AiCagPack, "cacheHit"> }>();
const sectorBuilders = new Map<string, AiCagBuilderDefinition>();

export function registerSectorCagBuilder(sectorCode: string, builder: AiCagBuilderDefinition) {
  sectorBuilders.set(sectorCode, builder);
}

function keyFor(context: AiExecutionContext, code: string, version: string) {
  return [
    "cag",
    context.organization?.id || "personal",
    context.userId,
    context.profile.code,
    context.profile.version,
    code,
    version,
    context.contextVersion,
  ].join(":");
}

async function resolveBuilderVersion(builder: AiCagBuilderDefinition, context: AiExecutionContext) {
  return typeof builder.version === "function" ? await builder.version(context) : builder.version;
}

async function cached(context: AiExecutionContext, builder: AiCagBuilderDefinition): Promise<AiCagPack> {
  const version = await resolveBuilderVersion(builder, context);
  const key = keyFor(context, builder.code, version);
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return { ...existing.value, cacheHit: true };

  const content = await builder.build(context);
  const value = { code: builder.code, version, content, cacheKey: key };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return { ...value, cacheHit: false };
}

async function resolveCommercialCagContext(context: AiExecutionContext) {
  return getCanonicalAiUsageLimits({
    userId: context.userId,
    organizationId: context.organization?.id || null,
  });
}

const billingCatalogBuilder: AiCagBuilderDefinition = {
  code: "billing-catalog",
  version: "3",
  build: async () => formatPublishedBillingCatalogForAi(await getPublishedBillingCatalog()),
};

const organizationBuilder: AiCagBuilderDefinition = {
  code: "organization",
  version: async (context) => {
    const commercial = await resolveCommercialCagContext(context);
    return `3:${commercial.planId || "none"}:${commercial.subscriptionStatus}:${commercial.source}:${commercial.dailyMessageLimit}:${commercial.dailyTokenLimit}:${commercial.maxDocuments}`;
  },
  build: async (context) => {
    const commercial = await resolveCommercialCagContext(context);
    const quotaContext = `Offre commerciale: ${commercial.planName}. Niveau de capacité: ${commercial.capabilityLabel}. Statut d'abonnement: ${commercial.subscriptionStatus}. Quotas effectifs: ${commercial.dailyMessageLimit.toLocaleString("fr-FR")} messages IA/jour, ${commercial.dailyTokenLimit.toLocaleString("fr-FR")} tokens/jour et ${commercial.maxDocuments.toLocaleString("fr-FR")} sources de connaissance IA.`;
    if (!context.organization || !context.membership) {
      return `Contexte commercial personnel. ${quotaContext}`;
    }
    return `Organisation active: ${context.organization.name} (${context.organization.id}). Secteur: ${context.organization.sectorCode || "GENERAL"}. Rôle: ${context.membership.role}. ${quotaContext} Modules lisibles: ${context.activeModuleCodes.join(", ") || "aucun"}.`;
  },
};

export async function buildAiCagPack(context: AiExecutionContext): Promise<AiCagPack> {
  const packs = [await cached(context, billingCatalogBuilder), await cached(context, organizationBuilder)];
  const sectorBuilder = context.organization?.sectorCode ? sectorBuilders.get(context.organization.sectorCode) : null;
  if (sectorBuilder) packs.push(await cached(context, sectorBuilder));
  return {
    code: packs.map((pack) => pack.code).join("+"),
    version: packs.map((pack) => `${pack.code}@${pack.version}`).join("|"),
    content: packs.map((pack) => pack.content).filter(Boolean).join("\n\n"),
    cacheKey: packs.map((pack) => pack.cacheKey).join("|"),
    cacheHit: packs.every((pack) => pack.cacheHit),
  };
}

export function clearAiCagMemoryCache() {
  cache.clear();
}
