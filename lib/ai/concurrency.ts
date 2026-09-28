import type { SaasPlanCode } from "@/lib/billing/plans";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import type { AiRouteRequest } from "@/lib/ai/types";
import { redisRestCommand, type RedisRestUnavailableReason } from "@/lib/redis-rest";

export type AiConcurrencyWorkload = "CHAT" | "AGENT" | "EMBEDDING";
export type AiConcurrencyScope = "USER" | "ORGANIZATION" | "PROVIDER";

type Limits = { user: number; organization: number; provider: number; queueWaitMs: number; leaseTtlMs: number };

const LIMITS: Record<SaasPlanCode, Record<AiConcurrencyWorkload, Limits>> = {
  STARTER: {
    CHAT: { user: 1, organization: 4, provider: 40, queueWaitMs: 250, leaseTtlMs: 90_000 },
    AGENT: { user: 1, organization: 2, provider: 16, queueWaitMs: 350, leaseTtlMs: 90_000 },
    EMBEDDING: { user: 2, organization: 6, provider: 64, queueWaitMs: 200, leaseTtlMs: 60_000 },
  },
  BUSINESS: {
    CHAT: { user: 3, organization: 12, provider: 40, queueWaitMs: 350, leaseTtlMs: 90_000 },
    AGENT: { user: 2, organization: 6, provider: 16, queueWaitMs: 500, leaseTtlMs: 90_000 },
    EMBEDDING: { user: 4, organization: 16, provider: 64, queueWaitMs: 250, leaseTtlMs: 60_000 },
  },
  ENTERPRISE: {
    CHAT: { user: 6, organization: 32, provider: 40, queueWaitMs: 500, leaseTtlMs: 90_000 },
    AGENT: { user: 4, organization: 16, provider: 16, queueWaitMs: 750, leaseTtlMs: 90_000 },
    EMBEDDING: { user: 8, organization: 40, provider: 64, queueWaitMs: 300, leaseTtlMs: 60_000 },
  },
};

const ACQUIRE_SCRIPT = `
#!lua flags=allow-key-locking
local values = {}
for i = 1, 3 do
  local current = redis.call("INCR", KEYS[i])
  redis.call("PEXPIRE", KEYS[i], ARGV[1])
  values[i] = current
end
for i = 1, 3 do
  if values[i] > tonumber(ARGV[i + 1]) then
    for j = 1, 3 do
      local rolled = redis.call("DECR", KEYS[j])
      if rolled <= 0 then redis.call("DEL", KEYS[j]) end
    end
    return {0, i, values[1], values[2], values[3]}
  end
end
return {1, 0, values[1], values[2], values[3]}
`.trim();

const RELEASE_SCRIPT = `
#!lua flags=allow-key-locking
for i = 1, #KEYS do
  if redis.call("EXISTS", KEYS[i]) == 1 then
    local current = redis.call("DECR", KEYS[i])
    if current <= 0 then redis.call("DEL", KEYS[i]) end
  end
end
return 1
`.trim();

type LocalCounter = { count: number; expiresAt: number };
const localCounters = new Map<string, LocalCounter>();

export type AiConcurrencyLease = {
  acquired: true;
  source: "redis" | "local";
  keys: [string, string, string];
  workload: AiConcurrencyWorkload;
  limits: Limits;
  queueWaitMs: number;
};

export type AiConcurrencyDenied = {
  acquired: false;
  source: "redis" | "local";
  saturatedScope: AiConcurrencyScope;
  workload: AiConcurrencyWorkload;
  limits: Limits;
  queueWaitMs: number;
  degradedReason: RedisRestUnavailableReason | null;
};

function workloadFor(request: Pick<AiRouteRequest, "taskType" | "tags">): AiConcurrencyWorkload {
  if (request.tags?.some((tag) => tag === "runtime:agent-v1" || tag.startsWith("agent-run:"))) return "AGENT";
  if (request.taskType === "EMBEDDING" || request.taskType === "RERANKING") return "EMBEDDING";
  return "CHAT";
}

function normalizeKeyPart(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").slice(0, 120); }

function keysFor(input: { userId: string; organizationId?: string | null; providerCode: string; workload: AiConcurrencyWorkload }) {
  const user = normalizeKeyPart(input.userId);
  const organization = normalizeKeyPart(input.organizationId || `personal:${input.userId}`);
  const provider = normalizeKeyPart(input.providerCode);
  const workload = input.workload.toLowerCase();
  return [
    `ai:concurrency:${workload}:user:${user}`,
    `ai:concurrency:${workload}:org:${organization}`,
    `ai:concurrency:${workload}:provider:${provider}`,
  ] as [string, string, string];
}

function saturatedScope(index: number): AiConcurrencyScope {
  return index === 1 ? "USER" : index === 2 ? "ORGANIZATION" : "PROVIDER";
}

function pruneLocal(now: number) {
  for (const [key, value] of localCounters) if (value.expiresAt <= now || value.count <= 0) localCounters.delete(key);
}

function tryAcquireLocal(keys: [string, string, string], limits: Limits) {
  const now = Date.now();
  pruneLocal(now);
  const ceilings = [limits.user, limits.organization, limits.provider];
  const next = keys.map((key) => (localCounters.get(key)?.count || 0) + 1);
  const rejectedIndex = next.findIndex((value, index) => value > ceilings[index]);
  if (rejectedIndex >= 0) return { ok: false as const, scope: saturatedScope(rejectedIndex + 1) };
  keys.forEach((key, index) => localCounters.set(key, { count: next[index], expiresAt: now + limits.leaseTtlMs }));
  return { ok: true as const };
}

function releaseLocal(keys: [string, string, string]) {
  for (const key of keys) {
    const current = localCounters.get(key);
    if (!current) continue;
    if (current.count <= 1) localCounters.delete(key);
    else localCounters.set(key, { ...current, count: current.count - 1 });
  }
}

async function tryAcquireRedis(keys: [string, string, string], limits: Limits) {
  return redisRestCommand<number[]>([
    "EVAL", ACQUIRE_SCRIPT, 3, ...keys, limits.leaseTtlMs, limits.user, limits.organization, limits.provider,
  ], 300);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function getAiConcurrencyPolicySnapshot() {
  return { plans: LIMITS, workloads: ["CHAT", "AGENT", "EMBEDDING"] as const };
}

export async function acquireAiConcurrencyLease(input: {
  planCode: SaasPlanCode;
  userId: string;
  organizationId?: string | null;
  providerCode: string;
  request: Pick<AiRouteRequest, "taskType" | "tags">;
}): Promise<AiConcurrencyLease | AiConcurrencyDenied> {
  const workload = workloadFor(input.request);
  const limits = LIMITS[input.planCode][workload];
  const keys = keysFor({ ...input, workload });
  const startedAt = Date.now();
  let redisUnavailableReason: RedisRestUnavailableReason | null = null;

  while (true) {
    const redis = await tryAcquireRedis(keys, limits);
    if (redis.available) {
      const result = Array.isArray(redis.result) ? redis.result.map(Number) : [];
      if (result[0] === 1) return { acquired: true, source: "redis", keys, workload, limits, queueWaitMs: Date.now() - startedAt };
      const scope = saturatedScope(Number(result[1]) || 3);
      if (Date.now() - startedAt >= limits.queueWaitMs) return { acquired: false, source: "redis", saturatedScope: scope, workload, limits, queueWaitMs: Date.now() - startedAt, degradedReason: null };
    } else {
      redisUnavailableReason = redis.reason;
      const local = tryAcquireLocal(keys, limits);
      if (local.ok) return { acquired: true, source: "local", keys, workload, limits, queueWaitMs: Date.now() - startedAt };
      if (Date.now() - startedAt >= limits.queueWaitMs) return { acquired: false, source: "local", saturatedScope: local.scope, workload, limits, queueWaitMs: Date.now() - startedAt, degradedReason: redisUnavailableReason };
    }
    await sleep(75);
  }
}

export async function releaseAiConcurrencyLease(lease: AiConcurrencyLease | null | undefined) {
  if (!lease) return;
  if (lease.source === "local") { releaseLocal(lease.keys); return; }
  const outcome = await redisRestCommand<number>(["EVAL", RELEASE_SCRIPT, lease.keys.length, ...lease.keys], 300);
  if (!outcome.available) releaseLocal(lease.keys);
}

export function withAiConcurrencyLease(source: ReadableStream<AiProviderEvent>, lease: AiConcurrencyLease) {
  let reader: ReadableStreamDefaultReader<AiProviderEvent> | null = null;
  let released = false;
  const release = async () => { if (released) return; released = true; await releaseAiConcurrencyLease(lease); };
  return new ReadableStream<AiProviderEvent>({
    async start(controller) {
      reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { await release(); controller.close(); break; }
          controller.enqueue(value);
          if (value.type === "COMPLETED" || value.type === "ERROR") await release();
        }
      } catch (error) { await release(); controller.error(error); }
      finally { reader?.releaseLock(); reader = null; }
    },
    async cancel(reason) { await release(); await reader?.cancel(reason).catch(() => undefined); },
  });
}
