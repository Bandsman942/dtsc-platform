import { randomUUID } from "node:crypto";
import { DocumentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  KNOWLEDGE_INDEX_ENTITY_TYPE,
  KNOWLEDGE_INDEX_EVENT_TYPE,
  KNOWLEDGE_INDEX_PERSONAL_SCOPE,
  KNOWLEDGE_INDEX_QUEUE_LIMITS,
} from "@/lib/knowledge-index/constants";
import { buildKnowledgeIndexEventData } from "@/lib/knowledge-index/queue";
import { prisma } from "@/lib/prisma";
import { indexPreparedKnowledgeDocument } from "@/lib/rag";

type ClaimedJob = { id: string; entityId: string; entityType: string; attemptCount: number };
type QueueSnapshotRow = { ready: bigint | number | string; processing: bigint | number | string; dead: bigint | number | string; oldestReadyAt: Date | null };
class KnowledgeIndexWorkerError extends Error {
  constructor(public code: string, public retryable = true) { super(code); this.name = "KnowledgeIndexWorkerError"; }
}
function numericCount(value: bigint | number | string | null | undefined) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function retryBackoffSeconds(attemptCount: number) { return Math.min(KNOWLEDGE_INDEX_QUEUE_LIMITS.maxBackoffSeconds, 20 * (2 ** Math.max(0, attemptCount - 1))); }

async function recoverStaleJobs() {
  const staleBefore = new Date(Date.now() - KNOWLEDGE_INDEX_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  return prisma.enterpriseDomainEvent.updateMany({
    where: { eventType: KNOWLEDGE_INDEX_EVENT_TYPE, processingStatus: "PROCESSING", lockedAt: { lt: staleBefore } },
    data: { processingStatus: "FAILED", availableAt: new Date(), lockedAt: null, lockedBy: null, lastError: "KNOWLEDGE_INDEX_STALE_LEASE_RECOVERED" },
  });
}

async function recoverUnqueuedDocuments() {
  const olderThan = new Date(Date.now() - KNOWLEDGE_INDEX_QUEUE_LIMITS.orphanRecoveryAgeSeconds * 1000);
  const rows = await prisma.knowledgeDocument.findMany({
    where: { status: DocumentStatus.PROCESSING, extractedText: { not: null }, updatedAt: { lt: olderThan } },
    select: { id: true, organizationId: true },
    orderBy: { updatedAt: "asc" },
    take: KNOWLEDGE_INDEX_QUEUE_LIMITS.orphanRecoveryBatchSize,
  });
  if (!rows.length) return 0;
  const existing = await prisma.enterpriseDomainEvent.findMany({
    where: { eventType: KNOWLEDGE_INDEX_EVENT_TYPE, entityId: { in: rows.map((row) => row.id) } },
    select: { entityId: true },
  });
  const existingIds = new Set(existing.map((row) => row.entityId));
  const missing = rows.filter((row) => !existingIds.has(row.id));
  if (missing.length) await prisma.enterpriseDomainEvent.createMany({ data: missing.map((row) => buildKnowledgeIndexEventData({ documentId: row.id, organizationId: row.organizationId })), skipDuplicates: true });
  return missing.length;
}

export async function getKnowledgeIndexQueueSnapshot() {
  const sampledAt = new Date();
  const leaseBefore = new Date(sampledAt.getTime() - KNOWLEDGE_INDEX_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  try {
    const [row] = await prisma.$queryRaw<QueueSnapshotRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "eventType" = ${KNOWLEDGE_INDEX_EVENT_TYPE} AND "processingStatus" IN ('PENDING','FAILED') AND "availableAt" <= NOW() AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})) AS "ready",
        COUNT(*) FILTER (WHERE "eventType" = ${KNOWLEDGE_INDEX_EVENT_TYPE} AND "processingStatus" = 'PROCESSING' AND "lockedAt" >= ${leaseBefore}) AS "processing",
        COUNT(*) FILTER (WHERE "eventType" = ${KNOWLEDGE_INDEX_EVENT_TYPE} AND "processingStatus" = 'DEAD') AS "dead",
        MIN("availableAt") FILTER (WHERE "eventType" = ${KNOWLEDGE_INDEX_EVENT_TYPE} AND "processingStatus" IN ('PENDING','FAILED') AND "availableAt" <= NOW()) AS "oldestReadyAt"
      FROM "EnterpriseDomainEvent"
    `);
    const oldestReadyAt = row?.oldestReadyAt ? new Date(row.oldestReadyAt) : null;
    return { available: true, ready: numericCount(row?.ready), processing: numericCount(row?.processing), dead: numericCount(row?.dead), oldestReadyAgeMs: oldestReadyAt ? Math.max(0, sampledAt.getTime() - oldestReadyAt.getTime()) : null, sampledAt: sampledAt.toISOString() };
  } catch { return { available: false, ready: null, processing: null, dead: null, oldestReadyAgeMs: null, sampledAt: sampledAt.toISOString() }; }
}

async function claimJobs(workerId: string, batchSize: number) {
  const leaseBefore = new Date(Date.now() - KNOWLEDGE_INDEX_QUEUE_LIMITS.workerLeaseSeconds * 1000);
  return prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
    UPDATE "EnterpriseDomainEvent"
    SET "processingStatus"='PROCESSING', "lockedAt"=NOW(), "lockedBy"=${workerId}, "attemptCount"="attemptCount"+1, "updatedAt"=NOW()
    WHERE "id" IN (
      SELECT "id" FROM "EnterpriseDomainEvent"
      WHERE "eventType"=${KNOWLEDGE_INDEX_EVENT_TYPE} AND "processingStatus" IN ('PENDING','FAILED') AND "availableAt" <= NOW() AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
      ORDER BY "availableAt" ASC, "createdAt" ASC LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    ) RETURNING "id","entityId","entityType","attemptCount"
  `);
}

async function dispatch(job: ClaimedJob) {
  if (job.entityType !== KNOWLEDGE_INDEX_ENTITY_TYPE) throw new KnowledgeIndexWorkerError("KNOWLEDGE_INDEX_ENTITY_MISMATCH", false);
  const document = await prisma.knowledgeDocument.findUnique({ where: { id: job.entityId }, select: { id: true, userId: true, organizationId: true, status: true, extractedText: true } });
  if (!document) throw new KnowledgeIndexWorkerError("KNOWLEDGE_INDEX_DOCUMENT_MISSING", false);
  if (document.status === DocumentStatus.READY) return { alreadyReady: true, chunks: null as number | null };
  if (!document.extractedText) throw new KnowledgeIndexWorkerError("KNOWLEDGE_INDEX_DOCUMENT_NOT_PREPARED", false);
  const indexed = await indexPreparedKnowledgeDocument({ documentId: document.id, userId: document.userId, organizationId: document.organizationId });
  await writeAuditLog({ userId: document.userId, action: "KNOWLEDGE_DOCUMENT_INDEXED", entity: "KnowledgeDocument", entityId: document.id, metadata: { chunks: indexed._count.chunks, queue: "durable" } });
  return { alreadyReady: false, chunks: indexed._count.chunks };
}

async function settle(job: ClaimedJob, workerId: string) {
  try {
    await dispatch(job);
    await prisma.enterpriseDomainEvent.updateMany({ where: { id: job.id, processingStatus: "PROCESSING", lockedBy: workerId }, data: { processingStatus: "PROCESSED", processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
    return "processed" as const;
  } catch (error) {
    const retryable = error instanceof KnowledgeIndexWorkerError ? error.retryable : true;
    const terminal = !retryable || job.attemptCount >= KNOWLEDGE_INDEX_QUEUE_LIMITS.maxAttempts;
    const code = error instanceof KnowledgeIndexWorkerError ? error.code : "KNOWLEDGE_INDEX_UNEXPECTED_FAILURE";
    await prisma.enterpriseDomainEvent.updateMany({ where: { id: job.id, processingStatus: "PROCESSING", lockedBy: workerId }, data: { processingStatus: terminal ? "DEAD" : "FAILED", availableAt: terminal ? new Date() : new Date(Date.now() + retryBackoffSeconds(job.attemptCount) * 1000), lockedAt: null, lockedBy: null, lastError: code } });
    return terminal ? "dead" as const : "failed" as const;
  }
}

export async function processPendingKnowledgeIndexJobs({ batchSize = KNOWLEDGE_INDEX_QUEUE_LIMITS.workerBatchSize, workerId = `knowledge-index-${randomUUID()}` }: { batchSize?: number; workerId?: string } = {}) {
  const safeBatchSize = Math.max(1, Math.min(Math.trunc(batchSize), KNOWLEDGE_INDEX_QUEUE_LIMITS.workerBatchSize));
  const [recovered, orphaned] = await Promise.all([recoverStaleJobs(), recoverUnqueuedDocuments()]);
  const queueBefore = await getKnowledgeIndexQueueSnapshot();
  const claimed = await claimJobs(workerId, safeBatchSize);
  let processed=0, failed=0, dead=0;
  for (let offset=0; offset<claimed.length; offset+=KNOWLEDGE_INDEX_QUEUE_LIMITS.workerConcurrency) {
    const outcomes = await Promise.all(claimed.slice(offset, offset+KNOWLEDGE_INDEX_QUEUE_LIMITS.workerConcurrency).map((job)=>settle(job,workerId)));
    for (const outcome of outcomes) outcome === "processed" ? processed++ : outcome === "dead" ? dead++ : failed++;
  }
  const queueAfter = await getKnowledgeIndexQueueSnapshot();
  return { workerId, claimed: claimed.length, processed, failed, dead, recovered: recovered.count, orphaned, queueBefore, queueAfter, saturated: claimed.length === safeBatchSize && queueAfter.available && (queueAfter.ready || 0) > 0 };
}

export function knowledgeIndexScopeForOrganization(organizationId: string | null) { return organizationId || KNOWLEDGE_INDEX_PERSONAL_SCOPE; }
