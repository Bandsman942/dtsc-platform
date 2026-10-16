import { Prisma } from "@prisma/client";

/**
 * WF-06S2E1 (#853): internal SQL lock probe ONLY.
 *
 * This is NOT a claim, a readiness grant, a worker, or a scheduler.
 * The caller supplies the canonical Prisma client, and no route / worker / cron
 * imports this module. It has SELECT privileges only in this code path.
 * Row locks are released at the end of the read-only transaction.
 *
 * Rights, paid-plan quotas, source and actor must be revalidated atomically by
 * the future #852 dispatcher. Never feed this output to startWorkflowRun.
 */
export const INERT_DISPATCH_PROBE_LIMIT = 20;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export async function inspectInertLockedWorkflowDispatchInventory({
  db, organizationId, asOf = new Date(),
}) {
  if (!db || typeof db.$transaction !== "function") {
    throw new Error("WORKFLOW_DISPATCH_PROBE_DB_REQUIRED");
  }
  if (typeof organizationId !== "string" || organizationId.length < 1
    || organizationId.length > 191 || organizationId.trim() !== organizationId) {
    throw new Error("WORKFLOW_DISPATCH_PROBE_SCOPE_INVALID");
  }
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())
    || Math.abs(Date.now() - asOf.getTime()) > MAX_CLOCK_SKEW_MS) {
    throw new Error("WORKFLOW_DISPATCH_PROBE_TIME_INVALID");
  }

  const earliest = new Date(asOf.getTime() - LOOKBACK_MS);
  // SELECT FOR UPDATE SKIP LOCKED only simulates contention for a moment.
  // JOIN must validate the tenant as an ACTIVE CLIENT, and both tenant
  // references in the schedule relation; no global/system tenant fallback.
  const rows = await db.$transaction(async (tx) => tx.$queryRaw(Prisma.sql`
    SELECT o."id", o."organizationId", o."scheduleId",
           o."workflowVersionId", o."occurrenceKey",
           o."scheduledAt", o."localDate", o."localTime",
           o."timeZone", o."revision"
    FROM "EnterpriseWorkflowScheduleOccurrence" o
    JOIN "EnterpriseWorkflowSchedule" s
      ON s."id" = o."scheduleId"
      AND s."organizationId" = o."organizationId"
      AND s."workflowVersionId" = o."workflowVersionId"
    JOIN "Organization" org ON org."id" = o."organizationId"
    WHERE o."organizationId" = ${organizationId}
      AND org."organizationType" = 'CLIENT'
      AND org."status" = 'ACTIVE'
      AND org."deletedAt" IS NULL
      AND s."status" IN ('DISABLED', 'STAGED')
      AND o."status" = 'RESERVED'
      AND o."scheduledAt" >= ${earliest}
      AND o."scheduledAt" <= ${asOf}
    ORDER BY o."scheduledAt" ASC, o."id" ASC
    LIMIT ${INERT_DISPATCH_PROBE_LIMIT + 1}
    FOR UPDATE OF o SKIP LOCKED
  `));

  const visible = rows.slice(0, INERT_DISPATCH_PROBE_LIMIT).map((item) => Object.freeze({
    organizationId: item.organizationId,
    occurrenceId: item.id,
    scheduleId: item.scheduleId,
    workflowVersionId: item.workflowVersionId,
    occurrenceKey: item.occurrenceKey,
    scheduledAt: item.scheduledAt,
    localDate: item.localDate,
    localTime: item.localTime,
    timeZone: item.timeZone,
    revision: item.revision,
  }));
  return Object.freeze({
    kind: "INERT_DISPATCH_LOCK_PROBE_ONLY",
    organizationId,
    asOf,
    limit: INERT_DISPATCH_PROBE_LIMIT,
    truncated: rows.length > INERT_DISPATCH_PROBE_LIMIT,
    // Not a total backlog: SKIP LOCKED intentionally hides locked rows.
    observed: Object.freeze(visible),
  });
}
