import { FINANCE_REPORT_GENERATION_EVENT_TYPE, ENTERPRISE_BULK_LIMITS } from "@/lib/enterprise/bulk-jobs/constants";
import { prisma } from "@/lib/prisma";

function durationFromPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const durationMs = (value as { durationMs?: unknown }).durationMs;
  return typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null;
}

export async function getFinanceReportQueueObservability() {
  const sampledAt = new Date();
  const since = new Date(sampledAt.getTime() - ENTERPRISE_BULK_LIMITS.financeReportObservabilityWindowMs);
  const baseWhere = { eventType: FINANCE_REPORT_GENERATION_EVENT_TYPE } as const;
  const terminalWindow = { eventType: FINANCE_REPORT_GENERATION_EVENT_TYPE, updatedAt: { gte: since } } as const;

  const [queued, processing, failedRetrying, completedLast24h, deadLast24h, durationSamples] = await Promise.all([
    prisma.enterpriseDomainEvent.count({ where: { ...baseWhere, processingStatus: "PENDING" } }),
    prisma.enterpriseDomainEvent.count({ where: { ...baseWhere, processingStatus: "PROCESSING" } }),
    prisma.enterpriseDomainEvent.count({ where: { ...baseWhere, processingStatus: "FAILED" } }),
    prisma.enterpriseDomainEvent.count({ where: { ...terminalWindow, processingStatus: "PROCESSED" } }),
    prisma.enterpriseDomainEvent.count({ where: { ...terminalWindow, processingStatus: "DEAD" } }),
    prisma.enterpriseDomainEvent.findMany({
      where: { ...terminalWindow, processingStatus: "PROCESSED" },
      select: { payloadJson: true },
      orderBy: { processedAt: "desc" },
      take: ENTERPRISE_BULK_LIMITS.financeReportDurationSampleSize,
    }),
  ]);

  const durations = durationSamples.map((item) => durationFromPayload(item.payloadJson)).filter((value): value is number => value !== null);
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : null;
  const terminalLast24h = completedLast24h + deadLast24h;

  return {
    sampledAt: sampledAt.toISOString(),
    windowMs: ENTERPRISE_BULK_LIMITS.financeReportObservabilityWindowMs,
    queued,
    processing,
    failedRetrying,
    completedLast24h,
    deadLast24h,
    terminalFailureRate: terminalLast24h ? Number((deadLast24h / terminalLast24h).toFixed(4)) : 0,
    averageDurationMs,
    durationSampleSize: durations.length,
  };
}
