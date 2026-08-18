import {
  isRedisRestConfigured,
  redisRestCommand,
  redisRestPipeline,
  type RedisRestCommand,
  type RedisRestUnavailableReason,
} from "@/lib/redis-rest";

export const REDIS_OBSERVABILITY_BUCKET_MS = 60 * 60 * 1000;
export const REDIS_OBSERVABILITY_TTL_SECONDS = 8 * 24 * 60 * 60;

export const REDIS_OBSERVABILITY_METRICS = {
  presenceLeaseRedis: "presence.lease.redis",
  presenceReadRedis: "presence.read.redis",
  callInboxReadRedis: "calls.inbox.read.redis",
  callPublishRedis: "calls.publish.redis",
} as const;

export type RedisObservabilityMetric = (typeof REDIS_OBSERVABILITY_METRICS)[keyof typeof REDIS_OBSERVABILITY_METRICS];

type RedisObservabilityStatus = "OK" | "DEGRADED" | "UNCONFIGURED" | "UNAVAILABLE";

function bucketId(date: Date) {
  return Math.floor(date.getTime() / REDIS_OBSERVABILITY_BUCKET_MS);
}

function bucketKey(date: Date) {
  return `dtsc:scalability:redis:${bucketId(date)}`;
}

export function redisObservabilityMetricCommands(
  metric: RedisObservabilityMetric,
  amount = 1,
  now = new Date()
): RedisRestCommand[] {
  const key = bucketKey(now);
  return [
    ["HINCRBY", key, metric, amount],
    ["EXPIRE", key, REDIS_OBSERVABILITY_TTL_SECONDS],
  ];
}

function parseHash(value: unknown) {
  const result: Record<string, number> = {};
  if (Array.isArray(value)) {
    for (let index = 0; index + 1 < value.length; index += 2) {
      const key = String(value[index] ?? "");
      const amount = Number(value[index + 1]);
      if (key && Number.isFinite(amount)) result[key] = amount;
    }
    return result;
  }
  if (value && typeof value === "object") {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const amount = Number(raw);
      if (Number.isFinite(amount)) result[key] = amount;
    }
  }
  return result;
}

function unavailableStatus(reason: RedisRestUnavailableReason): RedisObservabilityStatus {
  return reason === "UNCONFIGURED" ? "UNCONFIGURED" : "UNAVAILABLE";
}

export async function getRedisObservabilitySnapshot(windowHours: number) {
  if (!isRedisRestConfigured()) {
    return {
      status: "UNCONFIGURED" as const,
      reason: "UNCONFIGURED" as const,
      probeLatencyMs: null,
      bucketPrecisionMinutes: 60,
      metrics: {} as Record<string, number>,
    };
  }

  const probeStartedAt = performance.now();
  const probe = await redisRestCommand<string>(["PING"]);
  const probeLatencyMs = Math.round((performance.now() - probeStartedAt) * 100) / 100;
  if (!probe.available) {
    return {
      status: unavailableStatus(probe.reason),
      reason: probe.reason,
      probeLatencyMs,
      bucketPrecisionMinutes: 60,
      metrics: {} as Record<string, number>,
    };
  }

  const now = new Date();
  const bucketCount = Math.min(168, Math.max(1, Math.ceil(windowHours) + 1));
  const commands: RedisRestCommand[] = [];
  for (let offset = 0; offset < bucketCount; offset += 1) {
    commands.push(["HGETALL", bucketKey(new Date(now.getTime() - offset * REDIS_OBSERVABILITY_BUCKET_MS))]);
  }
  const buckets = await redisRestPipeline(commands);
  if (!buckets.available) {
    return {
      status: "DEGRADED" as const,
      reason: buckets.reason,
      probeLatencyMs,
      bucketPrecisionMinutes: 60,
      metrics: {} as Record<string, number>,
    };
  }

  const totals: Record<string, number> = {};
  for (const item of buckets.result) {
    const values = parseHash(item?.result);
    for (const [metric, amount] of Object.entries(values)) {
      totals[metric] = (totals[metric] || 0) + amount;
    }
  }

  return {
    status: "OK" as const,
    reason: null,
    probeLatencyMs,
    bucketPrecisionMinutes: 60,
    metrics: totals,
  };
}
