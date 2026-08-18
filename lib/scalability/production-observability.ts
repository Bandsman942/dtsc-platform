import { getDatabaseConnectionPolicy } from "@/lib/database-connection-policy";
import { prisma } from "@/lib/prisma";
import {
  getRedisObservabilitySnapshot,
  REDIS_OBSERVABILITY_METRICS,
} from "@/lib/scalability/redis-observability";

type ApiLatencyRow = {
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  serverErrorCount: number;
};

type AiLatencyRow = {
  sampleCount: number;
  successCount: number;
  failedCount: number;
  rateLimitedCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  firstTokenP95Ms: number | null;
};

type DbConnectionRow = {
  currentConnections: number;
  activeConnections: number;
  idleConnections: number;
  idleInTransactionConnections: number;
  longRunningQueries: number;
  maxConnections: number;
};

type Scale2DbPathRow = {
  presenceCheckpointCount: number;
  presenceFallbackCount: number;
  callDbReconciliationCount: number;
  callFallbackCount: number;
  callSettingsDbCount: number;
};

function finiteMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function observedRate(sampleCount: number, windowHours: number) {
  const seconds = windowHours * 60 * 60;
  const minutes = windowHours * 60;
  return {
    perSecond: finiteMetric(seconds > 0 ? sampleCount / seconds : null),
    perMinute: finiteMetric(minutes > 0 ? sampleCount / minutes : null),
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

export async function getProductionObservabilitySnapshot(windowHours: number) {
  const generatedAt = new Date();
  const since = new Date(generatedAt.getTime() - windowHours * 60 * 60 * 1000);
  const connectionPolicy = getDatabaseConnectionPolicy();

  const dbProbeStartedAt = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbProbeLatencyMs = performance.now() - dbProbeStartedAt;

  const [apiRows, aiRows, dbConnectionRows, scale2Rows, redisSnapshot] = await Promise.all([
    prisma.$queryRaw<ApiLatencyRow[]>`
      SELECT
        COUNT(*)::int AS "sampleCount",
        percentile_cont(0.50) WITHIN GROUP (ORDER BY "durationMs")::float8 AS "p50Ms",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs")::float8 AS "p95Ms",
        percentile_cont(0.99) WITHIN GROUP (ORDER BY "durationMs")::float8 AS "p99Ms",
        COUNT(*) FILTER (WHERE "statusCode" >= 500)::int AS "serverErrorCount"
      FROM "ApiLog"
      WHERE "createdAt" >= ${since}
        AND "durationMs" IS NOT NULL
    `,
    prisma.$queryRaw<AiLatencyRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE "durationMs" IS NOT NULL)::int AS "sampleCount",
        COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::int AS "successCount",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failedCount",
        COUNT(*) FILTER (WHERE "reasonCode" = 'RATE_LIMITED')::int AS "rateLimitedCount",
        percentile_cont(0.50) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "durationMs" IS NOT NULL)::float8 AS "p50Ms",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "durationMs" IS NOT NULL)::float8 AS "p95Ms",
        percentile_cont(0.99) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "durationMs" IS NOT NULL)::float8 AS "p99Ms",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "firstTokenLatencyMs") FILTER (WHERE "firstTokenLatencyMs" IS NOT NULL)::float8 AS "firstTokenP95Ms"
      FROM "AiModelCall"
      WHERE "createdAt" >= ${since}
    `,
    prisma.$queryRaw<DbConnectionRow[]>`
      SELECT
        COUNT(*)::int AS "currentConnections",
        COUNT(*) FILTER (WHERE state = 'active')::int AS "activeConnections",
        COUNT(*) FILTER (WHERE state = 'idle')::int AS "idleConnections",
        COUNT(*) FILTER (WHERE state = 'idle in transaction')::int AS "idleInTransactionConnections",
        COUNT(*) FILTER (
          WHERE state = 'active'
            AND query_start IS NOT NULL
            AND now() - query_start >= interval '1 second'
        )::int AS "longRunningQueries",
        current_setting('max_connections')::int AS "maxConnections"
      FROM pg_stat_activity
      WHERE datname = current_database()
    `,
    prisma.$queryRaw<Scale2DbPathRow[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE "path" = '/api/collaborators/presence'
            AND "statusCode" = 200
            AND "metadata"->>'presenceMode' = 'REDIS'
            AND "metadata"->>'dbCheckpoint' = 'true'
        )::int AS "presenceCheckpointCount",
        COUNT(*) FILTER (
          WHERE "path" = '/api/collaborators/presence'
            AND "statusCode" = 200
            AND "metadata"->>'presenceMode' = 'FALLBACK'
        )::int AS "presenceFallbackCount",
        COUNT(*) FILTER (
          WHERE "path" = '/api/collaborators/calls/events'
            AND "statusCode" = 200
            AND "metadata"->>'dbReconciled' = 'true'
        )::int AS "callDbReconciliationCount",
        COUNT(*) FILTER (
          WHERE "path" = '/api/collaborators/calls/events'
            AND "statusCode" = 200
            AND "metadata"->>'callEventInbox' = 'FALLBACK'
        )::int AS "callFallbackCount",
        COUNT(*) FILTER (
          WHERE "path" = '/api/collaborators/calls/events'
            AND "statusCode" = 200
            AND "metadata"->>'settingsSource' = 'DATABASE'
        )::int AS "callSettingsDbCount"
      FROM "ApiLog"
      WHERE "createdAt" >= ${since}
    `,
    getRedisObservabilitySnapshot(windowHours),
  ]);

  const api = apiRows[0] ?? { sampleCount: 0, p50Ms: null, p95Ms: null, p99Ms: null, serverErrorCount: 0 };
  const ai = aiRows[0] ?? { sampleCount: 0, successCount: 0, failedCount: 0, rateLimitedCount: 0, p50Ms: null, p95Ms: null, p99Ms: null, firstTokenP95Ms: null };
  const database = dbConnectionRows[0] ?? {
    currentConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    idleInTransactionConnections: 0,
    longRunningQueries: 0,
    maxConnections: 0,
  };
  const scale2 = scale2Rows[0] ?? {
    presenceCheckpointCount: 0,
    presenceFallbackCount: 0,
    callDbReconciliationCount: 0,
    callFallbackCount: 0,
    callSettingsDbCount: 0,
  };
  const presenceRedisLeaseCount = redisSnapshot.metrics[REDIS_OBSERVABILITY_METRICS.presenceLeaseRedis] || 0;
  const presenceRedisReadCount = redisSnapshot.metrics[REDIS_OBSERVABILITY_METRICS.presenceReadRedis] || 0;
  const callRedisReadCount = redisSnapshot.metrics[REDIS_OBSERVABILITY_METRICS.callInboxReadRedis] || 0;
  const callRedisPublishCount = redisSnapshot.metrics[REDIS_OBSERVABILITY_METRICS.callPublishRedis] || 0;

  return {
    generatedAt: generatedAt.toISOString(),
    window: {
      hours: windowHours,
      since: since.toISOString(),
    },
    api: {
      source: "ApiLog.durationMs",
      coverage: "Only routes that persist ApiLog entries are represented. Redis-only presence heartbeats and call-event polls intentionally do not write PostgreSQL ApiLog rows.",
      sampleCount: api.sampleCount,
      throughput: observedRate(api.sampleCount, windowHours),
      serverErrorCount: api.serverErrorCount,
      serverErrorRate: api.sampleCount > 0 ? api.serverErrorCount / api.sampleCount : null,
      latencyMs: {
        p50: finiteMetric(api.p50Ms),
        p95: finiteMetric(api.p95Ms),
        p99: finiteMetric(api.p99Ms),
      },
    },
    database: {
      source: "PostgreSQL live probe + pg_stat_activity + secret-free runtime policy",
      probeLatencyMs: finiteMetric(dbProbeLatencyMs),
      currentConnections: database.currentConnections,
      activeConnections: database.activeConnections,
      idleConnections: database.idleConnections,
      idleInTransactionConnections: database.idleInTransactionConnections,
      longRunningQueries: database.longRunningQueries,
      maxConnections: database.maxConnections,
      connectionUtilization: database.maxConnections > 0 ? database.currentConnections / database.maxConnections : null,
      connectionPolicy,
    },
    ai: {
      source: "AiModelCall",
      sampleCount: ai.sampleCount,
      throughput: observedRate(ai.sampleCount, windowHours),
      successCount: ai.successCount,
      failedCount: ai.failedCount,
      rateLimitedCount: ai.rateLimitedCount,
      rateLimitedRate: ai.sampleCount > 0 ? ai.rateLimitedCount / ai.sampleCount : null,
      latencyMs: {
        p50: finiteMetric(ai.p50Ms),
        p95: finiteMetric(ai.p95Ms),
        p99: finiteMetric(ai.p99Ms),
        firstTokenP95: finiteMetric(ai.firstTokenP95Ms),
      },
    },
    redis: {
      source: "Upstash Redis REST live probe + anonymous hourly Redis counters + bounded ApiLog only when PostgreSQL is actually touched",
      status: redisSnapshot.status,
      reason: redisSnapshot.reason,
      probeLatencyMs: redisSnapshot.probeLatencyMs,
      bucketPrecisionMinutes: redisSnapshot.bucketPrecisionMinutes,
      presence: {
        redisLeaseCount: presenceRedisLeaseCount,
        redisReadCount: presenceRedisReadCount,
        dbCheckpointCount: scale2.presenceCheckpointCount,
        dbFallbackCount: scale2.presenceFallbackCount,
        redisFirstRate: ratio(presenceRedisLeaseCount, presenceRedisLeaseCount + scale2.presenceFallbackCount),
      },
      calls: {
        redisInboxReadCount: callRedisReadCount,
        redisPublishCount: callRedisPublishCount,
        dbReconciliationCount: scale2.callDbReconciliationCount,
        dbFallbackCount: scale2.callFallbackCount,
        settingsDbLoadCount: scale2.callSettingsDbCount,
        redisFirstRate: ratio(callRedisReadCount, callRedisReadCount + scale2.callFallbackCount),
        dbReadRate: ratio(scale2.callDbReconciliationCount, callRedisReadCount + scale2.callFallbackCount),
      },
    },
  };
}
