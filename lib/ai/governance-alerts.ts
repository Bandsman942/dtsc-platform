import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const AI_ALERT_CODES = ["MODEL_FAILURES", "TOOL_DENIALS", "KNOWLEDGE_INDEX_FAILURES"] as const;
export const aiAlertRuleSchema = z.object({
  code: z.enum(AI_ALERT_CODES),
  enabled: z.boolean(),
  severity: z.enum(["WARNING", "CRITICAL"]),
  threshold: z.number().int().min(1).max(1_000_000),
  expectedRevision: z.number().int().min(0),
  reason: z.string().trim().min(8).max(500),
}).strict();

export type ConsoleAiAlert = {
  code: typeof AI_ALERT_CODES[number];
  enabled: boolean | null;
  revision: number | null;
  severity: "WARNING" | "CRITICAL" | null;
  threshold: number | null;
  total: number | null;
  state: "TRIGGERED" | "BELOW_THRESHOLD" | "DISABLED" | "NOT_CONFIGURED" | "UNAVAILABLE";
  source: string;
};
export type ConsoleAiAlertSnapshot = {
  alerts: ConsoleAiAlert[];
  period: { from: string; to: string; refreshedAt: string };
};

const sources: Record<typeof AI_ALERT_CODES[number], string> = {
  MODEL_FAILURES: "AiModelCall.status=FAILED",
  TOOL_DENIALS: "AiToolExecution.status=DENIED",
  KNOWLEDGE_INDEX_FAILURES: "KnowledgeDocument + EnterpriseAiKnowledgeSource status=FAILED",
};

/**
 * Thresholds are evaluated on the selected [from,to) window; this is a
 * visual operational signal, NOT a scheduled notification or incident.
 * Unknown telemetry can never be shown as BELOW_THRESHOLD.
 */
export async function getConsoleAiAlertSnapshot(input: { from: Date; to: Date }): Promise<ConsoleAiAlertSnapshot> {
  const where = { createdAt: { gte: input.from, lt: input.to } };
  const [rules, model, tools, personal, enterprise] = await Promise.allSettled([
    prisma.aiGovernanceAlertRule.findMany({
      where: { code: { in: [...AI_ALERT_CODES] } },
      select: { code: true, enabled: true, severity: true, threshold: true, revision: true },
      take: 10,
    }),
    prisma.aiModelCall.count({ where: { ...where, status: "FAILED" } }),
    prisma.aiToolExecution.count({ where: { ...where, status: "DENIED" } }),
    prisma.knowledgeDocument.count({ where: { ...where, status: "FAILED" } }),
    prisma.enterpriseAiKnowledgeSource.count({ where: { ...where, archivedAt: null, status: "FAILED" } }),
  ]);
  const values = {
    MODEL_FAILURES: model.status === "fulfilled" ? model.value : null,
    TOOL_DENIALS: tools.status === "fulfilled" ? tools.value : null,
    KNOWLEDGE_INDEX_FAILURES: personal.status === "fulfilled" && enterprise.status === "fulfilled" ? personal.value + enterprise.value : null,
  };
  const records = rules.status === "fulfilled" ? new Map(rules.value.map((r) => [r.code, r])) : null;
  return {
    period: { from: input.from.toISOString(), to: input.to.toISOString(), refreshedAt: new Date().toISOString() },
    alerts: AI_ALERT_CODES.map((code) => {
      const raw = records?.get(code);
      const supported = raw && (raw.severity === "WARNING" || raw.severity === "CRITICAL")
        && Number.isInteger(raw.threshold) && raw.threshold >= 1;
      const total = values[code];
      const state: ConsoleAiAlert["state"] = records === null || (raw && !supported) ? "UNAVAILABLE"
        : !raw ? "NOT_CONFIGURED"
        : !raw.enabled ? "DISABLED"
        : total === null ? "UNAVAILABLE"
        : total >= raw.threshold ? "TRIGGERED" : "BELOW_THRESHOLD";
      return {
        code, enabled: supported ? raw.enabled : null,
        revision: supported ? raw.revision : records !== null && !raw ? 0 : null,
        severity: supported ? raw.severity as "WARNING" | "CRITICAL" : null,
        threshold: supported ? raw.threshold : null,
        total, state, source: sources[code],
      };
    }),
  };
}
