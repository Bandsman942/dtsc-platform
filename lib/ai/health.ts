import { prisma } from "@/lib/prisma";
import type { AiModelDefinition, AiProviderDefinition } from "@/lib/ai/types";

export type AiRuntimeHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "DISABLED_BY_POLICY";

export type AiRuntimeHealth = {
  status: AiRuntimeHealthStatus;
  sampleSize: number;
  successRate: number | null;
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
    return { status: "DISABLED_BY_POLICY", sampleSize: 0, successRate: null, reason: "CONFIG_DISABLED" };
  }
  if (provider.status === "DEGRADED" || model.status === "DEGRADED") {
    return { status: "DEGRADED", sampleSize: 0, successRate: null, reason: "CONFIG_DEGRADED" };
  }

  const attempts = await prisma.aiProviderAttempt.findMany({
    where: {
      providerCode: provider.code,
      modelCode: model.code,
      startedAt: { gte: new Date(Date.now() - HEALTH_WINDOW_MS) },
      status: { in: ["SUCCESS", "FAILED"] },
    },
    orderBy: { startedAt: "desc" },
    take: HEALTH_SAMPLE_LIMIT,
    select: { status: true },
  }).catch(() => []);

  if (!attempts.length) {
    return { status: "HEALTHY", sampleSize: 0, successRate: null, reason: "NO_RECENT_FAILURE_EVIDENCE" };
  }

  const successes = attempts.filter((attempt) => attempt.status === "SUCCESS").length;
  const successRate = successes / attempts.length;
  if (attempts.length >= 3 && successes === 0) {
    return { status: "UNAVAILABLE", sampleSize: attempts.length, successRate, reason: "RECENT_ATTEMPTS_ALL_FAILED" };
  }
  if (attempts.length >= 4 && successRate < 0.65) {
    return { status: "DEGRADED", sampleSize: attempts.length, successRate, reason: "RECENT_SUCCESS_RATE_LOW" };
  }
  return { status: "HEALTHY", sampleSize: attempts.length, successRate, reason: "RECENT_SUCCESS_RATE_ACCEPTABLE" };
}
