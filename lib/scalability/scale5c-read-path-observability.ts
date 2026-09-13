import { prisma } from "@/lib/prisma";

type FinanceSummaryReadPathRow = {
  requests: number;
  hits: number;
  misses: number;
  fallbacks: number;
  bypasses: number;
  hitP95Ms: number | null;
  databaseP95Ms: number | null;
};

function finiteMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

export async function getScale5cReadPathObservability(windowHours: number) {
  const generatedAt = new Date();
  const since = new Date(generatedAt.getTime() - windowHours * 60 * 60 * 1000);
  const [row] = await prisma.$queryRaw<FinanceSummaryReadPathRow[]>`
    SELECT
      COUNT(*)::int AS "requests",
      COUNT(*) FILTER (WHERE "metadata"->>'readSource' = 'HIT')::int AS "hits",
      COUNT(*) FILTER (WHERE "metadata"->>'readSource' = 'MISS')::int AS "misses",
      COUNT(*) FILTER (WHERE "metadata"->>'readSource' = 'FALLBACK')::int AS "fallbacks",
      COUNT(*) FILTER (WHERE "metadata"->>'readSource' = 'BYPASS')::int AS "bypasses",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs")
        FILTER (WHERE "metadata"->>'readSource' = 'HIT' AND "durationMs" IS NOT NULL)::float8 AS "hitP95Ms",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs")
        FILTER (WHERE "metadata"->>'readSource' IN ('MISS', 'FALLBACK', 'BYPASS') AND "durationMs" IS NOT NULL)::float8 AS "databaseP95Ms"
    FROM "ApiLog"
    WHERE "createdAt" >= ${since}
      AND "metadata"->>'domain' = 'finance-summary'
  `;

  const financeSummary = row ?? {
    requests: 0,
    hits: 0,
    misses: 0,
    fallbacks: 0,
    bypasses: 0,
    hitP95Ms: null,
    databaseP95Ms: null,
  };

  return {
    generatedAt: generatedAt.toISOString(),
    window: { hours: windowHours, since: since.toISOString() },
    financeSummary: {
      requests: financeSummary.requests,
      hit: financeSummary.hits,
      miss: financeSummary.misses,
      fallback: financeSummary.fallbacks,
      bypass: financeSummary.bypasses,
      hitRate: ratio(financeSummary.hits, financeSummary.hits + financeSummary.misses + financeSummary.fallbacks),
      latencyMs: {
        hitP95: finiteMetric(financeSummary.hitP95Ms),
        databaseP95: finiteMetric(financeSummary.databaseP95Ms),
      },
    },
    coverage: {
      scale5a: true,
      scale5b: true,
      scale5c: true,
      optimizedReadPaths: 4,
      intentionalBypassReadPaths: 3,
    },
  };
}
