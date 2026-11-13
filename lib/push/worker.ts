import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  WEB_PUSH_DOMAIN_ENTITY_TYPE,
  WEB_PUSH_DOMAIN_EVENT_TYPE,
  WEB_PUSH_QUEUE_LIMITS,
} from "@/lib/push/constants";
import { dispatchStoredPushNotification, WebPushDispatchError } from "@/lib/push/sender";

type ClaimedPushEvent = {
  id: string;
  attemptCount: number;
  entityId: string;
  entityType: string;
  organizationId: string;
};

type QueueSnapshotRow = {
  ready: bigint | number | string;
  processing: bigint | number | string;
  dead: bigint | number | string;
  oldestReadyAt: Date | null;
};

export type WebPushQueueSnapshot = {
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

function retryBackoffSeconds(attemptCount: number) {
  const seconds = 10 * (2 ** Math.max(0, attemptCount - 1));
  return Math.min(WEB_PUSH_QUEUE_LIMITS.maxBackoffSeconds, seconds);
}

function errorCode(error: unknown) {
  return error instanceof WebPushDispatchError ? error.code : "WEB_PUSH_UNEXPECTED_FAILURE";
}

function isRetryable(error: unknown) {
  return error instanceof WebPushDispatchError ? error.retryable : true;
}

async function recoverStalePushJobs() {
  const staleBefore = new Date(Date.now() - WEB_PUSH_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  return prisma.enterpriseDomainEvent.updateMany({
    where: {
      eventType: WEB_PUSH_DOMAIN_EVENT_TYPE,
      processingStatus: "PROCESSING",
      lockedAt: { lt: staleBefore },
    },
    data: {
      processingStatus: "FAILED",
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "WEB_PUSH_STALE_LEASE_RECOVERED",
    },
  });
}

export async function getWebPushQueueSnapshot(): Promise<WebPushQueueSnapshot> {
  const sampledAt = new Date();
  const leaseBefore = new Date(sampledAt.getTime() - WEB_PUSH_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  try {
    const [row] = await prisma.$queryRaw<QueueSnapshotRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE "eventType" = ${WEB_PUSH_DOMAIN_EVENT_TYPE}
            AND "processingStatus" IN ('PENDING', 'FAILED')
            AND "availableAt" <= NOW()
            AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
        ) AS "ready",
        COUNT(*) FILTER (
          WHERE "eventType" = ${WEB_PUSH_DOMAIN_EVENT_TYPE}
            AND "processingStatus" = 'PROCESSING'
            AND "lockedAt" IS NOT NULL
            AND "lockedAt" >= ${leaseBefore}
        ) AS "processing",
        COUNT(*) FILTER (
          WHERE "eventType" = ${WEB_PUSH_DOMAIN_EVENT_TYPE}
            AND "processingStatus" = 'DEAD'
        ) AS "dead",
        MIN("availableAt") FILTER (
          WHERE "eventType" = ${WEB_PUSH_DOMAIN_EVENT_TYPE}
            AND "processingStatus" IN ('PENDING', 'FAILED')
            AND "availableAt" <= NOW()
            AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
        ) AS "oldestReadyAt"
      FROM "EnterpriseDomainEvent"
    `);
    const oldestReadyAt = row?.oldestReadyAt ? new Date(row.oldestReadyAt) : null;
    return {
      available: true,
      ready: numericCount(row?.ready),
      processing: numericCount(row?.processing),
      dead: numericCount(row?.dead),
      oldestReadyAgeMs: oldestReadyAt ? Math.max(0, sampledAt.getTime() - oldestReadyAt.getTime()) : null,
      sampledAt: sampledAt.toISOString(),
    };
  } catch {
    return {
      available: false,
      ready: null,
      processing: null,
      dead: null,
      oldestReadyAgeMs: null,
      sampledAt: sampledAt.toISOString(),
    };
  }
}

async function claimPendingPushJobs(workerId: string, batchSize: number) {
  const leaseBefore = new Date(Date.now() - WEB_PUSH_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  return prisma.$queryRaw<ClaimedPushEvent[]>(Prisma.sql`
    UPDATE "EnterpriseDomainEvent"
    SET "processingStatus" = 'PROCESSING',
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "attemptCount" = "attemptCount" + 1,
        "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id"
      FROM "EnterpriseDomainEvent"
      WHERE "eventType" = ${WEB_PUSH_DOMAIN_EVENT_TYPE}
        AND "processingStatus" IN ('PENDING', 'FAILED')
        AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "attemptCount", "entityId", "entityType", "organizationId"
  `);
}

export async function processPendingWebPushJobs({
  batchSize = WEB_PUSH_QUEUE_LIMITS.workerBatchSize,
  workerId = `web-push-${randomUUID()}`,
}: {
  batchSize?: number;
  workerId?: string;
} = {}) {
  const safeBatchSize = Math.max(1, Math.min(batchSize, WEB_PUSH_QUEUE_LIMITS.workerBatchSize));
  const recovered = await recoverStalePushJobs();
  const queueBefore = await getWebPushQueueSnapshot();
  const claimed = await claimPendingPushJobs(workerId, safeBatchSize);
  let processed = 0;
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  let dead = 0;

  for (const event of claimed) {
    try {
      if (event.entityType !== WEB_PUSH_DOMAIN_ENTITY_TYPE) {
        throw new WebPushDispatchError("WEB_PUSH_QUEUE_ENTITY_MISMATCH", false);
      }
      const dispatch = await dispatchStoredPushNotification({
        notificationId: event.entityId,
        expectedQueueOrganizationId: event.organizationId,
      });
      await prisma.enterpriseDomainEvent.updateMany({
        where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId },
        data: {
          processingStatus: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      processed += 1;
      if (dispatch.outcome === "DELIVERED") delivered += 1;
      else skipped += 1;
    } catch (error) {
      const terminal = !isRetryable(error) || event.attemptCount >= WEB_PUSH_QUEUE_LIMITS.maxAttempts;
      await prisma.enterpriseDomainEvent.updateMany({
        where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId },
        data: {
          processingStatus: terminal ? "DEAD" : "FAILED",
          availableAt: terminal ? new Date() : new Date(Date.now() + retryBackoffSeconds(event.attemptCount) * 1000),
          lockedAt: null,
          lockedBy: null,
          lastError: errorCode(error),
        },
      });
      if (terminal) dead += 1;
      else failed += 1;
    }
  }

  const queueAfter = await getWebPushQueueSnapshot();
  return {
    workerId,
    claimed: claimed.length,
    processed,
    delivered,
    skipped,
    failed,
    dead,
    recovered: recovered.count,
    queueBefore,
    queueAfter,
    saturated: claimed.length === safeBatchSize && queueAfter.available && (queueAfter.ready || 0) > 0,
  };
}
