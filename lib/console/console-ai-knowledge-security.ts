import "server-only";
import { prisma } from "@/lib/prisma";

export type ConsoleAiKnowledgeSecurity = {
  window: { from: string; to: string; refreshedAt: string };
  knowledge: {
    personal: Record<"READY" | "PROCESSING" | "FAILED" | "OTHER", number>;
    enterprise: Record<"READY" | "PROCESSING" | "FAILED" | "OTHER", number>;
    source: "KnowledgeDocument + EnterpriseAiKnowledgeSource";
  } | null;
  modelFailures: Array<{ reasonCode: string; status: string; calls: number }> | null;
  toolDenials: Array<{ reasonCode: string; executions: number }> | null;
  cag: { status: "NOT_INSTRUMENTED"; source: "buildAiCagPack"; cacheHitRate: null };
  alertHealth: "NOT_CONFIGURED";
};

/**
 * Operational global aggregates only. No titles, personal or enterprise IDs,
 * extracted text, prompts, citations, file paths, tool arguments or results.
 * A query error maps to UNKNOWN/null; never to zero or HEALTHY.
 */
export async function getConsoleAiKnowledgeSecurity(input: { from: Date; to: Date }): Promise<ConsoleAiKnowledgeSecurity> {
  const where = { createdAt: { gte: input.from, lt: input.to } };
  const [personal, enterprise, failedModels, deniedTools] = await Promise.allSettled([
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
    modelFailures: failedModels.status === "fulfilled"
      ? failedModels.value.map((r) => ({ reasonCode: r.reasonCode || "UNKNOWN", status: r.status, calls: r._count._all }))
      : null,
    toolDenials: deniedTools.status === "fulfilled"
      ? deniedTools.value.map((r) => ({ reasonCode: r.reasonCode || "UNKNOWN", executions: r._count._all }))
      : null,
    cag: { status: "NOT_INSTRUMENTED", source: "buildAiCagPack", cacheHitRate: null },
    alertHealth: "NOT_CONFIGURED",
  };
}
