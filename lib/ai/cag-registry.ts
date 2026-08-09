import type { AiExecutionContext } from "@/lib/ai/context-engine";

export type AiCagPack = {
  code: string;
  version: string;
  content: string;
  cacheKey: string;
  cacheHit: boolean;
};

export type AiCagBuilderResult = {
  code: string;
  version: string;
  content: string;
};

export type AiCagBuilder = (context: AiExecutionContext) => Promise<AiCagBuilderResult>;

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: Omit<AiCagPack, "cacheHit"> }>();
const sectorBuilders = new Map<string, AiCagBuilder>();

export function registerSectorCagBuilder(sectorCode: string, builder: AiCagBuilder) {
  sectorBuilders.set(sectorCode, builder);
}

function keyFor(context: AiExecutionContext, code: string, version: string) {
  return ["cag", context.organization?.id || "personal", context.userId, context.profile.code, context.profile.version, code, version, context.contextVersion].join(":");
}

async function cached(context: AiExecutionContext, builder: AiCagBuilder): Promise<AiCagPack> {
  const built = await builder(context);
  const key = keyFor(context, built.code, built.version);
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return { ...existing.value, cacheHit: true };
  const value = { ...built, cacheKey: key };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return { ...value, cacheHit: false };
}

const organizationBuilder: AiCagBuilder = async (context) => ({
  code: "organization",
  version: "1",
  content: context.organization && context.membership
    ? `Organisation active: ${context.organization.name} (${context.organization.id}). Secteur: ${context.organization.sectorCode || "GENERAL"}. Rôle: ${context.membership.role}. Plan: ${context.planCode}. Modules lisibles: ${context.activeModuleCodes.join(", ") || "aucun"}.`
    : "Aucune organisation active.",
});

export async function buildAiCagPack(context: AiExecutionContext): Promise<AiCagPack> {
  const packs = [await cached(context, organizationBuilder)];
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
