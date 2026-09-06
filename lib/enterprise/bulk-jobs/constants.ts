export const BANK_STATEMENT_IMPORT_EVENT_TYPE = "FINANCE_BANK_STATEMENT_IMPORT_REQUESTED";
export const BANK_STATEMENT_IMPORT_ENTITY_TYPE = "EnterpriseBankStatementImport";
export const AUDIT_EXPORT_EVENT_TYPE = "ENTERPRISE_AUDIT_EXPORT_REQUESTED";
export const AUDIT_EXPORT_ENTITY_TYPE = "EnterpriseAuditExport";
export const FINANCE_REPORT_GENERATION_EVENT_TYPE = "FINANCE_REPORT_GENERATION_REQUESTED";
export const FINANCE_REPORT_GENERATION_ENTITY_TYPE = "EnterpriseReportGeneration";

export const ENTERPRISE_BULK_LIMITS = {
  bankStatementSyncMaxLines: 250,
  bankStatementMaxLines: 10_000,
  bankStatementInsertChunkSize: 500,
  auditExportSyncMaxRows: 500,
  auditExportMaxRows: 5_000,
  financeReportCalculationVersion: 1,
  financeReportFreshnessMs: 5 * 60 * 1000,
  financeReportExportSyncMaxRows: 500,
  financeReportTransactionMaxWaitMs: 2_000,
  financeReportTransactionTimeoutMs: 90_000,
  financeReportObservabilityWindowMs: 24 * 60 * 60 * 1000,
  financeReportDurationSampleSize: 100,
  artifactTtlMs: 24 * 60 * 60 * 1000,
  workerBatchSize: 2,
  workerConcurrency: 1,
  workerLeaseSeconds: 240,
  maxAttempts: 5,
  maxBackoffSeconds: 15 * 60,
  cleanupBatchSize: 25,
} as const;

export type EnterpriseBulkJobKind = "BANK_STATEMENT_IMPORT" | "AUDIT_EXPORT" | "FINANCE_REPORT_GENERATION";
export type EnterpriseBulkJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD";
