import { Prisma } from "@prisma/client";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { safeWorkflowFailureMessage } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

// Both workers use exactly the same eligibility, ownership and retry policy.
// A PROCESSING row with no lease has unknown ownership and is not stolen.
export function workflowEventReadySql(leaseBefore: Date) {
  return Prisma.sql`(
    ("processingStatus" IN ('PENDING', 'FAILED') AND "availableAt" <= NOW()
      AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore}))
    OR ("processingStatus" = 'PROCESSING' AND "lockedAt" < ${leaseBefore})
  )`;
}

export async function renewWorkflowEventLease(event: { id: string; attemptCount: number }, workerId: string) {
  const changed = await prisma.enterpriseDomainEvent.updateMany({
    where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId, attemptCount: event.attemptCount, lockedAt: { gt: new Date(Date.now() - WORKFLOW_LIMITS.workerLeaseSeconds * 1000) } },
    data: { lockedAt: new Date() },
  });
  return changed.count === 1;
}

export function workflowEventFailure(error: unknown, attemptCount: number) {
  const failure = safeWorkflowFailureMessage(error);
  return {
    failure,
    dead: attemptCount >= WORKFLOW_LIMITS.maxAttempts || failure.category !== "TRANSIENT",
    backoffSeconds: Math.min(300, 10 * Math.max(1, attemptCount)),
  };
}

/**
 * Production outbox cutover guard.
 * An explicit ISO instant is required before the Vercel cron is enabled.
 * When unset/malformed, claim NO old events: approval reconciliation may
 * still complete safely from the canonical decided EnterpriseApproval.
 * Non-production QA continues to exercise historical replay fixtures.
 */
export function workflowEventClaimCutover(now: Date = new Date()): Date {
  if (process.env.VERCEL_ENV !== "production") return new Date(0);
  const value = process.env.WORKFLOW_EVENT_CUTOVER_AT;
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return new Date("9999-12-31T00:00:00.000Z");
  }
  const parsed = new Date(value);
  // Reject stale cutover choices, future skew and invalid dates.
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value ||
    parsed.getTime() > now.getTime() + 5 * 60_000) {
    return new Date("9999-12-31T00:00:00.000Z");
  }
  return parsed;
}
