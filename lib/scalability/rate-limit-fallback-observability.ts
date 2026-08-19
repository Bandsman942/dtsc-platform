import type { RedisRestUnavailableReason } from "@/lib/redis-rest";
import type { RateLimitPolicy } from "@/lib/rate-limit-policy";

export const RATE_LIMIT_FALLBACK_TELEMETRY_FLUSH_MS = 60_000;
export const RATE_LIMIT_FALLBACK_TELEMETRY_MAX_BUCKETS = 64;

type DegradedSource = "local" | "fail-open" | "fail-closed";

type TelemetryBucket = {
  pendingCount: number;
  lastSeenAt: number;
  lastEmittedAt: number;
};

const buckets = new Map<string, TelemetryBucket>();

function telemetryBucketKey(input: {
  policy: RateLimitPolicy;
  source: DegradedSource;
  reason: RedisRestUnavailableReason;
}) {
  return `${input.policy.name}|${input.policy.failureMode}|${input.source}|${input.reason}`;
}

function pruneTelemetryBuckets() {
  if (buckets.size < RATE_LIMIT_FALLBACK_TELEMETRY_MAX_BUCKETS) return;
  let oldestKey: string | null = null;
  let oldestSeenAt = Number.POSITIVE_INFINITY;
  for (const [key, bucket] of buckets) {
    if (bucket.lastSeenAt < oldestSeenAt) {
      oldestSeenAt = bucket.lastSeenAt;
      oldestKey = key;
    }
  }
  if (oldestKey) buckets.delete(oldestKey);
}

function emitFallbackTelemetry(input: {
  policy: RateLimitPolicy;
  source: DegradedSource;
  reason: RedisRestUnavailableReason;
  count: number;
  aggregationWindowMs: number;
}) {
  console.warn(JSON.stringify({
    event: "dtsc.rate_limit.degraded",
    profile: input.policy.name,
    failureMode: input.policy.failureMode,
    source: input.source,
    reason: input.reason,
    count: input.count,
    aggregationWindowMs: input.aggregationWindowMs,
  }));
}

export function recordRateLimitFallback(input: {
  policy: RateLimitPolicy;
  source: DegradedSource;
  reason: RedisRestUnavailableReason;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const bucketKey = telemetryBucketKey(input);
  const current = buckets.get(bucketKey);

  if (!current) {
    pruneTelemetryBuckets();
    buckets.set(bucketKey, { pendingCount: 0, lastSeenAt: now, lastEmittedAt: now });
    emitFallbackTelemetry({ ...input, count: 1, aggregationWindowMs: 0 });
    return;
  }

  current.pendingCount += 1;
  current.lastSeenAt = now;
  const elapsed = now - current.lastEmittedAt;
  if (elapsed < RATE_LIMIT_FALLBACK_TELEMETRY_FLUSH_MS) return;

  emitFallbackTelemetry({
    ...input,
    count: current.pendingCount,
    aggregationWindowMs: elapsed,
  });
  current.pendingCount = 0;
  current.lastEmittedAt = now;
}
