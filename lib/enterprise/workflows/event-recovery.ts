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
