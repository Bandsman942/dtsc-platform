/**
 * Role-scoped execution observability derived from existing run timestamps.
 * No additional billing authority, persistent copy, user payload or secret.
 */
export type WorkflowObservationRow = {
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

export type WorkflowTimingMetrics = {
  sampledAt: string;
  windowDays: number;
  sampleSize: number;
  sampleLimit: number;
  capped: boolean;
  completedSamples: number;
  durationUnit: "ms";
  completedLatency: { p50: number | null; p95: number | null; p99: number | null };
  waitingSamples: number;
  oldestWaitingAgeMs: number | null;
};

function percentile(sorted: number[], percent: number): number | null {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * percent;
  const floor = Math.floor(position);
  const weight = position - floor;
  return Math.round(sorted[floor] + ((sorted[Math.min(floor + 1, sorted.length - 1)] - sorted[floor]) * weight));
}

export function summarizeWorkflowTiming(rows: WorkflowObservationRow[], now: Date, limit: number, windowDays = 30): WorkflowTimingMetrics {
  const nowMs = now.getTime();
  const durations = rows
    .filter((row) => row.completedAt && ["COMPLETED", "REJECTED"].includes(row.status))
    .map((row) => row.completedAt!.getTime() - row.startedAt.getTime())
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const waits = rows
    .filter((row) => ["WAITING_APPROVAL", "WAITING_TIME", "BLOCKED"].includes(row.status))
    .map((row) => nowMs - row.updatedAt.getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);
  return {
    sampledAt: now.toISOString(),
    windowDays,
    sampleSize: rows.length,
    sampleLimit: limit,
    capped: rows.length >= limit,
    completedSamples: durations.length,
    durationUnit: "ms",
    completedLatency: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), p99: percentile(durations, 0.99) },
    waitingSamples: waits.length,
    oldestWaitingAgeMs: waits.length ? Math.max(...waits) : null,
  };
}
