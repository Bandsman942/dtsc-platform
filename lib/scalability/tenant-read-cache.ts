import {
  redisRestCommand,
  redisRestPipeline,
  type RedisRestUnavailableReason,
} from "@/lib/redis-rest";

export const TENANT_READ_CACHE_TIMEOUT_MS = 250;
const TENANT_READ_CACHE_METRIC_TIMEOUT_MS = 150;
const TENANT_READ_CACHE_METRIC_TTL_SECONDS = 7 * 24 * 60 * 60;

export type TenantReadCacheSource = "HIT" | "MISS" | "FALLBACK";

export type TenantReadCacheResult<T> = {
  value: T;
  source: TenantReadCacheSource;
  fallbackReason?: RedisRestUnavailableReason;
};

type TenantReadCacheInput<T> = {
  projection: string;
  organizationId: string;
  schemaVersion: string;
  ttlSeconds: number;
  validate: (value: unknown) => value is T;
  load: () => Promise<T>;
};

type TenantReadCacheKeyInput = Pick<TenantReadCacheInput<unknown>, "projection" | "organizationId" | "schemaVersion">;

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_");
}

export function tenantReadCacheKey(input: TenantReadCacheKeyInput) {
  return `dtsc:read-cache:${safeSegment(input.schemaVersion)}:${safeSegment(input.projection)}:org:${safeSegment(input.organizationId)}`;
}

function tenantReadCacheMetricKey(projection: string, metric: string) {
  return `dtsc:read-cache:metrics:${safeSegment(projection)}:${safeSegment(metric)}`;
}

async function recordTenantReadCacheMetric(projection: string, metric: string) {
  try {
    const key = tenantReadCacheMetricKey(projection, metric);
    await redisRestPipeline(
      [
        ["INCR", key],
        ["EXPIRE", key, TENANT_READ_CACHE_METRIC_TTL_SECONDS],
      ],
      TENANT_READ_CACHE_METRIC_TIMEOUT_MS,
    );
  } catch {
    // Cache telemetry is best-effort and never affects a business read.
  }
}

export async function withTenantReadCache<T>(input: TenantReadCacheInput<T>): Promise<TenantReadCacheResult<T>> {
  const key = tenantReadCacheKey(input);
  const read = await redisRestCommand<string | null>(["GET", key], TENANT_READ_CACHE_TIMEOUT_MS);

  if (read.available && typeof read.result === "string" && read.result.length > 0) {
    try {
      const parsed = JSON.parse(read.result) as unknown;
      if (input.validate(parsed)) {
        await recordTenantReadCacheMetric(input.projection, "hit");
        return { value: parsed, source: "HIT" };
      }
      await recordTenantReadCacheMetric(input.projection, "invalid_json");
    } catch {
      await recordTenantReadCacheMetric(input.projection, "invalid_json");
    }
  }

  const value = await input.load();
  const source: TenantReadCacheSource = read.available ? "MISS" : "FALLBACK";

  if (read.available) {
    const write = await redisRestCommand<string | null>(
      ["SET", key, JSON.stringify(value), "EX", Math.max(1, input.ttlSeconds)],
      TENANT_READ_CACHE_TIMEOUT_MS,
    );
    await recordTenantReadCacheMetric(input.projection, write.available ? "miss" : "write_fallback");
  } else {
    await recordTenantReadCacheMetric(input.projection, `fallback_${read.reason.toLowerCase()}`);
  }

  return {
    value,
    source,
    ...(!read.available ? { fallbackReason: read.reason } : {}),
  };
}

export async function invalidateTenantReadCache(input: TenantReadCacheKeyInput) {
  const key = tenantReadCacheKey(input);
  try {
    const outcome = await redisRestCommand<number>(["DEL", key], TENANT_READ_CACHE_TIMEOUT_MS);
    await recordTenantReadCacheMetric(input.projection, outcome.available ? "invalidate" : "invalidate_fallback");
    return outcome.available;
  } catch {
    await recordTenantReadCacheMetric(input.projection, "invalidate_fallback");
    return false;
  }
}
