import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendZohoMailWebhook, sendZohoOutboundMail } from "@/lib/zoho-mail";
import {
  ADMIN_BROADCAST_EMAIL_DELIVERY_ENTITY_TYPE,
  ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE,
  ADMIN_BROADCAST_EMAIL_PAYLOAD_EVENT_TYPE,
  ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS,
} from "@/lib/mail/broadcast-constants";

type ClaimedBroadcastEmailEvent = {
  id: string;
  attemptCount: number;
  entityType: string;
  payloadJson: Prisma.JsonValue | null;
};

type QueueSnapshotRow = {
  ready: bigint | number | string;
  processing: bigint | number | string;
  dead: bigint | number | string;
  oldestReadyAt: Date | null;
};

type MailPayload = {
  subject: string;
  message: string;
  htmlMessage?: string;
  heading?: string;
  source?: string;
};

type DeliveryPayload = {
  payloadEventId: string;
  personalized: boolean;
  recipientEmail?: string;
  recipientName?: string;
  recipientEmails?: string[];
};

class AdminBroadcastMailError extends Error {
  constructor(public code: string, public retryable = true) {
    super(code);
    this.name = "AdminBroadcastMailError";
  }
}

function objectValue(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : null;
}

function stringValue(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: Prisma.JsonValue | undefined) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : undefined;
}

function parseDeliveryPayload(value: Prisma.JsonValue | null): DeliveryPayload {
  const row = objectValue(value);
  const payloadEventId = stringValue(row?.payloadEventId);
  const personalized = row?.personalized === true;
  if (!payloadEventId) throw new AdminBroadcastMailError("ADMIN_BROADCAST_EMAIL_INVALID_DELIVERY_PAYLOAD", false);
  if (personalized) {
    const recipientEmail = stringValue(row?.recipientEmail);
    if (!recipientEmail) throw new AdminBroadcastMailError("ADMIN_BROADCAST_EMAIL_INVALID_PERSONALIZED_RECIPIENT", false);
    return {
      payloadEventId,
      personalized: true,
      recipientEmail,
      recipientName: stringValue(row?.recipientName) || "client DTSC",
    };
  }
  const recipientEmails = stringArray(row?.recipientEmails);
  if (!recipientEmails?.length) throw new AdminBroadcastMailError("ADMIN_BROADCAST_EMAIL_INVALID_RECIPIENTS", false);
  return { payloadEventId, personalized: false, recipientEmails };
}

function parseMailPayload(value: Prisma.JsonValue | null): MailPayload {
  const row = objectValue(value);
  const subject = stringValue(row?.subject);
  const message = stringValue(row?.message);
  if (!subject || !message) throw new AdminBroadcastMailError("ADMIN_BROADCAST_EMAIL_INVALID_MASTER_PAYLOAD", false);
  return {
    subject,
    message,
    htmlMessage: stringValue(row?.htmlMessage),
    heading: stringValue(row?.heading),
    source: stringValue(row?.source),
  };
}

function personalizeUserToken(content: string | undefined, name: string) {
  return content?.replace(/\{user\}/gi, name);
}

function numericCount(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function retryBackoffSeconds(attemptCount: number) {
  const seconds = 15 * (2 ** Math.max(0, attemptCount - 1));
  return Math.min(ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.maxBackoffSeconds, seconds);
}

async function recoverStaleJobs() {
  const staleBefore = new Date(Date.now() - ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  return prisma.enterpriseDomainEvent.updateMany({
    where: {
      eventType: ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE,
      processingStatus: "PROCESSING",
      lockedAt: { lt: staleBefore },
    },
    data: {
      processingStatus: "FAILED",
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "ADMIN_BROADCAST_EMAIL_STALE_LEASE_RECOVERED",
    },
  });
}

export async function getAdminBroadcastEmailQueueSnapshot() {
  const sampledAt = new Date();
  const leaseBefore = new Date(sampledAt.getTime() - ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  try {
    const [row] = await prisma.$queryRaw<QueueSnapshotRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE "eventType" = ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE}
            AND "processingStatus" IN ('PENDING', 'FAILED')
            AND "availableAt" <= NOW()
            AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
        ) AS "ready",
        COUNT(*) FILTER (
          WHERE "eventType" = ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE}
            AND "processingStatus" = 'PROCESSING'
            AND "lockedAt" IS NOT NULL
            AND "lockedAt" >= ${leaseBefore}
        ) AS "processing",
        COUNT(*) FILTER (
          WHERE "eventType" = ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE}
            AND "processingStatus" = 'DEAD'
        ) AS "dead",
        MIN("availableAt") FILTER (
          WHERE "eventType" = ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE}
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
    return { available: false, ready: null, processing: null, dead: null, oldestReadyAgeMs: null, sampledAt: sampledAt.toISOString() };
  }
}

async function claimJobs(workerId: string, batchSize: number) {
  const leaseBefore = new Date(Date.now() - ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  return prisma.$queryRaw<ClaimedBroadcastEmailEvent[]>(Prisma.sql`
    UPDATE "EnterpriseDomainEvent"
    SET "processingStatus" = 'PROCESSING',
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "attemptCount" = "attemptCount" + 1,
        "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id"
      FROM "EnterpriseDomainEvent"
      WHERE "eventType" = ${ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE}
        AND "processingStatus" IN ('PENDING', 'FAILED')
        AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "attemptCount", "entityType", "payloadJson"
  `);
}

async function dispatch(event: ClaimedBroadcastEmailEvent) {
  if (event.entityType !== ADMIN_BROADCAST_EMAIL_DELIVERY_ENTITY_TYPE) {
    throw new AdminBroadcastMailError("ADMIN_BROADCAST_EMAIL_ENTITY_MISMATCH", false);
  }
  const delivery = parseDeliveryPayload(event.payloadJson);
  const payloadEvent = await prisma.enterpriseDomainEvent.findFirst({
    where: {
      id: delivery.payloadEventId,
      eventType: ADMIN_BROADCAST_EMAIL_PAYLOAD_EVENT_TYPE,
      processingStatus: "PROCESSED",
    },
    select: { payloadJson: true },
  });
  if (!payloadEvent) throw new AdminBroadcastMailError("ADMIN_BROADCAST_EMAIL_MASTER_PAYLOAD_MISSING", false);
  const master = parseMailPayload(payloadEvent.payloadJson);
  const mail = delivery.personalized
    ? {
        ...master,
        to: [delivery.recipientEmail!],
        message: personalizeUserToken(master.message, delivery.recipientName || "client DTSC") || master.message,
        htmlMessage: personalizeUserToken(master.htmlMessage, delivery.recipientName || "client DTSC"),
      }
    : { ...master, to: delivery.recipientEmails! };

  const outbound = await sendZohoOutboundMail(mail).catch(() => ({ sent: false }));
  if (outbound.sent) return;
  const fallback = await sendZohoMailWebhook(mail).catch(() => ({ sent: false }));
  if (!fallback.sent) {
    throw new AdminBroadcastMailError("ADMIN_BROADCAST_EMAIL_PROVIDER_UNAVAILABLE", true);
  }
}

async function settleEvent(event: ClaimedBroadcastEmailEvent, workerId: string) {
  try {
    await dispatch(event);
    await prisma.enterpriseDomainEvent.updateMany({
      where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId },
      data: { processingStatus: "PROCESSED", processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    return "processed" as const;
  } catch (error) {
    const retryable = error instanceof AdminBroadcastMailError ? error.retryable : true;
    const terminal = !retryable || event.attemptCount >= ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.maxAttempts;
    const code = error instanceof AdminBroadcastMailError ? error.code : "ADMIN_BROADCAST_EMAIL_UNEXPECTED_FAILURE";
    await prisma.enterpriseDomainEvent.updateMany({
      where: { id: event.id, processingStatus: "PROCESSING", lockedBy: workerId },
      data: {
        processingStatus: terminal ? "DEAD" : "FAILED",
        availableAt: terminal ? new Date() : new Date(Date.now() + retryBackoffSeconds(event.attemptCount) * 1000),
        lockedAt: null,
        lockedBy: null,
        lastError: code,
      },
    });
    return terminal ? "dead" as const : "failed" as const;
  }
}

export async function processPendingAdminBroadcastEmailJobs({
  batchSize = ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.workerBatchSize,
  workerId = `admin-broadcast-email-${randomUUID()}`,
}: {
  batchSize?: number;
  workerId?: string;
} = {}) {
  const safeBatchSize = Math.max(1, Math.min(Math.trunc(batchSize), ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.workerBatchSize));
  const recovered = await recoverStaleJobs();
  const queueBefore = await getAdminBroadcastEmailQueueSnapshot();
  const claimed = await claimJobs(workerId, safeBatchSize);
  let processed = 0;
  let failed = 0;
  let dead = 0;

  for (let offset = 0; offset < claimed.length; offset += ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.workerConcurrency) {
    const outcomes = await Promise.all(
      claimed.slice(offset, offset + ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS.workerConcurrency).map((event) => settleEvent(event, workerId)),
    );
    for (const outcome of outcomes) {
      if (outcome === "processed") processed += 1;
      else if (outcome === "dead") dead += 1;
      else failed += 1;
    }
  }

  const queueAfter = await getAdminBroadcastEmailQueueSnapshot();
  return {
    workerId,
    claimed: claimed.length,
    processed,
    failed,
    dead,
    recovered: recovered.count,
    queueBefore,
    queueAfter,
    saturated: claimed.length === safeBatchSize && queueAfter.available && (queueAfter.ready || 0) > 0,
  };
}
