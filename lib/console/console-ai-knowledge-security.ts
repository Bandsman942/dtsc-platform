import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ConsoleAiKnowledgeSecurity = {
  window: { from: string; to: string; refreshedAt: string };
  knowledge: {
    personal: Record<"READY" | "PROCESSING" | "FAILED" | "OTHER", number>;
    enterprise: Record<"READY" | "PROCESSING" | "FAILED" | "OTHER", number>;
    source: "KnowledgeDocument + EnterpriseAiKnowledgeSource";
  } | null;
  indexing: { legacyPersonal: number; versionedPersonal: number; legacyEnterprise: number; versionedEnterprise: number; source: string } | null;
  reindexPreview: { maxPerDomain: 25; personalCandidates: number; enterpriseCandidates: number; executable: false } | null;
  modelFailures: Array<{ reasonCode: string; status: string; calls: number }> | null;
  toolDenials: Array<{ reasonCode: string; executions: number }> | null;
  cag: {
    status: "MEASURED" | "NO_OBSERVATIONS" | "UNAVAILABLE";
    source: "ApiLog.metadata.cagCacheHit";
    cacheHitRate: number | null;
    hits: number | null;
    misses: number | null;
  };
  citationProof: { status: "NOT_INSTRUMENTED"; certifiedUsageCount: null };
  citationAttachments: {
    assistantMessagesWithCandidates: number;
    attachedCandidates: number;
    source: "EnterpriseAiMessage.citationsJson";
    meaning: "RETRIEVAL_CANDIDATES_NOT_PROVEN_USED";
  } | null;
};

/**
 * Operational global aggregates only. No titles, personal or enterprise IDs,
 * extracted text, prompts, citations, file paths, tool arguments or results.
 * A query error maps to UNKNOWN/null; never to zero or HEALTHY.
 */
// A stored reason must never be treated as safe, displayable user content.
// Only machine-readable reason codes are projected to global administration.
function safeReasonCode(value: string | null) {
  return value && /^[A-Z][A-Z0-9_]{1,119}$/.test(value) ? value : "UNKNOWN";
}

export async function getConsoleAiKnowledgeSecurity(input: { from: Date; to: Date }): Promise<ConsoleAiKnowledgeSecurity> {
  const where = { createdAt: { gte: input.from, lt: input.to } };
  const [personal, enterprise, failedModels, deniedTools, personalLegacy, enterpriseLegacy, personalReindex, enterpriseReindex, citationAttachments, cagObservations] = await Promise.allSettled([
    prisma.knowledgeDocument.groupBy({
      by: ["status"], where,
      _count: { _all: true },
    }),
    prisma.enterpriseAiKnowledgeSource.groupBy({
      by: ["status"], where: { ...where, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.aiModelCall.groupBy({
      by: ["status", "reasonCode"],
      where: { ...where, status: { in: ["FAILED", "CANCELLED"] } },
      _count: { _all: true },
      orderBy: { _count: { status: "desc" } },
      take: 10,
    }),
    prisma.aiToolExecution.groupBy({
      by: ["reasonCode"],
      where: { ...where, status: "DENIED" },
      _count: { _all: true },
      orderBy: { _count: { reasonCode: "desc" } },
      take: 10,
    }),
    prisma.knowledgeDocument.count({ where: { ...where, indexVersion: "legacy-openai-1536-v1" } }),
    prisma.enterpriseAiKnowledgeSource.count({ where: { ...where, archivedAt: null, indexVersion: "legacy-openai-1536-v1" } }),
    prisma.knowledgeDocument.count({ where: { ...where, indexVersion: "legacy-openai-1536-v1", extractedText: { not: null } } }),
    prisma.enterpriseAiKnowledgeSource.count({ where: { ...where, archivedAt: null, indexVersion: "legacy-openai-1536-v1", extractedText: { not: null } } }),
    // Aggregate only: neither citation payload, source IDs nor message content
    // leave PostgreSQL. An attached retrieval candidate is NOT proof that the
    // model actually referenced it in its generated answer.
    prisma.$queryRaw<Array<{ assistantMessagesWithCandidates: number; attachedCandidates: number }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE jsonb_array_length(
          CASE WHEN jsonb_typeof("citationsJson") = 'array' THEN "citationsJson" ELSE '[]'::jsonb END
        ) > 0)::int AS "assistantMessagesWithCandidates",
        COALESCE(SUM(jsonb_array_length(
          CASE WHEN jsonb_typeof("citationsJson") = 'array' THEN "citationsJson" ELSE '[]'::jsonb END
        )), 0)::int AS "attachedCandidates"
      FROM "EnterpriseAiMessage"
      WHERE "createdAt" >= ${input.from} AND "createdAt" < ${input.to}
        AND "role" = 'assistant' AND "deletedAt" IS NULL
    `),
    // The CAG builder already persists per-request boolean cacheHit in
    // ApiLog metadata. Observe actual local-cache hits/misses, not an
    // invented Redis/global hit rate. This reads no metadata values beyond
    // the bool equality checks and projects aggregate counts only.
    prisma.$queryRaw<Array<{ hits: number; misses: number }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "metadata"->>'cagCacheHit' = 'true')::int AS "hits",
        COUNT(*) FILTER (WHERE "metadata"->>'cagCacheHit' = 'false')::int AS "misses"
      FROM "ApiLog"
      WHERE "path" IN ('/api/chat/v2', '/api/chat/agent', '/api/enterprise/ai/chat', '/api/enterprise/ai/agent')
        AND "createdAt" >= ${input.from} AND "createdAt" < ${input.to}
        AND jsonb_typeof("metadata"->'cagCacheHit') = 'boolean'
    `),
  ]);

  const statusCounts = (rows: Array<{ status: string; _count: { _all: number } }>) => {
    const counts = { READY: 0, PROCESSING: 0, FAILED: 0, OTHER: 0 };
    for (const row of rows) {
      const key = row.status in counts ? row.status as keyof typeof counts : "OTHER";
      counts[key] += row._count._all;
    }
    return counts;
  };
  return {
    window: { from: input.from.toISOString(), to: input.to.toISOString(), refreshedAt: new Date().toISOString() },
    knowledge: personal.status === "fulfilled" && enterprise.status === "fulfilled"
      ? {
          personal: statusCounts(personal.value),
          enterprise: statusCounts(enterprise.value),
          source: "KnowledgeDocument + EnterpriseAiKnowledgeSource",
        }
      : null,
    indexing: personal.status === "fulfilled" && enterprise.status === "fulfilled"
      && personalLegacy.status === "fulfilled" && enterpriseLegacy.status === "fulfilled"
      ? {
          legacyPersonal: personalLegacy.value,
          versionedPersonal: Math.max(0, personal.value.reduce((total, entry) => total + entry._count._all, 0) - personalLegacy.value),
          legacyEnterprise: enterpriseLegacy.value,
          versionedEnterprise: Math.max(0, enterprise.value.reduce((total, entry) => total + entry._count._all, 0) - enterpriseLegacy.value),
          source: "KnowledgeDocument.indexVersion + EnterpriseAiKnowledgeSource.indexVersion",
        }
      : null,
    reindexPreview: personalReindex.status === "fulfilled" && enterpriseReindex.status === "fulfilled"
      ? { maxPerDomain: 25, personalCandidates: Math.min(25, personalReindex.value), enterpriseCandidates: Math.min(25, enterpriseReindex.value), executable: false }
      : null,
    modelFailures: failedModels.status === "fulfilled"
      ? failedModels.value.map((r) => ({ reasonCode: safeReasonCode(r.reasonCode), status: r.status, calls: r._count._all }))
      : null,
    toolDenials: deniedTools.status === "fulfilled"
      ? deniedTools.value.map((r) => ({ reasonCode: safeReasonCode(r.reasonCode), executions: r._count._all }))
      : null,
    cag: cagObservations.status !== "fulfilled"
      ? { status: "UNAVAILABLE", source: "ApiLog.metadata.cagCacheHit", cacheHitRate: null, hits: null, misses: null }
      : (() => {
          const hits = cagObservations.value[0]?.hits ?? 0;
          const misses = cagObservations.value[0]?.misses ?? 0;
          const total = hits + misses;
          return {
            status: total > 0 ? "MEASURED" as const : "NO_OBSERVATIONS" as const,
            source: "ApiLog.metadata.cagCacheHit" as const,
            cacheHitRate: total > 0 ? Math.round((1000 * hits) / total) / 10 : null,
            hits,
            misses,
          };
        })(),
    citationProof: { status: "NOT_INSTRUMENTED", certifiedUsageCount: null },
    citationAttachments: citationAttachments.status === "fulfilled"
      ? {
          assistantMessagesWithCandidates: citationAttachments.value[0]?.assistantMessagesWithCandidates ?? 0,
          attachedCandidates: citationAttachments.value[0]?.attachedCandidates ?? 0,
          source: "EnterpriseAiMessage.citationsJson",
          meaning: "RETRIEVAL_CANDIDATES_NOT_PROVEN_USED",
        }
      : null,
  };
}
