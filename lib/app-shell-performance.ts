export const APP_SHELL_GLOBAL_AGGREGATE_BUDGET = 10;

export type AppShellAggregateName =
  | "unreadNotifications"
  | "unreadCollaboratorMessages"
  | "pendingEnterpriseInvitations"
  | "pendingCompanyRelationships"
  | "employeeRecord"
  | "organizationMemberships"
  | "enterpriseModules"
  | "enterpriseActivityBlocks"
  | "enterpriseAdminDecision"
  | "promotionalBanners";

type TimingEntry = { name: AppShellAggregateName; durationMs: number };

export function createAppShellPerformanceRecorder() {
  const startedAt = performance.now();
  const timings: TimingEntry[] = [];

  async function timed<T>(name: AppShellAggregateName, promise: Promise<T>): Promise<T> {
    const taskStartedAt = performance.now();
    try {
      return await promise;
    } finally {
      timings.push({ name, durationMs: Number((performance.now() - taskStartedAt).toFixed(2)) });
    }
  }

  function finish({ organizationContext }: { organizationContext: boolean }) {
    const totalMs = Number((performance.now() - startedAt).toFixed(2));
    if (process.env.DTSC_APP_SHELL_PERF_LOG === "true") {
      console.info("[dtsc:app-shell-performance]", JSON.stringify({
        totalMs,
        aggregateCount: timings.length,
        organizationContext,
        timings,
      }));
    }
    return { totalMs, aggregateCount: timings.length, timings };
  }

  return { timed, finish };
}
