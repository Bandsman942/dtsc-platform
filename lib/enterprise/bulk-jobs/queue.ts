import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { bankStatementSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { enterpriseReportGenerateSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import {
  AUDIT_EXPORT_ENTITY_TYPE,
  AUDIT_EXPORT_EVENT_TYPE,
  BANK_STATEMENT_IMPORT_ENTITY_TYPE,
  BANK_STATEMENT_IMPORT_EVENT_TYPE,
  ENTERPRISE_BULK_LIMITS,
  FINANCE_REPORT_GENERATION_ENTITY_TYPE,
  FINANCE_REPORT_GENERATION_EVENT_TYPE,
  type EnterpriseBulkJobStatus,
} from "@/lib/enterprise/bulk-jobs/constants";
import { deleteEnterpriseBulkArtifact, isEnterpriseBulkStorageConfigured, uploadEnterpriseBulkArtifact } from "@/lib/enterprise/bulk-jobs/storage";

type BankStatementInput = z.infer<typeof bankStatementSchema>;
type FinanceReportInput = z.infer<typeof enterpriseReportGenerateSchema>;

export type BankStatementImportJobPayload = {
  version: 1;
  kind: "BANK_STATEMENT_IMPORT";
  actorUserId: string;
  financialAccountId: string;
  reference: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  openingBalance: string;
  closingBalance: string;
  privateDocumentId: string | null;
  expectedLineCount: number;
  stagingPath: string;
  stagingSize: number;
  sourceDigest: string;
  requestedAt: string;
};

export type AuditExportJobPayload = {
  version: 1;
  kind: "AUDIT_EXPORT";
  actorUserId: string;
  approvalId: string | null;
  requestedAt: string;
  maxRows: number;
  artifactPath?: string | null;
  artifactFilename?: string | null;
  artifactExpiresAt?: string | null;
  rowCount?: number;
  truncated?: boolean;
  purgedAt?: string | null;
};

export type FinanceReportGenerationJobPayload = {
  version: 1;
  kind: "FINANCE_REPORT_GENERATION";
  actorUserId: string;
  calculationVersion: number;
  freshnessBucket: number;
  requestDigest: string;
  requestedAt: string;
  input: FinanceReportInput;
  resultReportId?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
};

export function enterpriseBulkJobStatus(processingStatus: string): EnterpriseBulkJobStatus {
  if (processingStatus === "PROCESSED") return "COMPLETED";
  if (processingStatus === "PROCESSING") return "PROCESSING";
  if (processingStatus === "DEAD") return "DEAD";
  if (processingStatus === "FAILED") return "FAILED";
  return "QUEUED";
}

function bankImportIdempotencyKey(organizationId: string, financialAccountId: string, reference: string) {
  return `finance:bank-statement-import:${organizationId}:${financialAccountId}:${reference.trim().toLowerCase()}`;
}

function normalizeBankInput(input: BankStatementInput) {
  return {
    financialAccountId: input.financialAccountId,
    reference: input.reference,
    statementDate: input.statementDate.toISOString(),
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    currencyCode: input.currencyCode,
    openingBalance: String(input.openingBalance),
    closingBalance: String(input.closingBalance),
    privateDocumentId: input.privateDocumentId || null,
    lines: input.lines.map((line) => ({
      transactionDate: line.transactionDate.toISOString(),
      valueDate: line.valueDate?.toISOString() || null,
      description: line.description,
      reference: line.reference || null,
      counterparty: line.counterparty || null,
      debit: String(line.debit),
      credit: String(line.credit),
      runningBalance: line.runningBalance ? String(line.runningBalance) : null,
    })),
  };
}

function bankInputDigest(normalized: ReturnType<typeof normalizeBankInput>) {
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function normalizeFinanceReportInput(input: FinanceReportInput): FinanceReportInput {
  return {
    reportType: input.reportType,
    title: input.title.trim(),
    description: input.description || "",
    periodStart: input.periodStart || "",
    periodEnd: input.periodEnd || "",
    currency: input.currency || "",
    departmentId: input.departmentId || "",
    supplierId: input.supplierId || "",
    budgetId: input.budgetId || "",
    category: input.category || "",
    sourceModule: input.sourceModule || "",
    sourceEntityType: input.sourceEntityType || "",
    sourceEntityId: input.sourceEntityId || "",
  };
}

function financeReportRequestIdentity(organizationId: string, actorUserId: string, input: FinanceReportInput, now = Date.now()) {
  const calculationVersion = ENTERPRISE_BULK_LIMITS.financeReportCalculationVersion;
  const freshnessBucket = Math.floor(now / ENTERPRISE_BULK_LIMITS.financeReportFreshnessMs);
  const normalized = normalizeFinanceReportInput(input);
  const requestDigest = createHash("sha256").update(JSON.stringify({ organizationId, actorUserId, calculationVersion, freshnessBucket, input: normalized })).digest("hex");
  return { calculationVersion, freshnessBucket, normalized, requestDigest, idempotencyKey: `finance:report-generation:${organizationId}:${requestDigest}` };
}

function bankJobPayload(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as unknown as Partial<BankStatementImportJobPayload>;
  if (payload.version !== 1 || payload.kind !== "BANK_STATEMENT_IMPORT") return null;
  return payload;
}

async function validateBankStatementQueueInput(
  organizationId: string,
  input: BankStatementInput,
  { allowFailedResume = false }: { allowFailedResume?: boolean } = {},
) {
  const [account, statement] = await Promise.all([
    prisma.enterpriseFinancialAccount.findFirst({
      where: { id: input.financialAccountId, organizationId, accountType: { in: ["BANK", "MOBILE_MONEY"] }, status: "ACTIVE" },
      select: { id: true, currencyCode: true },
    }),
    prisma.enterpriseBankStatement.findFirst({
      where: { organizationId, reference: input.reference },
      select: { id: true, status: true, financialAccountId: true, currencyCode: true },
    }),
  ]);
  if (!account || account.currencyCode !== input.currencyCode) throw new EnterpriseAccountingError("BANK_STATEMENT_ACCOUNT_INVALID", 409);
  if (!statement) return;
  const resumable = allowFailedResume
    && statement.status === "IMPORT_FAILED"
    && statement.financialAccountId === input.financialAccountId
    && statement.currencyCode === input.currencyCode;
  if (!resumable) throw new EnterpriseAccountingError("BANK_STATEMENT_REFERENCE_ALREADY_EXISTS", 409, { statementId: statement.id, status: statement.status });
}

async function stageNormalizedBankInput(organizationId: string, reference: string, normalized: ReturnType<typeof normalizeBankInput>) {
  return uploadEnterpriseBulkArtifact({
    organizationId,
    category: "bank-statement-import",
    filename: `bank-statement-${reference}.json`,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ version: 1, input: normalized }),
  });
}

export async function enqueueBankStatementImport(organizationId: string, actorUserId: string, input: BankStatementInput) {
  if (!isEnterpriseBulkStorageConfigured()) throw new EnterpriseAccountingError("BANK_STATEMENT_BULK_STORAGE_NOT_CONFIGURED", 503);
  const idempotencyKey = bankImportIdempotencyKey(organizationId, input.financialAccountId, input.reference);
  const existing = await prisma.enterpriseDomainEvent.findUnique({ where: { idempotencyKey } });
  if (existing && existing.processingStatus !== "DEAD") return existing;

  const normalized = normalizeBankInput(input);
  const sourceDigest = bankInputDigest(normalized);

  if (existing?.processingStatus === "DEAD") {
    const previous = bankJobPayload(existing.payloadJson);
    if (!previous?.sourceDigest) {
      throw new EnterpriseAccountingError("BANK_STATEMENT_RETRY_PAYLOAD_UNVERIFIED", 409, { jobId: existing.id });
    }
    if (
      previous.financialAccountId !== normalized.financialAccountId
      || previous.reference !== normalized.reference
      || previous.currencyCode !== normalized.currencyCode
      || previous.expectedLineCount !== normalized.lines.length
      || previous.sourceDigest !== sourceDigest
    ) {
      throw new EnterpriseAccountingError("BANK_STATEMENT_RETRY_PAYLOAD_MISMATCH", 409, { jobId: existing.id });
    }
    await validateBankStatementQueueInput(organizationId, input, { allowFailedResume: true });
    const restoredStaging = previous.stagingPath
      ? { path: previous.stagingPath, size: previous.stagingSize || 0 }
      : await stageNormalizedBankInput(organizationId, normalized.reference, normalized);
    return prisma.enterpriseDomainEvent.update({
      where: { id: existing.id },
      data: {
        payloadJson: {
          ...previous,
          actorUserId,
          stagingPath: restoredStaging.path,
          stagingSize: restoredStaging.size,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        processingStatus: "PENDING",
        attemptCount: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        lastError: null,
      },
    });
  }

  await validateBankStatementQueueInput(organizationId, input);
  const staging = await stageNormalizedBankInput(organizationId, normalized.reference, normalized);
  const payload: BankStatementImportJobPayload = {
    version: 1,
    kind: "BANK_STATEMENT_IMPORT",
    actorUserId,
    financialAccountId: normalized.financialAccountId,
    reference: normalized.reference,
    statementDate: normalized.statementDate,
    periodStart: normalized.periodStart,
    periodEnd: normalized.periodEnd,
    currencyCode: normalized.currencyCode,
    openingBalance: normalized.openingBalance,
    closingBalance: normalized.closingBalance,
    privateDocumentId: normalized.privateDocumentId,
    expectedLineCount: normalized.lines.length,
    stagingPath: staging.path,
    stagingSize: staging.size,
    sourceDigest,
    requestedAt: new Date().toISOString(),
  };

  try {
    return await prisma.enterpriseDomainEvent.create({
      data: {
        organizationId,
        eventType: BANK_STATEMENT_IMPORT_EVENT_TYPE,
        entityType: BANK_STATEMENT_IMPORT_ENTITY_TYPE,
        entityId: `${input.financialAccountId}:${input.reference}`,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        idempotencyKey,
        processingStatus: "PENDING",
        availableAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await deleteEnterpriseBulkArtifact({ organizationId, path: staging.path }).catch(() => undefined);
      const raced = await prisma.enterpriseDomainEvent.findUnique({ where: { idempotencyKey } });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function enqueueAuditExport({
  organizationId,
  actorUserId,
  approvalId,
  requestId,
}: {
  organizationId: string;
  actorUserId: string;
  approvalId?: string | null;
  requestId?: string | null;
}) {
  if (!isEnterpriseBulkStorageConfigured()) throw new Error("ENTERPRISE_BULK_STORAGE_NOT_CONFIGURED");
  const stableRequestId = requestId?.trim() || randomUUID();
  const idempotencyKey = `enterprise:audit-export:${organizationId}:${actorUserId}:${stableRequestId}`;
  const existing = await prisma.enterpriseDomainEvent.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  const payload: AuditExportJobPayload = {
    version: 1,
    kind: "AUDIT_EXPORT",
    actorUserId,
    approvalId: approvalId || null,
    requestedAt: new Date().toISOString(),
    maxRows: ENTERPRISE_BULK_LIMITS.auditExportMaxRows,
  };
  return prisma.enterpriseDomainEvent.create({
    data: {
      organizationId,
      eventType: AUDIT_EXPORT_EVENT_TYPE,
      entityType: AUDIT_EXPORT_ENTITY_TYPE,
      entityId: stableRequestId,
      payloadJson: payload as unknown as Prisma.InputJsonValue,
      idempotencyKey,
      processingStatus: "PENDING",
      availableAt: new Date(),
    },
  });
}

export async function enqueueFinanceReportGeneration(organizationId: string, actorUserId: string, input: FinanceReportInput) {
  const identity = financeReportRequestIdentity(organizationId, actorUserId, input);
  const existing = await prisma.enterpriseDomainEvent.findUnique({ where: { idempotencyKey: identity.idempotencyKey } });
  if (existing && existing.processingStatus !== "DEAD") return existing;

  const requestedAt = new Date().toISOString();
  const payload: FinanceReportGenerationJobPayload = {
    version: 1,
    kind: "FINANCE_REPORT_GENERATION",
    actorUserId,
    calculationVersion: identity.calculationVersion,
    freshnessBucket: identity.freshnessBucket,
    requestDigest: identity.requestDigest,
    requestedAt,
    input: identity.normalized,
    resultReportId: null,
    completedAt: null,
    durationMs: null,
  };

  if (existing?.processingStatus === "DEAD") {
    return prisma.enterpriseDomainEvent.update({
      where: { id: existing.id },
      data: {
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        processingStatus: "PENDING",
        attemptCount: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        lastError: null,
      },
    });
  }

  try {
    return await prisma.enterpriseDomainEvent.create({
      data: {
        organizationId,
        eventType: FINANCE_REPORT_GENERATION_EVENT_TYPE,
        entityType: FINANCE_REPORT_GENERATION_ENTITY_TYPE,
        entityId: identity.requestDigest,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        idempotencyKey: identity.idempotencyKey,
        processingStatus: "PENDING",
        availableAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.enterpriseDomainEvent.findUnique({ where: { idempotencyKey: identity.idempotencyKey } });
      if (raced) return raced;
    }
    throw error;
  }
}
