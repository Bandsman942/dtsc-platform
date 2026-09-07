import { createHash } from "node:crypto";
import { redisRestCommand, redisRestPipeline, type RedisRestUnavailableReason } from "@/lib/redis-rest";

export const READ_CACHE_TIMEOUT_MS = 120;
export const READ_CACHE_METRIC_TTL_SECONDS = 24 * 60 * 60;

type ReadCacheSource = "HIT" | "MISS" | "FALLBACK";

type ReadCacheTelemetry = {
  source: ReadCacheSource;
  redisReason: RedisRestUnavailableReason | null;
  lookupDurationMs: number;
  loaderDurationMs: number | null;
};

export type TenantReadCacheResult<T> = {
  value: T;
  telemetry: ReadCacheTelemetry;
};

type ReadThroughTenantCacheInput<T> = {
  namespace: string;
  organizationId: string;
  schemaVersion: string;
  ttlSeconds: number;
  loader: () => Promise<T>;
  validate: (value: unknown) => value is T;
  timeoutMs?: number;
};

type TenantReadCacheKeyInput = Pick<ReadThroughTenantCacheInput<unknown>, "namespace" | "organizationId" | "schemaVersion">;

function boundedToken(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(normalized)) {
    throw new Error(`Invalid ${label} for tenant read cache.`);
  }
  return normalized;
}

function tenantDigest(organizationId: string) {
  return createHash("sha256").update(organizationId).digest("hex").slice(0, 32);
}

export function tenantReadCacheKey(input: TenantReadCacheKeyInput) {
  const namespace = boundedToken(input.namespace, "namespace");
  const schemaVersion = boundedToken(input.schemaVersion, "schemaVersion");
  return `dtsc:read-cache:${schemaVersion}:${namespace}:org:${tenantDigest(input.organizationId)}`;
}

function metricKey(namespace: string, outcome: "hit" | "miss" | "invalid" | "invalidate") {
  return `dtsc:read-cache:metrics:v1:${boundedToken(namespace, "namespace")}:${outcome}`;
}

async function recordMetric(namespace: string, outcome: "hit" | "miss" | "invalid" | "invalidate", timeoutMs: number) {
  const key = metricKey(namespace, outcome);
  await redisRestPipeline([
    ["INCR", key],
    ["EXPIRE", key, READ_CACHE_METRIC_TTL_SECONDS],
  ], timeoutMs);
}

async function deleteInvalidCachedValue(key: string, namespace: string, timeoutMs: number) {
  await redisRestPipeline([
    ["DEL", key],
    ["INCR", metricKey(namespace, "invalid")],
    ["EXPIRE", metricKey(namespace, "invalid"), READ_CACHE_METRIC_TTL_SECONDS],
  ], timeoutMs);
}

export async function readThroughTenantCache<T>(input: ReadThroughTenantCacheInput<T>): Promise<TenantReadCacheResult<T>> {
  const timeoutMs = Math.max(25, Math.min(input.timeoutMs ?? READ_CACHE_TIMEOUT_MS, READ_CACHE_TIMEOUT_MS));
  const ttlSeconds = Math.max(1, Math.min(input.ttlSeconds, 5 * 60));
  const key = tenantReadCacheKey(input);
  const lookupStartedAt = Date.now();
  const cached = await redisRestCommand<string | null>(["GET", key], timeoutMs);
  const lookupDurationMs = Date.now() - lookupStartedAt;

  if (cached.available && typeof cached.result === "string" && cached.result.length > 0) {
    try {
      const parsed: unknown = JSON.parse(cached.result);
      if (input.validate(parsed)) {
        await recordMetric(input.namespace, "hit", timeoutMs);
        return {
          value: parsed,
          telemetry: { source: "HIT", redisReason: null, lookupDurationMs, loaderDurationMs: null },
        };
      }
    } catch {
      // Invalid cache content is disposable and must never become a read authority.
    }
    await deleteInvalidCachedValue(key, input.namespace, timeoutMs);
  }

  const loaderStartedAt = Date.now();
  const value = await input.loader();
  const loaderDurationMs = Date.now() - loaderStartedAt;

  if (!cached.available) {
    return {
      value,
      telemetry: {
        source: "FALLBACK",
        redisReason: cached.reason,
        lookupDurationMs,
        loaderDurationMs,
      },
    };
  }

  try {
    const serialized = JSON.stringify(value);
    await redisRestPipeline([
      ["SETEX", key, ttlSeconds, serialized],
      ["INCR", metricKey(input.namespace, "miss")],
      ["EXPIRE", metricKey(input.namespace, "miss"), READ_CACHE_METRIC_TTL_SECONDS],
    ], timeoutMs);
  } catch {
    // Cache writes and cache telemetry are best-effort. The canonical DB result wins.
  }

  return {
    value,
    telemetry: { source: "MISS", redisReason: null, lookupDurationMs, loaderDurationMs },
  };
}

export async function invalidateTenantReadCaches(inputs: TenantReadCacheKeyInput[], timeoutMs = READ_CACHE_TIMEOUT_MS) {
  const unique = new Map<string, { key: string; namespace: string }>();
  for (const input of inputs) {
    const key = tenantReadCacheKey(input);
    unique.set(key, { key, namespace: input.namespace });
  }
  if (!unique.size) return { attempted: 0, redisAvailable: true };

  const commands: Array<Array<string | number>> = [];
  for (const { key, namespace } of unique.values()) {
    commands.push(["DEL", key]);
    commands.push(["INCR", metricKey(namespace, "invalidate")]);
    commands.push(["EXPIRE", metricKey(namespace, "invalidate"), READ_CACHE_METRIC_TTL_SECONDS]);
  }
  const outcome = await redisRestPipeline(commands, Math.max(25, Math.min(timeoutMs, READ_CACHE_TIMEOUT_MS)));
  return { attempted: unique.size, redisAvailable: outcome.available };
}
