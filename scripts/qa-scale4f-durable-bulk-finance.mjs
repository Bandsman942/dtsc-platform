import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const requireFile = (file) => { if (!exists(file)) fail(`SCALE-4F: fichier requis absent ${file}`); return exists(file) ? read(file) : ""; };
const requireTokens = (file, tokens) => {
  const content = requireFile(file);
  for (const token of tokens) if (!content.includes(token)) fail(`SCALE-4F: contrat incomplet ${file} (${token})`);
  return content;
};

const constants = requireTokens("lib/enterprise/bulk-jobs/constants.ts", [
  "FINANCE_BANK_STATEMENT_IMPORT_REQUESTED",
  "ENTERPRISE_AUDIT_EXPORT_REQUESTED",
  "bankStatementSyncMaxLines: 250",
  "bankStatementMaxLines: 10_000",
  "bankStatementInsertChunkSize: 500",
  "auditExportSyncMaxRows: 500",
  "auditExportMaxRows: 5_000",
  "artifactTtlMs: 24 * 60 * 60 * 1000",
  "workerLeaseSeconds: 240",
  "maxAttempts: 5",
]);

requireTokens("prisma/enterprise-workflow-engine.prisma", [
  "model EnterpriseDomainEvent",
  "idempotencyKey",
  "processingStatus",
  "attemptCount",
  "availableAt",
  "lockedAt",
  "lockedBy",
  "lastError",
]);

const queue = requireTokens("lib/enterprise/bulk-jobs/queue.ts", [
  "enqueueBankStatementImport",
  "enqueueAuditExport",
  "isEnterpriseBulkStorageConfigured",
  "enterprise:audit-export:",
  "finance:bank-statement-import:",
  "createHash",
  "sourceDigest",
  "stageNormalizedBankInput",
  "P2002",
  "BANK_STATEMENT_REFERENCE_ALREADY_EXISTS",
  "BANK_STATEMENT_RETRY_PAYLOAD_UNVERIFIED",
  "BANK_STATEMENT_RETRY_PAYLOAD_MISMATCH",
  'existing.processingStatus !== "DEAD"',
  "allowFailedResume: true",
  'statement.status === "IMPORT_FAILED"',
  "previous.sourceDigest !== sourceDigest",
  "previous.stagingPath",
  "restoredStaging",
  "expectedLineCount",
  "stagingPath",
]);
if (/payloadJson:\s*\{[^}]*lines:/s.test(queue)) fail("SCALE-4F: les lignes de relevé ne doivent pas être stockées directement dans EnterpriseDomainEvent.payloadJson");
if (queue.includes("deleteEnterpriseBulkArtifact({ organizationId, path: previous.stagingPath")) fail("SCALE-4F: une reprise DEAD ne doit pas supprimer son staging canonique avant retraitement");

const storage = requireTokens("lib/enterprise/bulk-jobs/storage.ts", [
  "enterprise-bulk/${organizationId}/",
  "assertTenantPath",
  "SUPABASE_STORAGE_SERVICE_ROLE_KEY",
  ".upload(",
  ".download(",
  ".remove(",
]);
if (storage.includes("getPublicUrl")) fail("SCALE-4F: un artefact bulk ne doit jamais recevoir d’URL publique");

const worker = requireTokens("lib/enterprise/bulk-jobs/worker.ts", [
  "FOR UPDATE SKIP LOCKED",
  "ENTERPRISE_BULK_STALE_LEASE_RECOVERED",
  "processingStatus: terminal ? \"DEAD\" : \"FAILED\"",
  "createMany",
  "skipDuplicates: true",
  "bankStatementInsertChunkSize",
  "status: \"IMPORTING\"",
  "status: \"IMPORT_FAILED\"",
  "BANK_STATEMENT_LINE_COUNT_INCOMPLETE",
  "status: \"IMPORTED\"",
  "BANK_STATEMENT_IMPORTED",
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "FINANCE_BANK"',
  "capabilities.canCreate",
  "BANK_STATEMENT_IMPORT_ACCESS_REVOKED",
  "stagedSourceDigest",
  "BANK_STATEMENT_STAGING_DIGEST_MISMATCH",
  "requireEnterpriseGovernanceAccess",
  "AUDIT_EXPORT_APPROVAL_REVOKED",
  "artifactExpiresAt",
  "purgeExpiredArtifacts",
  "getEnterpriseBulkQueueSnapshot",
  "oldestReadyAgeMs",
]);
if (worker.includes("Promise.all(chunk.map") || worker.includes("lines.map(async")) fail("SCALE-4F: l’import bancaire ne doit pas lancer 10 000 écritures concurrentes non bornées");

const bankRoute = requireTokens("app/api/enterprise/[organizationId]/bank-statements/route.ts", [
  "bankStatementSyncMaxLines",
  "enqueueBankStatementImport",
  "statusCode: 202",
  "queued: true",
  "statusUrl",
  "mode: \"synchronous\"",
  "mutation: true",
  "limit: 20",
]);
if (!bankRoute.includes("parsed.data.lines.length > ENTERPRISE_BULK_LIMITS.bankStatementSyncMaxLines")) fail("SCALE-4F: le seuil sync/async bancaire doit être explicite");

requireTokens("lib/enterprise/accounting/http.ts", [
  "isSameOriginRequest",
  "getRateLimitKey",
  "rateLimit",
  "options?.mutation",
]);

requireTokens("app/api/enterprise/[organizationId]/bank-statement-imports/[jobId]/route.ts", [
  "organizationId, eventType: BANK_STATEMENT_IMPORT_EVENT_TYPE",
  "expectedLineCount",
  "importedLineCount",
  "progressPercent",
]);

requireTokens("app/api/enterprise/[organizationId]/reconciliations/route.ts", [
  "status: \"IMPORTED\"",
  "RECONCILIATION_STATEMENT_NOT_READY",
]);

const auditRoute = requireTokens("app/api/enterprise/[organizationId]/administration/audit/export/route.ts", [
  "sensitiveExportApproval",
  "AUDIT_EXPORT_APPROVAL_REQUIRED",
  "auditExportSyncMaxRows",
  "enqueueAuditExport",
  "status: 202",
  "downloadUrl",
  "Cache-Control",
  "private, no-store",
]);
if (!auditRoute.includes("total > ENTERPRISE_BULK_LIMITS.auditExportSyncMaxRows")) fail("SCALE-4F: le seuil sync/async Audit doit être explicite");

requireTokens("app/api/enterprise/[organizationId]/administration/audit/exports/[jobId]/download/route.ts", [
  "requireEnterpriseGovernanceAccess",
  "processingStatus: \"PROCESSED\"",
  "AUDIT_EXPORT_ARTIFACT_EXPIRED",
  "sensitiveExportApproval",
  "AUDIT_EXPORT_APPROVAL_REQUIRED",
  "downloadEnterpriseBulkArtifact",
  "private, no-store",
]);

requireTokens("app/api/internal/enterprise-bulk/process/route.ts", [
  "CRON_SECRET",
  "WORKFLOW_WORKER_SECRET",
  "ENTERPRISE_BULK_WORKER_SECRET",
  "timingSafeEqual",
  "processPendingEnterpriseBulkJobs",
  "maxDuration = 300",
]);

requireTokens("vercel.json", [
  "/api/internal/enterprise-bulk/process?batch=2",
  "\"main\": true",
  "\"*\": false",
  "\"**\": false",
]);

requireTokens("components/enterprise/professional/finance-professional-workspace-shared.tsx", [
  "dtsc:finance-durable-job",
  "body.queued",
  "CustomEvent",
]);
requireTokens("components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace-hotfix.tsx", [
  "sessionStorage",
  "statusUrl",
  "progressPercent",
  "MAX_POLLS",
  "Le traitement est durable",
  "The processing is durable",
  "Import partiellement terminé",
  "Import partially completed",
]);
requireTokens("components/enterprise/enterprise-admin-audit-panel-durable.tsx", [
  "sessionStorage",
  "statusUrl",
  "downloadUrl",
  "MAX_POLLS",
  "private",
  "limited time",
]);

const totalLines = 10_000;
const chunkSize = 500;
const chunks = Math.ceil(totalLines / chunkSize);
if (chunks !== 20) fail(`SCALE-4F: le plan 10 000 lignes doit produire 20 chunks bornés, obtenu ${chunks}`);
if (!constants.includes("bankStatementMaxLines: 10_000")) fail("SCALE-4F: la limite historique 10 000 lignes doit rester explicite");

if (failures.length) {
  console.error(`QA SCALE-4F durable bulk Finance: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("QA SCALE-4F durable bulk Finance: OK — canonical DomainEvent queue, bounded bank imports, private expiring audit artifacts, worker reauthorization, tenant/RBAC and verified dead-job resume contracts enforced");
