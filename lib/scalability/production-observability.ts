import { prisma } from "@/lib/prisma";

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
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  firstTokenP95Ms: number | null;
};

type DbConnectionRow = {
  currentConnections: number;
  maxConnections: number;
};

function finiteMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export async function getProductionObservabilitySnapshot(windowHours: number) {
  const generatedAt = new Date();
  const since = new Date(generatedAt.getTime() - windowHours * 60 * 60 * 1000);

  const dbProbeStartedAt = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbProbeLatencyMs = performance.now() - dbProbeStartedAt;

  const [apiRows, aiRows, dbConnectionRows] = await Promise.all([
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
        current_setting('max_connections')::int AS "maxConnections"
      FROM pg_stat_activity
      WHERE datname = current_database()
    `,
  ]);

  const api = apiRows[0] ?? { sampleCount: 0, p50Ms: null, p95Ms: null, p99Ms: null, serverErrorCount: 0 };
  const ai = aiRows[0] ?? { sampleCount: 0, successCount: 0, failedCount: 0, p50Ms: null, p95Ms: null, p99Ms: null, firstTokenP95Ms: null };
  const database = dbConnectionRows[0] ?? { currentConnections: 0, maxConnections: 0 };

  return {
    generatedAt: generatedAt.toISOString(),
    window: {
      hours: windowHours,
      since: since.toISOString(),
    },
    api: {
      source: "ApiLog.durationMs",
      coverage: "Only routes that persist ApiLog entries are represented.",
      sampleCount: api.sampleCount,
      serverErrorCount: api.serverErrorCount,
      serverErrorRate: api.sampleCount > 0 ? api.serverErrorCount / api.sampleCount : null,
      latencyMs: {
        p50: finiteMetric(api.p50Ms),
        p95: finiteMetric(api.p95Ms),
        p99: finiteMetric(api.p99Ms),
      },
    },
    database: {
      source: "PostgreSQL live probe + pg_stat_activity",
      probeLatencyMs: finiteMetric(dbProbeLatencyMs),
      currentConnections: database.currentConnections,
      maxConnections: database.maxConnections,
      connectionUtilization: database.maxConnections > 0 ? database.currentConnections / database.maxConnections : null,
    },
    ai: {
      source: "AiModelCall",
      sampleCount: ai.sampleCount,
      successCount: ai.successCount,
      failedCount: ai.failedCount,
      latencyMs: {
        p50: finiteMetric(ai.p50Ms),
        p95: finiteMetric(ai.p95Ms),
        p99: finiteMetric(ai.p99Ms),
        firstTokenP95: finiteMetric(ai.firstTokenP95Ms),
      },
    },
    redis: {
      status: "NOT_MEASURED" as const,
      reason: "Redis/Upstash production observability is deferred to SCALE-2 #355; no synthetic value is emitted.",
    },
  };
}
