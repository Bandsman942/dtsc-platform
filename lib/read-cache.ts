import { createHash } from "node:crypto";
import { redisRestCommand, redisRestPipeline, type RedisRestUnavailableReason } from "@/lib/redis-rest";

export const READ_CACHE_TIMEOUT_MS = 120;

export type ReadCacheSource = "HIT" | "MISS" | "FALLBACK";

export type ReadCacheTelemetry = {
  source: ReadCacheSource;
  redisReason: RedisRestUnavailableReason | null;
  lookupDurationMs: number;
  loaderDurationMs: number | null;
  cacheWriteAvailable: boolean | null;
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
        return {
          value: parsed,
          telemetry: {
            source: "HIT",
            redisReason: null,
            lookupDurationMs,
            loaderDurationMs: null,
            cacheWriteAvailable: null,
          },
        };
      }
    } catch {
      // Invalid cache content is disposable and must never become a read authority.
    }
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
        cacheWriteAvailable: null,
      },
    };
  }

  let cacheWriteAvailable = false;
  try {
    const serialized = JSON.stringify(value);
    const write = await redisRestPipeline([["SETEX", key, ttlSeconds, serialized]], timeoutMs);
    cacheWriteAvailable = write.available;
  } catch {
    cacheWriteAvailable = false;
  }

  return {
    value,
    telemetry: {
      source: "MISS",
      redisReason: null,
      lookupDurationMs,
      loaderDurationMs,
      cacheWriteAvailable,
    },
  };
}

export async function invalidateTenantReadCaches(inputs: TenantReadCacheKeyInput[], timeoutMs = READ_CACHE_TIMEOUT_MS) {
  const keys = [...new Set(inputs.map((input) => tenantReadCacheKey(input)))];
  if (!keys.length) return { attempted: 0, redisAvailable: true, redisReason: null as RedisRestUnavailableReason | null };

  const outcome = await redisRestPipeline(
    keys.map((key) => ["DEL", key]),
    Math.max(25, Math.min(timeoutMs, READ_CACHE_TIMEOUT_MS)),
  );

  if (!outcome.available) {
    return { attempted: keys.length, redisAvailable: false, redisReason: outcome.reason };
  }
  return { attempted: keys.length, redisAvailable: true, redisReason: null as RedisRestUnavailableReason | null };
}
