import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { bankStatementSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import {
  AUDIT_EXPORT_EVENT_TYPE,
  BANK_STATEMENT_IMPORT_EVENT_TYPE,
  ENTERPRISE_BULK_LIMITS,
} from "@/lib/enterprise/bulk-jobs/constants";
import type { AuditExportJobPayload, BankStatementImportJobPayload } from "@/lib/enterprise/bulk-jobs/queue";
import { deleteEnterpriseBulkArtifact, downloadEnterpriseBulkArtifact, uploadEnterpriseBulkArtifact } from "@/lib/enterprise/bulk-jobs/storage";
import { prisma } from "@/lib/prisma";

type ClaimedJob = {
  id: string;
  organizationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payloadJson: Prisma.JsonValue | null;
  attemptCount: number;
};

type QueueSnapshotRow = {
  ready: bigint | number | string;
  processing: bigint | number | string;
  dead: bigint | number | string;
  oldestReadyAt: Date | null;
};

class EnterpriseBulkWorkerError extends Error {
  constructor(public code: string, public retryable = true) {
    super(code);
    this.name = "EnterpriseBulkWorkerError";
  }
}

function retryBackoffSeconds(attemptCount: number) {
  return Math.min(ENTERPRISE_BULK_LIMITS.maxBackoffSeconds, 20 * (2 ** Math.max(0, attemptCount - 1)));
}

function numericCount(value: bigint | number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bankPayload(job: ClaimedJob) {
  const payload = asObject(job.payloadJson) as BankStatementImportJobPayload;
  if (payload.version !== 1 || payload.kind !== "BANK_STATEMENT_IMPORT" || !payload.actorUserId || !payload.stagingPath || !payload.reference) {
    throw new EnterpriseBulkWorkerError("BANK_STATEMENT_JOB_PAYLOAD_INVALID", false);
  }
  return payload;
}

function auditPayload(job: ClaimedJob) {
  const payload = asObject(job.payloadJson) as AuditExportJobPayload;
  if (payload.version !== 1 || payload.kind !== "AUDIT_EXPORT" || !payload.actorUserId || !payload.requestedAt) {
    throw new EnterpriseBulkWorkerError("AUDIT_EXPORT_JOB_PAYLOAD_INVALID", false);
  }
  return payload;
}

async function recoverStaleJobs() {
  const staleBefore = new Date(Date.now() - ENTERPRISE_BULK_LIMITS.workerLeaseSeconds * 1000);
  return prisma.enterpriseDomainEvent.updateMany({
    where: {
      eventType: { in: [BANK_STATEMENT_IMPORT_EVENT_TYPE, AUDIT_EXPORT_EVENT_TYPE] },
      processingStatus: "PROCESSING",
      lockedAt: { lt: staleBefore },
    },
    data: {
      processingStatus: "FAILED",
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "ENTERPRISE_BULK_STALE_LEASE_RECOVERED",
    },
  });
}

export async function getEnterpriseBulkQueueSnapshot() {
  const sampledAt = new Date();
  const leaseBefore = new Date(sampledAt.getTime() - ENTERPRISE_BULK_LIMITS.workerLeaseSeconds * 1000);
  try {
    const [row] = await prisma.$queryRaw<QueueSnapshotRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE "eventType" IN (${BANK_STATEMENT_IMPORT_EVENT_TYPE}, ${AUDIT_EXPORT_EVENT_TYPE})
            AND "processingStatus" IN ('PENDING','FAILED')
            AND "availableAt" <= NOW()
            AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
        ) AS "ready",
        COUNT(*) FILTER (
          WHERE "eventType" IN (${BANK_STATEMENT_IMPORT_EVENT_TYPE}, ${AUDIT_EXPORT_EVENT_TYPE})
            AND "processingStatus" = 'PROCESSING'
            AND "lockedAt" >= ${leaseBefore}
        ) AS "processing",
        COUNT(*) FILTER (
          WHERE "eventType" IN (${BANK_STATEMENT_IMPORT_EVENT_TYPE}, ${AUDIT_EXPORT_EVENT_TYPE})
            AND "processingStatus" = 'DEAD'
        ) AS "dead",
        MIN("availableAt") FILTER (
          WHERE "eventType" IN (${BANK_STATEMENT_IMPORT_EVENT_TYPE}, ${AUDIT_EXPORT_EVENT_TYPE})
            AND "processingStatus" IN ('PENDING','FAILED')
            AND "availableAt" <= NOW()
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
  const leaseBefore = new Date(Date.now() - ENTERPRISE_BULK_LIMITS.workerLeaseSeconds * 1000);
  return prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
    UPDATE "EnterpriseDomainEvent"
    SET "processingStatus"='PROCESSING', "lockedAt"=NOW(), "lockedBy"=${workerId}, "attemptCount"="attemptCount"+1, "updatedAt"=NOW()
    WHERE "id" IN (
      SELECT "id" FROM "EnterpriseDomainEvent"
      WHERE "eventType" IN (${BANK_STATEMENT_IMPORT_EVENT_TYPE}, ${AUDIT_EXPORT_EVENT_TYPE})
        AND "processingStatus" IN ('PENDING','FAILED')
        AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseBefore})
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id","organizationId","eventType","entityType","entityId","payloadJson","attemptCount"
  `);
}

function stagingInput(raw: unknown) {
  const object = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const input = object.input && typeof object.input === "object" && !Array.isArray(object.input) ? object.input as Record<string, unknown> : {};
  const lines = Array.isArray(input.lines) ? input.lines.map((line) => {
    const item = line && typeof line === "object" && !Array.isArray(line) ? line as Record<string, unknown> : {};
    return {
      transactionDate: item.transactionDate,
      valueDate: item.valueDate || undefined,
      description: item.description,
      reference: item.reference || undefined,
      counterparty: item.counterparty || undefined,
      debit: item.debit,
      credit: item.credit,
      runningBalance: item.runningBalance || undefined,
    };
  }) : [];
  return { ...input, privateDocumentId: input.privateDocumentId || undefined, lines };
}

async function markBankStatementFailed(job: ClaimedJob) {
  if (job.eventType !== BANK_STATEMENT_IMPORT_EVENT_TYPE) return;
  const payload = bankPayload(job);
  await prisma.enterpriseBankStatement.updateMany({
    where: { organizationId: job.organizationId, reference: payload.reference, status: "IMPORTING" },
    data: { status: "IMPORT_FAILED", revision: { increment: 1 } },
  });
}

async function processBankStatement(job: ClaimedJob) {
  const payload = bankPayload(job);
  const existing = await prisma.enterpriseBankStatement.findFirst({
    where: { organizationId: job.organizationId, reference: payload.reference },
    include: { _count: { select: { lines: true } } },
  });
  if (existing?.status === "IMPORTED" && existing._count.lines === payload.expectedLineCount) {
    await deleteEnterpriseBulkArtifact({ organizationId: job.organizationId, path: payload.stagingPath }).catch(() => undefined);
    return { statementId: existing.id, lineCount: existing._count.lines, alreadyImported: true };
  }
  if (existing && (existing.financialAccountId !== payload.financialAccountId || existing.currencyCode !== payload.currencyCode)) {
    throw new EnterpriseBulkWorkerError("BANK_STATEMENT_EXISTING_RECORD_CONFLICT", false);
  }

  const stagedBlob = await downloadEnterpriseBulkArtifact({ organizationId: job.organizationId, path: payload.stagingPath });
  const stagedText = await stagedBlob.text();
  let stagedJson: unknown;
  try { stagedJson = JSON.parse(stagedText); }
  catch { throw new EnterpriseBulkWorkerError("BANK_STATEMENT_STAGING_JSON_INVALID", false); }
  const parsed = bankStatementSchema.safeParse(stagingInput(stagedJson));
  if (!parsed.success) throw new EnterpriseBulkWorkerError("BANK_STATEMENT_STAGING_SCHEMA_INVALID", false);
  const input = parsed.data;
  if (
    input.reference !== payload.reference ||
    input.financialAccountId !== payload.financialAccountId ||
    input.currencyCode !== payload.currencyCode ||
    input.lines.length !== payload.expectedLineCount
  ) throw new EnterpriseBulkWorkerError("BANK_STATEMENT_STAGING_METADATA_MISMATCH", false);

  const account = await prisma.enterpriseFinancialAccount.findFirst({
    where: { id: input.financialAccountId, organizationId: job.organizationId, accountType: { in: ["BANK", "MOBILE_MONEY"] }, status: "ACTIVE" },
    select: { id: true, currencyCode: true },
  });
  if (!account || account.currencyCode !== input.currencyCode) throw new EnterpriseBulkWorkerError("BANK_STATEMENT_ACCOUNT_INVALID", false);

  const statement = existing || await prisma.enterpriseBankStatement.create({
    data: {
      organizationId: job.organizationId,
      financialAccountId: account.id,
      reference: input.reference,
      statementDate: input.statementDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currencyCode: input.currencyCode,
      openingBalance: new Prisma.Decimal(input.openingBalance),
      closingBalance: new Prisma.Decimal(input.closingBalance),
      privateDocumentId: input.privateDocumentId || null,
      importedByUserId: payload.actorUserId,
      status: "IMPORTING",
    },
  });

  for (let offset = 0; offset < input.lines.length; offset += ENTERPRISE_BULK_LIMITS.bankStatementInsertChunkSize) {
    const chunk = input.lines.slice(offset, offset + ENTERPRISE_BULK_LIMITS.bankStatementInsertChunkSize);
    await prisma.enterpriseBankStatementLine.createMany({
      data: chunk.map((line, chunkIndex) => ({
        organizationId: job.organizationId,
        bankStatementId: statement.id,
        lineNumber: offset + chunkIndex + 1,
        transactionDate: line.transactionDate,
        valueDate: line.valueDate || null,
        description: line.description.replace(/^[=+\-@]/, "'"),
        reference: line.reference || null,
        counterparty: line.counterparty || null,
        debit: new Prisma.Decimal(line.debit),
        credit: new Prisma.Decimal(line.credit),
        currencyCode: input.currencyCode,
        runningBalance: line.runningBalance ? new Prisma.Decimal(line.runningBalance) : null,
      })),
      skipDuplicates: true,
    });
  }

  const lineCount = await prisma.enterpriseBankStatementLine.count({ where: { organizationId: job.organizationId, bankStatementId: statement.id } });
  if (lineCount !== payload.expectedLineCount) throw new EnterpriseBulkWorkerError("BANK_STATEMENT_LINE_COUNT_INCOMPLETE", true);

  await prisma.$transaction(async (tx) => {
    const current = await tx.enterpriseBankStatement.findFirst({ where: { id: statement.id, organizationId: job.organizationId } });
    if (!current) throw new EnterpriseAccountingError("BANK_STATEMENT_NOT_FOUND", 404);
    if (current.status !== "IMPORTED") {
      await tx.enterpriseBankStatement.update({ where: { id: current.id }, data: { status: "IMPORTED", revision: { increment: 1 } } });
      await publishFinanceEvent(tx, {
        organizationId: job.organizationId,
        entityType: "EnterpriseBankStatement",
        entityId: current.id,
        eventType: "BANK_STATEMENT_IMPORTED",
        summary: `Bank statement ${current.reference} imported`,
        actorUserId: payload.actorUserId,
        toStatus: "IMPORTED",
        metadataJson: { lineCount, currency: current.currencyCode, queue: "durable" },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await writeAuditLog({
    userId: payload.actorUserId,
    organizationId: job.organizationId,
    action: "ENTERPRISE_BANK_STATEMENT_IMPORTED",
    entity: "EnterpriseBankStatement",
    entityId: statement.id,
    reasonCode: "BANK_STATEMENT_DURABLE_IMPORT",
    riskLevel: "MEDIUM",
    metadata: { organizationId: job.organizationId, financialAccountId: statement.financialAccountId, reference: statement.reference, currency: statement.currencyCode, lineCount, queueJobId: job.id },
  });
  await deleteEnterpriseBulkArtifact({ organizationId: job.organizationId, path: payload.stagingPath }).catch(() => undefined);
  return { statementId: statement.id, lineCount, alreadyImported: false };
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+@]/.test(text) || /^-[^\d.,]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function validateAuditExportAccess(job: ClaimedJob, payload: AuditExportJobPayload) {
  if (!(await requireEnterpriseGovernanceAccess(payload.actorUserId, job.organizationId))) {
    throw new EnterpriseBulkWorkerError("AUDIT_EXPORT_ACCESS_REVOKED", false);
  }
  const policy = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId: job.organizationId }, select: { sensitiveExportApproval: true } });
  if (policy?.sensitiveExportApproval) {
    const approval = payload.approvalId ? await prisma.enterpriseApproval.findFirst({
      where: { id: payload.approvalId, organizationId: job.organizationId, status: "APPROVED", targetEntityType: "AuditExport", archivedAt: null },
      select: { id: true },
    }) : null;
    if (!approval) throw new EnterpriseBulkWorkerError("AUDIT_EXPORT_APPROVAL_REVOKED", false);
  }
}

async function processAuditExport(job: ClaimedJob) {
  const payload = auditPayload(job);
  await validateAuditExportAccess(job, payload);
  if (payload.artifactPath && payload.artifactExpiresAt && new Date(payload.artifactExpiresAt).getTime() > Date.now()) {
    return { artifactPath: payload.artifactPath, rowCount: payload.rowCount || 0, alreadyGenerated: true };
  }

  const where: Prisma.AuditLogWhereInput = {
    OR: [{ organizationId: job.organizationId }, { metadata: { path: ["organizationId"], equals: job.organizationId } }],
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(payload.maxRows || ENTERPRISE_BULK_LIMITS.auditExportMaxRows, ENTERPRISE_BULK_LIMITS.auditExportMaxRows),
    select: { createdAt: true, userId: true, action: true, entity: true, entityId: true, result: true, reasonCode: true, riskLevel: true, requestId: true, metadata: true },
  });
  const headers = ["createdAt", "userId", "action", "entity", "entityId", "result", "reasonCode", "riskLevel", "requestId", "metadata"];
  const csv = [headers.map(csvCell).join(","), ...rows.map((row) => [row.createdAt.toISOString(), row.userId, row.action, row.entity, row.entityId, row.result, row.reasonCode, row.riskLevel, row.requestId, row.metadata].map(csvCell).join(","))].join("\n");
  const filename = `enterprise-audit-${job.organizationId}-${new Date().toISOString().slice(0, 10)}.csv`;
  const artifact = await uploadEnterpriseBulkArtifact({
    organizationId: job.organizationId,
    category: "audit-export",
    filename,
    contentType: "text/csv; charset=utf-8",
    body: csv,
  });
  const nextPayload: AuditExportJobPayload = {
    ...payload,
    artifactPath: artifact.path,
    artifactFilename: filename,
    artifactExpiresAt: new Date(Date.now() + ENTERPRISE_BULK_LIMITS.artifactTtlMs).toISOString(),
    rowCount: rows.length,
    truncated: rows.length === ENTERPRISE_BULK_LIMITS.auditExportMaxRows,
    purgedAt: null,
  };
  await prisma.enterpriseDomainEvent.update({ where: { id: job.id }, data: { payloadJson: nextPayload as unknown as Prisma.InputJsonValue } });
  await writeAuditLog({
    userId: payload.actorUserId,
    organizationId: job.organizationId,
    action: "ENTERPRISE_AUDIT_LOG_EXPORTED",
    entity: "Organization",
    entityId: job.organizationId,
    reasonCode: "AUDIT_EXPORT_CSV_DURABLE",
    riskLevel: "HIGH",
    metadata: { rowCount: rows.length, truncated: nextPayload.truncated, queueJobId: job.id, expiresAt: nextPayload.artifactExpiresAt },
  });
  return { artifactPath: artifact.path, rowCount: rows.length, alreadyGenerated: false };
}

async function dispatch(job: ClaimedJob) {
  if (job.eventType === BANK_STATEMENT_IMPORT_EVENT_TYPE) return processBankStatement(job);
  if (job.eventType === AUDIT_EXPORT_EVENT_TYPE) return processAuditExport(job);
  throw new EnterpriseBulkWorkerError("ENTERPRISE_BULK_EVENT_UNSUPPORTED", false);
}

async function settle(job: ClaimedJob, workerId: string) {
  try {
    await dispatch(job);
    await prisma.enterpriseDomainEvent.updateMany({
      where: { id: job.id, processingStatus: "PROCESSING", lockedBy: workerId },
      data: { processingStatus: "PROCESSED", processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    return "processed" as const;
  } catch (error) {
    const retryable = error instanceof EnterpriseBulkWorkerError ? error.retryable : true;
    const terminal = !retryable || job.attemptCount >= ENTERPRISE_BULK_LIMITS.maxAttempts;
    const code = error instanceof EnterpriseBulkWorkerError ? error.code : error instanceof EnterpriseAccountingError ? error.code : "ENTERPRISE_BULK_UNEXPECTED_FAILURE";
    if (terminal) await markBankStatementFailed(job).catch(() => undefined);
    await prisma.enterpriseDomainEvent.updateMany({
      where: { id: job.id, processingStatus: "PROCESSING", lockedBy: workerId },
      data: {
        processingStatus: terminal ? "DEAD" : "FAILED",
        availableAt: terminal ? new Date() : new Date(Date.now() + retryBackoffSeconds(job.attemptCount) * 1000),
        lockedAt: null,
        lockedBy: null,
        lastError: code,
      },
    });
    return terminal ? "dead" as const : "failed" as const;
  }
}

async function purgeExpiredArtifacts() {
  const cutoff = new Date(Date.now() - ENTERPRISE_BULK_LIMITS.artifactTtlMs);
  const events = await prisma.enterpriseDomainEvent.findMany({
    where: {
      eventType: { in: [BANK_STATEMENT_IMPORT_EVENT_TYPE, AUDIT_EXPORT_EVENT_TYPE] },
      processingStatus: { in: ["PROCESSED", "DEAD"] },
      updatedAt: { lt: cutoff },
    },
    orderBy: { updatedAt: "asc" },
    take: ENTERPRISE_BULK_LIMITS.cleanupBatchSize,
  });
  let purged = 0;
  for (const event of events) {
    const payload = asObject(event.payloadJson);
    const path = event.eventType === BANK_STATEMENT_IMPORT_EVENT_TYPE ? String(payload.stagingPath || "") : String(payload.artifactPath || "");
    if (!path) continue;
    try {
      await deleteEnterpriseBulkArtifact({ organizationId: event.organizationId, path });
      const next = { ...payload } as Record<string, unknown>;
      if (event.eventType === BANK_STATEMENT_IMPORT_EVENT_TYPE) next.stagingPath = null;
      else { next.artifactPath = null; next.purgedAt = new Date().toISOString(); }
      await prisma.enterpriseDomainEvent.update({ where: { id: event.id }, data: { payloadJson: next as Prisma.InputJsonValue } });
      purged += 1;
    } catch {
      // Cleanup is best-effort. The job state remains authoritative and a later worker run retries purge.
    }
  }
  return purged;
}

export async function processPendingEnterpriseBulkJobs({
  batchSize = ENTERPRISE_BULK_LIMITS.workerBatchSize,
  workerId = `enterprise-bulk-${randomUUID()}`,
}: { batchSize?: number; workerId?: string } = {}) {
  const safeBatchSize = Math.max(1, Math.min(Math.trunc(batchSize), ENTERPRISE_BULK_LIMITS.workerBatchSize));
  const [recovered, purged] = await Promise.all([recoverStaleJobs(), purgeExpiredArtifacts()]);
  const queueBefore = await getEnterpriseBulkQueueSnapshot();
  const claimed = await claimJobs(workerId, safeBatchSize);
  let processed = 0; let failed = 0; let dead = 0;
  for (let offset = 0; offset < claimed.length; offset += ENTERPRISE_BULK_LIMITS.workerConcurrency) {
    const outcomes = await Promise.all(claimed.slice(offset, offset + ENTERPRISE_BULK_LIMITS.workerConcurrency).map((job) => settle(job, workerId)));
    for (const outcome of outcomes) {
      if (outcome === "processed") processed += 1;
      else if (outcome === "dead") dead += 1;
      else failed += 1;
    }
  }
  const queueAfter = await getEnterpriseBulkQueueSnapshot();
  return {
    workerId,
    claimed: claimed.length,
    processed,
    failed,
    dead,
    recovered: recovered.count,
    purged,
    queueBefore,
    queueAfter,
    saturated: claimed.length === safeBatchSize && queueAfter.available && (queueAfter.ready || 0) > 0,
  };
}
