import "server-only";
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
  cag: { status: "NOT_INSTRUMENTED"; source: "buildAiCagPack"; cacheHitRate: null };
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
  const [personal, enterprise, failedModels, deniedTools, personalLegacy, enterpriseLegacy, personalReindex, enterpriseReindex] = await Promise.allSettled([
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
    prisma.knowledgeDocument.findMany({ where: { ...where, indexVersion: "legacy-openai-1536-v1", extractedText: { not: null } }, orderBy: { updatedAt: "asc" }, take: 25, select: { id: true } }),
    prisma.enterpriseAiKnowledgeSource.findMany({ where: { ...where, archivedAt: null, indexVersion: "legacy-openai-1536-v1", extractedText: { not: null } }, orderBy: { updatedAt: "asc" }, take: 25, select: { id: true } }),
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
      ? { maxPerDomain: 25, personalCandidates: personalReindex.value.length, enterpriseCandidates: enterpriseReindex.value.length, executable: false }
      : null,
    modelFailures: failedModels.status === "fulfilled"
      ? failedModels.value.map((r) => ({ reasonCode: safeReasonCode(r.reasonCode), status: r.status, calls: r._count._all }))
      : null,
    toolDenials: deniedTools.status === "fulfilled"
      ? deniedTools.value.map((r) => ({ reasonCode: safeReasonCode(r.reasonCode), executions: r._count._all }))
      : null,
    cag: { status: "NOT_INSTRUMENTED", source: "buildAiCagPack", cacheHitRate: null },
  };
}
