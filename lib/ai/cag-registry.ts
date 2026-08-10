import type { AiExecutionContext } from "@/lib/ai/context-engine";

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

  // The expensive builder executes only after the cache lookup. Dynamic
  // versions may perform a cheap version read (for example Pharmacy settingsVersion)
  // so a configuration change invalidates the key without rebuilding every turn.
  const content = await builder.build(context);
  const value = { code: builder.code, version, content, cacheKey: key };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return { ...value, cacheHit: false };
}

const organizationBuilder: AiCagBuilderDefinition = {
  code: "organization",
  version: "1",
  build: async (context) => context.organization && context.membership
    ? `Organisation active: ${context.organization.name} (${context.organization.id}). Secteur: ${context.organization.sectorCode || "GENERAL"}. Rôle: ${context.membership.role}. Plan: ${context.planCode}. Modules lisibles: ${context.activeModuleCodes.join(", ") || "aucun"}.`
    : "Aucune organisation active.",
};

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
