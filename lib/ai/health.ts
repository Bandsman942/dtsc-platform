import { prisma } from "@/lib/prisma";
import type { AiModelDefinition, AiProviderDefinition } from "@/lib/ai/types";

export type AiRuntimeHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "DISABLED_BY_POLICY";

export type AiRuntimeHealth = {
  status: AiRuntimeHealthStatus;
  sampleSize: number;
  successRate: number | null;
  averageFirstTokenLatencyMs: number | null;
  reason: string;
};

const HEALTH_WINDOW_MS = 15 * 60 * 1000;
const HEALTH_SAMPLE_LIMIT = 20;

export async function getAiRuntimeHealth({
  provider,
  model,
}: {
  provider: AiProviderDefinition;
  model: AiModelDefinition;
}): Promise<AiRuntimeHealth> {
  if (provider.status === "DISABLED" || provider.status === "RETIRED" || model.status === "DISABLED" || model.status === "RETIRED") {
    return { status: "DISABLED_BY_POLICY", sampleSize: 0, successRate: null, averageFirstTokenLatencyMs: null, reason: "CONFIG_DISABLED" };
  }

  const since = new Date(Date.now() - HEALTH_WINDOW_MS);
  const [attempts, latencyCalls] = await Promise.all([
    prisma.aiProviderAttempt.findMany({
      where: {
        providerCode: provider.code,
        modelCode: model.code,
        startedAt: { gte: since },
        status: { in: ["SUCCESS", "FAILED"] },
      },
      orderBy: { startedAt: "desc" },
      take: HEALTH_SAMPLE_LIMIT,
      select: { status: true },
    }).catch(() => []),
    prisma.aiModelCall.findMany({
      where: {
        providerCode: provider.code,
        modelCode: model.code,
        createdAt: { gte: since },
        status: "SUCCESS",
        firstTokenLatencyMs: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: HEALTH_SAMPLE_LIMIT,
      select: { firstTokenLatencyMs: true },
    }).catch(() => []),
  ]);

  const latencyValues = latencyCalls
    .map((call) => call.firstTokenLatencyMs)
    .filter((value): value is number => typeof value === "number" && value >= 0);
  const averageFirstTokenLatencyMs = latencyValues.length
    ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
    : null;

  if (provider.status === "DEGRADED" || model.status === "DEGRADED") {
    return { status: "DEGRADED", sampleSize: attempts.length, successRate: null, averageFirstTokenLatencyMs, reason: "CONFIG_DEGRADED" };
  }

  if (!attempts.length) {
    return { status: "HEALTHY", sampleSize: 0, successRate: null, averageFirstTokenLatencyMs, reason: "NO_RECENT_FAILURE_EVIDENCE" };
  }

  const successes = attempts.filter((attempt) => attempt.status === "SUCCESS").length;
  const successRate = successes / attempts.length;
  if (attempts.length >= 3 && successes === 0) {
    return { status: "UNAVAILABLE", sampleSize: attempts.length, successRate, averageFirstTokenLatencyMs, reason: "RECENT_ATTEMPTS_ALL_FAILED" };
  }
  if (attempts.length >= 4 && successRate < 0.65) {
    return { status: "DEGRADED", sampleSize: attempts.length, successRate, averageFirstTokenLatencyMs, reason: "RECENT_SUCCESS_RATE_LOW" };
  }
  return { status: "HEALTHY", sampleSize: attempts.length, successRate, averageFirstTokenLatencyMs, reason: "RECENT_SUCCESS_RATE_ACCEPTABLE" };
}
