import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { processWorkflowDomainEvent, resumeWaitingRuns } from "@/lib/enterprise/workflows/engine";
import { safeWorkflowFailureMessage } from "@/lib/enterprise/workflows/errors";
import { prisma } from "@/lib/prisma";

type ClaimedEvent = { id: string; attemptCount: number };

async function claimPendingEvents(workerId: string, batchSize: number) {
  const leaseBefore = new Date(Date.now() - WORKFLOW_LIMITS.workerLeaseSeconds * 1000);
  return prisma.$queryRaw<ClaimedEvent[]>(Prisma.sql`
    UPDATE "EnterpriseDomainEvent"
    SET "processingStatus" = 'PROCESSING',
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "attemptCount" = "attemptCount" + 1,
        "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id"
      FROM "EnterpriseDomainEvent"
      WHERE "processingStatus" IN ('PENDING', 'FAILED')
        AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "attemptCount"
  `);
}

export async function processPendingWorkflowEvents({ batchSize = WORKFLOW_LIMITS.workerBatchSize, workerId = `workflow-${randomUUID()}` }: { batchSize?: number; workerId?: string } = {}) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, WORKFLOW_LIMITS.workerBatchSize));
  const claimed = await claimPendingEvents(workerId, safeBatchSize);
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const event of claimed) {
    try {
      await processWorkflowDomainEvent(event.id);
      await prisma.enterpriseDomainEvent.updateMany({ where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId }, data: { processingStatus: "PROCESSED", processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
      results.push({ id: event.id, status: "PROCESSED" });
    } catch (error) {
      const failure = safeWorkflowFailureMessage(error);
      const dead = event.attemptCount >= WORKFLOW_LIMITS.maxAttempts || ["SECURITY", "TERMINAL"].includes(failure.category);
      const backoffSeconds = Math.min(300, 10 * Math.max(1, event.attemptCount));
      await prisma.enterpriseDomainEvent.updateMany({ where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId }, data: { processingStatus: dead ? "DEAD" : "FAILED", availableAt: dead ? new Date() : new Date(Date.now() + backoffSeconds * 1000), lockedAt: null, lockedBy: null, lastError: `${failure.code}: ${failure.message}`.slice(0, 1000) } });
      results.push({ id: event.id, status: dead ? "DEAD" : "FAILED", error: failure.code });
    }
  }
  const resumedRuns = await resumeWaitingRuns();
  return { workerId, claimed: claimed.length, results, resumedRuns: resumedRuns.map((run) => ({ id: run.id, status: run.status })) };
}
