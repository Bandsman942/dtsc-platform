import {
  redisRestCommand,
  type RedisRestUnavailableReason,
} from "@/lib/redis-rest";
import {
  resolveRateLimitPolicy,
  type RateLimitFailureMode,
  type RateLimitPolicy,
} from "@/lib/rate-limit-policy";
import { recordRateLimitFallback } from "@/lib/scalability/rate-limit-fallback-observability";

export type { RateLimitFailureMode } from "@/lib/rate-limit-policy";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitSource = "redis" | "local" | "fail-open" | "fail-closed";

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  source: RateLimitSource;
  degraded: boolean;
  reason: RedisRestUnavailableReason | null;
};

export type RateLimitOptions = {
  failureMode?: RateLimitFailureMode;
  timeoutMs?: number;
};

export const RATE_LIMIT_REDIS_TIMEOUT_MS = 300;
export const RATE_LIMIT_LOCAL_MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();

const ATOMIC_RATE_LIMIT_SCRIPT = `
#!lua flags=allow-key-locking
local current = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if current == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`.trim();

function normalizeLimit(limit: number) {
  return Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
}

function normalizeWindowMs(windowMs: number) {
  return Number.isFinite(windowMs) ? Math.max(1, Math.floor(windowMs)) : 1;
}

function boundedTimeoutMs(timeoutMs?: number) {
  if (!Number.isFinite(timeoutMs)) return RATE_LIMIT_REDIS_TIMEOUT_MS;
  return Math.max(25, Math.min(RATE_LIMIT_REDIS_TIMEOUT_MS, Math.floor(timeoutMs as number)));
}

function pruneLocalBuckets(now: number) {
  if (buckets.size < RATE_LIMIT_LOCAL_MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size < RATE_LIMIT_LOCAL_MAX_BUCKETS) return;
  }

  const oldestKey = buckets.keys().next().value as string | undefined;
  if (oldestKey) buckets.delete(oldestKey);
}

function localRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  reason: RedisRestUnavailableReason
): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    pruneLocalBuckets(now);
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      ok: 1 <= limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      source: "local",
      degraded: true,
      reason,
    };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: current.resetAt,
      source: "local",
      degraded: true,
      reason,
    };
  }

  current.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    source: "local",
    degraded: true,
    reason,
  };
}

async function rateLimitStorageKey(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `dtsc:rl:v2:${hex}`;
}

function parseAtomicResult(result: unknown) {
  if (!Array.isArray(result) || result.length < 2) return null;
  const count = Number(result[0]);
  const ttlMs = Number(result[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMs) || ttlMs < 0) return null;
  return { count, ttlMs };
}

function degradedResult(
  safeKey: string,
  limit: number,
  windowMs: number,
  failureMode: RateLimitFailureMode,
  reason: RedisRestUnavailableReason
): RateLimitResult {
  if (failureMode === "open") {
    return {
      ok: true,
      remaining: limit,
      resetAt: Date.now() + windowMs,
      source: "fail-open",
      degraded: true,
      reason,
    };
  }

  if (failureMode === "closed") {
    return {
      ok: false,
      remaining: 0,
      resetAt: Date.now() + windowMs,
      source: "fail-closed",
      degraded: true,
      reason,
    };
  }

  return localRateLimit(safeKey, limit, windowMs, reason);
}

function observedDegradedResult(
  safeKey: string,
  limit: number,
  windowMs: number,
  policy: RateLimitPolicy,
  reason: RedisRestUnavailableReason
) {
  const result = degradedResult(safeKey, limit, windowMs, policy.failureMode, reason);
  if (result.source !== "redis" && result.reason) {
    recordRateLimitFallback({ policy, source: result.source, reason: result.reason });
  }
  return result;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const safeLimit = normalizeLimit(limit);
  const safeWindowMs = normalizeWindowMs(windowMs);
  const policy = resolveRateLimitPolicy(key, options.failureMode);
  const safeKey = await rateLimitStorageKey(key);

  const outcome = await redisRestCommand<unknown>(
    ["EVAL", ATOMIC_RATE_LIMIT_SCRIPT, 1, safeKey, safeWindowMs],
    boundedTimeoutMs(options.timeoutMs)
  );

  if (!outcome.available) {
    return observedDegradedResult(safeKey, safeLimit, safeWindowMs, policy, outcome.reason);
  }

  const parsed = parseAtomicResult(outcome.result);
  if (!parsed) {
    return observedDegradedResult(safeKey, safeLimit, safeWindowMs, policy, "ERROR");
  }

  return {
    ok: parsed.count <= safeLimit,
    remaining: Math.max(0, safeLimit - parsed.count),
    resetAt: Date.now() + parsed.ttlMs,
    source: "redis",
    degraded: false,
    reason: null,
  };
}

export function getRateLimitKey(req: Request, scope: string) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}
