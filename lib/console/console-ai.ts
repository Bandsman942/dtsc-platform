import "server-only";
import { prisma } from "@/lib/prisma";

type AiAggregateRow = {
  calls: number;
  successful: number;
  completed: number;
  tokens: bigint;
  costedCalls: number;
  usdCost: string;
  p95Ms: number | null;
  fallbacks: number;
};
type ProviderAggregateRow = {
  provider: string;
  calls: number;
  successful: number;
  failed: number;
  tokens: bigint;
};

export type ConsoleAiDataset = {
  period: { from: string; to: string; refreshedAt: string };
  metrics: {
    calls: number;
    tokens: number;
    successful: number;
    completed: number;
    successRate: number | null;
    usdCost: number | null;
    costCoverage: number | null;
    p95Ms: number | null;
    fallbacks: number;
  } | null;
  providers: Array<{ provider: string; calls: number; successful: number; failed: number; tokens: number }> | null;
  agent: { runs: number; completed: number; budgetExhausted: number; failures: number } | null;
  mcp: { certifiedServers: number; enabledBindings: number; reachability: "NOT_MEASURED" } | null;
};

/**
 * Aggregated, global operational metadata only. NEVER return user/organization
 * identifiers, messages, OAuth grants, prompts, tool payloads or resource content.
 *
 * AiModelCall is the authority for model-call tokens/cost; AiProviderAttempt and
 * AiAgentRun must never be added to it as if they were extra billable calls.
 */
export async function getConsoleAiDataset(input: { from: Date; to: Date }): Promise<ConsoleAiDataset> {
  const refreshedAt = new Date().toISOString();
  const where = { gte: input.from, lt: input.to };
  const [aggregateResult, providerResult, agentResult, mcpResult] = await Promise.allSettled([
    prisma.$queryRaw<AiAggregateRow[]>`
      SELECT COUNT(*)::int AS "calls",
        COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::int AS "successful",
        COUNT(*) FILTER (WHERE "status" IN ('SUCCESS', 'FAILED', 'CANCELLED'))::int AS "completed",
        COALESCE(SUM(CASE WHEN "status" = 'SUCCESS' THEN "totalTokens" ELSE 0 END), 0)::bigint AS "tokens",
        COUNT(*) FILTER (WHERE "status" = 'SUCCESS' AND "estimatedCost" IS NOT NULL
          AND "costKind" IN ('EXACT', 'ESTIMATED') AND "costCurrency" = 'USD')::int AS "costedCalls",
        COALESCE(SUM(CASE WHEN "status" = 'SUCCESS' AND "estimatedCost" IS NOT NULL
          AND "costKind" IN ('EXACT', 'ESTIMATED') AND "costCurrency" = 'USD'
          THEN "estimatedCost" ELSE 0 END), 0)::text AS "usdCost",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs"::double precision)
          FILTER (WHERE "status" = 'SUCCESS' AND "durationMs" IS NOT NULL) AS "p95Ms",
        COUNT(*) FILTER (WHERE "fallbackUsed" = true)::int AS "fallbacks"
      FROM "AiModelCall"
      WHERE "createdAt" >= ${input.from} AND "createdAt" < ${input.to}
    `,
    prisma.$queryRaw<ProviderAggregateRow[]>`
      SELECT "providerCode" AS "provider",
        COUNT(*)::int AS "calls",
        COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::int AS "successful",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failed",
        COALESCE(SUM(CASE WHEN "status" = 'SUCCESS' THEN "totalTokens" ELSE 0 END), 0)::bigint AS "tokens"
      FROM "AiModelCall"
      WHERE "createdAt" >= ${input.from} AND "createdAt" < ${input.to}
      GROUP BY "providerCode" ORDER BY "calls" DESC LIMIT 8
    `,
    prisma.aiAgentRun.groupBy({
      by: ["status"],
      where: { startedAt: where },
      _count: { _all: true },
    }),
    Promise.all([
      import("@/lib/ai/mcp/registry"),
      import("@/lib/ai/mcp/bindings"),
    ]).then(([registry, bindings]) => ({
      certifiedServers: registry.listCertifiedMcpServers().length,
      enabledBindings: bindings.listEnabledMcpToolBindings().length,
      reachability: "NOT_MEASURED" as const,
    })),
  ]);

  const row = aggregateResult.status === "fulfilled" ? aggregateResult.value[0] : null;
  const calls = Number(row?.calls || 0);
  const successful = Number(row?.successful || 0);
  const completed = Number(row?.completed || 0);
  const costed = Number(row?.costedCalls || 0);
  const metrics = row
    ? {
        calls,
        tokens: Number(row.tokens),
        successful,
        completed,
        successRate: completed ? Math.round((successful / completed) * 1000) / 10 : null,
        usdCost: costed ? Number(row.usdCost) : null,
        costCoverage: successful ? Math.round((costed / successful) * 1000) / 10 : null,
        p95Ms: row.p95Ms === null ? null : Math.round(Number(row.p95Ms)),
        fallbacks: Number(row.fallbacks),
      }
    : null;
  const providers = providerResult.status === "fulfilled"
    ? providerResult.value.map((item) => ({
        provider: item.provider,
        calls: Number(item.calls),
        successful: Number(item.successful),
        failed: Number(item.failed),
        tokens: Number(item.tokens),
      }))
    : null;
  const agent = agentResult.status === "fulfilled"
    ? {
        runs: agentResult.value.reduce((sum, item) => sum + item._count._all, 0),
        completed: agentResult.value.filter((item) => ["COMPLETED", "SUCCESS"].includes(item.status)).reduce((sum, item) => sum + item._count._all, 0),
        budgetExhausted: agentResult.value.filter((item) => item.status === "BUDGET_EXHAUSTED").reduce((sum, item) => sum + item._count._all, 0),
        failures: agentResult.value.filter((item) => ["FAILED", "ERROR"].includes(item.status)).reduce((sum, item) => sum + item._count._all, 0),
      }
    : null;

  return {
    period: { from: input.from.toISOString(), to: input.to.toISOString(), refreshedAt },
    metrics,
    providers,
    agent,
    mcp: mcpResult.status === "fulfilled" ? mcpResult.value : null,
  };
}
