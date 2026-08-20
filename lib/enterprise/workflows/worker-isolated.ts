import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { enqueueCrossModuleProjections } from "@/lib/enterprise/cross-module/projection-queue";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";
import { processWorkflowDomainEvent, resumeWaitingRuns } from "@/lib/enterprise/workflows/engine";
import { safeWorkflowFailureMessage } from "@/lib/enterprise/workflows/errors";
import { ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE } from "@/lib/mail/broadcast-constants";
import { prisma } from "@/lib/prisma";
import { WEB_PUSH_DOMAIN_EVENT_TYPE } from "@/lib/push/constants";

type ClaimedEvent = { id: string; attemptCount: number };
type QueueSnapshotRow = { ready: bigint | number | string; processing: bigint | number | string; dead: bigint | number | string; oldestReadyAt: Date | null };

type WorkflowQueueSnapshot = {
  available: boolean;
  ready: number | null;
  processing: number | null;
  dead: number | null;
  oldestReadyAgeMs: number | null;
  sampledAt: string;
};

function numericCount(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getWorkflowQueueSnapshot(): Promise<WorkflowQueueSnapshot> {
  const sampledAt = new Date();
  const leaseBefore = new Date(sampledAt.getTime() - WORKFLOW_LIMITS.workerLeaseSeconds * 1000);
  try {
    const [row] = await prisma.$queryRaw<QueueSnapshotRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "eventType" <> ${WEB_PUSH_DOMAIN_EVENT_TYPE} AND "eventType" <> ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE} AND "processingStatus" IN ('PENDING', 'FAILED') AND "availableAt" <= NOW() AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})) AS "ready",
        COUNT(*) FILTER (WHERE "eventType" <> ${WEB_PUSH_DOMAIN_EVENT_TYPE} AND "eventType" <> ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE} AND "processingStatus" = 'PROCESSING' AND "lockedAt" IS NOT NULL AND "lockedAt" >= ${leaseBefore}) AS "processing",
        COUNT(*) FILTER (WHERE "eventType" <> ${WEB_PUSH_DOMAIN_EVENT_TYPE} AND "eventType" <> ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE} AND "processingStatus" = 'DEAD') AS "dead",
        MIN("availableAt") FILTER (WHERE "eventType" <> ${WEB_PUSH_DOMAIN_EVENT_TYPE} AND "eventType" <> ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE} AND "processingStatus" IN ('PENDING', 'FAILED') AND "availableAt" <= NOW() AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})) AS "oldestReadyAt"
      FROM "EnterpriseDomainEvent"
    `);
    const oldestReadyAt = row?.oldestReadyAt ? new Date(row.oldestReadyAt) : null;
    return { available: true, ready: numericCount(row?.ready), processing: numericCount(row?.processing), dead: numericCount(row?.dead), oldestReadyAgeMs: oldestReadyAt ? Math.max(0, sampledAt.getTime() - oldestReadyAt.getTime()) : null, sampledAt: sampledAt.toISOString() };
  } catch {
    return { available: false, ready: null, processing: null, dead: null, oldestReadyAgeMs: null, sampledAt: sampledAt.toISOString() };
  }
}

async function claimPendingEvents(workerId: string, batchSize: number) {
  const leaseBefore = new Date(Date.now() - WORKFLOW_LIMITS.workerLeaseSeconds * 1000);
  return prisma.$queryRaw<ClaimedEvent[]>(Prisma.sql`
    UPDATE "EnterpriseDomainEvent"
    SET "processingStatus" = 'PROCESSING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attemptCount" = "attemptCount" + 1, "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "EnterpriseDomainEvent"
      WHERE "eventType" <> ${WEB_PUSH_DOMAIN_EVENT_TYPE}
        AND "eventType" <> ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE}
        AND "processingStatus" IN ('PENDING', 'FAILED')
        AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "attemptCount"
  `);
}

export async function processPendingWorkflowEventsIsolated({ batchSize = WORKFLOW_LIMITS.workerBatchSize, workerId = `workflow-${randomUUID()}` }: { batchSize?: number; workerId?: string } = {}) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, WORKFLOW_LIMITS.workerBatchSize));
  const queueBefore = await getWorkflowQueueSnapshot();
  const claimed = await claimPendingEvents(workerId, safeBatchSize);
  const results: Array<{ id: string; status: string; error?: string; projectionQueued?: number }> = [];

  for (const event of claimed) {
    try {
      const projectionQueue = await enqueueCrossModuleProjections(event.id);
      await processWorkflowDomainEvent(event.id);
      await prisma.enterpriseDomainEvent.updateMany({ where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId }, data: { processingStatus: "PROCESSED", processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
      results.push({ id: event.id, status: "PROCESSED", projectionQueued: projectionQueue.queued });
    } catch (error) {
      const failure = safeWorkflowFailureMessage(error);
      const dead = event.attemptCount >= WORKFLOW_LIMITS.maxAttempts || ["SECURITY", "TERMINAL"].includes(failure.category);
      const backoffSeconds = Math.min(300, 10 * Math.max(1, event.attemptCount));
      await prisma.enterpriseDomainEvent.updateMany({ where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId }, data: { processingStatus: dead ? "DEAD" : "FAILED", availableAt: dead ? new Date() : new Date(Date.now() + backoffSeconds * 1000), lockedAt: null, lockedBy: null, lastError: `${failure.code}: ${failure.message}`.slice(0, 1000) } });
      results.push({ id: event.id, status: dead ? "DEAD" : "FAILED", error: failure.code });
    }
  }

  const resumedRuns = await resumeWaitingRuns();
  const queueAfter = await getWorkflowQueueSnapshot();
  return {
    workerId,
    claimed: claimed.length,
    results,
    resumedRuns: resumedRuns.map((run) => ({ id: run.id, status: run.status })),
    queueBefore,
    queueAfter,
    saturated: claimed.length === safeBatchSize && queueAfter.available && (queueAfter.ready || 0) > 0,
  };
}
