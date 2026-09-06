import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const ok = (condition, message) => { if (!condition) failures.push(message); };
const count = (source, needle) => source.split(needle).length - 1;

const schema = read("prisma/enterprise-finance-reporting.prisma");
ok(schema.includes("generationKey             String?") && schema.includes("calculationVersion        Int      @default(1)"), "SCALE-4G: EnterpriseReport must persist generation identity and calculation version.");
ok(schema.includes("@@unique([organizationId, generationKey])"), "SCALE-4G: report generationKey must be tenant-scoped unique for crash/retry idempotence.");

const migration = read("prisma/migrations/20260906131500_add_enterprise_report_generation_key/migration.sql");
ok(migration.includes('ADD COLUMN "generationKey" TEXT') && migration.includes('ADD COLUMN "calculationVersion" INTEGER NOT NULL DEFAULT 1'), "SCALE-4G: additive report idempotency migration is incomplete.");
ok(migration.includes('CREATE UNIQUE INDEX "EnterpriseReport_organizationId_generationKey_key"'), "SCALE-4G: migration must enforce tenant-scoped generation uniqueness.");
ok(!/DROP\s+(TABLE|COLUMN|INDEX)/i.test(migration), "SCALE-4G: migration must remain additive.");

const workflowSchema = read("prisma/enterprise-workflow-engine.prisma");
ok(count(workflowSchema, "model EnterpriseDomainEvent {") === 1, "SCALE-4G: the canonical EnterpriseDomainEvent queue must remain singular.");
ok(!schema.includes("model EnterpriseReportJob") && !workflowSchema.includes("model EnterpriseReportJob"), "SCALE-4G: no second report jobs table is allowed.");

const constants = read("lib/enterprise/bulk-jobs/constants.ts");
for (const token of ["FINANCE_REPORT_GENERATION_REQUESTED", "EnterpriseReportGeneration", "financeReportCalculationVersion", "financeReportFreshnessMs", "financeReportExportSyncMaxRows", "financeReportTransactionMaxWaitMs", "financeReportTransactionTimeoutMs", "financeReportObservabilityWindowMs", "financeReportDurationSampleSize"]) {
  ok(constants.includes(token), `SCALE-4G: constants missing ${token}.`);
}
ok(constants.includes("5 * 60 * 1000") && constants.includes("financeReportExportSyncMaxRows: 500"), "SCALE-4G: report freshness and synchronous export budgets must be explicit and bounded.");
ok(constants.includes("financeReportTransactionTimeoutMs: 90_000") && constants.includes("workerLeaseSeconds: 240") && constants.includes("workerBatchSize: 2"), "SCALE-4G: report transaction budget must remain below the worker lease even for the canonical two-job batch.");

const queue = read("lib/enterprise/bulk-jobs/queue.ts");
for (const token of ["FinanceReportGenerationJobPayload", "enqueueFinanceReportGeneration", "FINANCE_REPORT_GENERATION_EVENT_TYPE", "requestDigest", "freshnessBucket", "calculationVersion", "actorUserId", "enterpriseDomainEvent.create"] ) {
  ok(queue.includes(token), `SCALE-4G: queue contract missing ${token}.`);
}
ok(queue.includes('createHash("sha256")') && queue.includes("organizationId, actorUserId, calculationVersion, freshnessBucket"), "SCALE-4G: idempotency must include tenant, actor visibility context, calculation version and freshness bucket.");
ok(queue.includes('processingStatus !== "DEAD"') && queue.includes('processingStatus: "PENDING"') && queue.includes("attemptCount: 0"), "SCALE-4G: identical retry and DEAD recovery must reuse the durable event contract.");
ok(!queue.includes("snapshotJson"), "SCALE-4G: financial report snapshots must never be copied into DomainEvent payloads.");

const processor = read("lib/enterprise/bulk-jobs/report-generation.ts");
for (const token of ['moduleCode: "REPORTS"', "capabilities.canCreate", "enterpriseReportGenerateSchema.safeParse", "generationKey: payload.requestDigest", "generateEnterpriseReport", 'error.code === "P2002"', "persistResult", "durationMs", "REPORT_DURABLE_GENERATION"] ) {
  ok(processor.includes(token), `SCALE-4G: worker report processor missing ${token}.`);
}
const committedLookup = processor.indexOf("const existing = await prisma.enterpriseReport.findFirst");
const calculationCall = processor.indexOf("report = await generateEnterpriseReport");
ok(committedLookup >= 0 && calculationCall >= 0 && committedLookup < calculationCall, "SCALE-4G: worker must recover an already committed snapshot before recalculating.");
ok(!processor.includes("snapshotJson") && !processor.includes("console.log"), "SCALE-4G: worker diagnostics must not log or persist financial snapshot contents outside EnterpriseReport.");

const worker = read("lib/enterprise/bulk-jobs/worker.ts");
ok(count(worker, "FINANCE_REPORT_GENERATION_EVENT_TYPE") >= 6, "SCALE-4G: report jobs must participate in stale recovery, queue metrics, claim and dispatch.");
ok(worker.includes("FOR UPDATE SKIP LOCKED") && worker.includes("retryBackoffSeconds") && worker.includes('processingStatus: terminal ? "DEAD" : "FAILED"'), "SCALE-4G: canonical atomic claim, bounded retry and DEAD semantics must be preserved.");
ok(worker.includes("processFinanceReportGenerationJob(job)"), "SCALE-4G: canonical worker must dispatch Finance report generation.");
ok(worker.includes("error instanceof EnterpriseCoreV2Error") && worker.includes("error.status >= 500"), "SCALE-4G: business 4xx report failures must be terminal while server failures remain retryable.");

const reportService = read("lib/enterprise/finance/report-service.ts");
for (const token of ["BUDGET_VS_ACTUAL", "EXPENSE_SUMMARY", "PROCUREMENT_SUMMARY", "FINANCE_OVERVIEW", "Prisma.Decimal", "resolveEnterpriseModuleCapabilities", "generationKey", "calculationVersion", "snapshotJson", "financeReportTransactionMaxWaitMs", "financeReportTransactionTimeoutMs", "Prisma.TransactionIsolationLevel.RepeatableRead"] ) {
  ok(reportService.includes(token), `SCALE-4G: report service lost required Finance contract ${token}.`);
}
ok(reportService.includes("enterpriseBudgetVisibilityWhere") && reportService.includes("enterpriseExpenseVisibilityWhere") && reportService.includes("enterprisePurchaseVisibilityWhere"), "SCALE-4G: worker calculation must still revalidate source visibility.");

const observability = read("lib/enterprise/bulk-jobs/report-observability.ts");
for (const token of ["FINANCE_REPORT_GENERATION_EVENT_TYPE", "completedLast24h", "deadLast24h", "terminalFailureRate", "averageDurationMs", "durationSampleSize", "financeReportObservabilityWindowMs"] ) {
  ok(observability.includes(token), `SCALE-4G: Finance report observability missing ${token}.`);
}
ok(!observability.includes("snapshotJson") && !observability.includes("amount"), "SCALE-4G: report observability must not expose financial result data.");
const workerRoute = read("app/api/internal/enterprise-bulk/process/route.ts");
ok(workerRoute.includes("getFinanceReportQueueObservability") && workerRoute.includes("financeReports"), "SCALE-4G: protected worker endpoint must surface Finance report duration/failure observability.");

const generateRoute = read("app/api/enterprise/[organizationId]/reports/generate/route.ts");
for (const token of ["isSameOriginRequest", "await rateLimit", 'moduleCode: "REPORTS"', 'action: "submit"', "enterpriseReportGenerateSchema.safeParse", "enqueueFinanceReportGeneration", "enterpriseBulkJobStatus", "statusUrl", "status: 202"] ) {
  ok(generateRoute.includes(token), `SCALE-4G: interactive generation route missing ${token}.`);
}
ok(!generateRoute.includes("generateEnterpriseReport("), "SCALE-4G: interactive HTTP must never perform the heavy report calculation.");

const statusRoute = read("app/api/enterprise/[organizationId]/reports/generations/[jobId]/route.ts");
for (const token of ["FINANCE_REPORT_GENERATION_EVENT_TYPE", "organizationId", "payload.actorUserId !== session.userId", "access.canSeeAll", "enterpriseReportVisibilityWhere", "enterpriseBulkJobStatus", '"Cache-Control": "private, no-store"'] ) {
  ok(statusRoute.includes(token), `SCALE-4G: tenant-scoped job status route missing ${token}.`);
}
ok(!statusRoute.includes("snapshotJson"), "SCALE-4G: job status endpoint must not expose financial snapshot content.");
ok(
  statusRoute.includes("lastError: true")
    && statusRoute.includes("failureMessage(job.lastError)")
    && !statusRoute.includes("lastError: job.lastError")
    && !statusRoute.includes('lastError: status'),
  "SCALE-4G: worker error codes may be read internally for human mapping but must not be returned as a raw status payload field.",
);

const workspace = read("components/enterprise/core-v2/enterprise-reports-workspace.tsx");
for (const token of ["REPORT_GENERATION_POLL_MS", "REPORT_GENERATION_MAX_POLLS", "sessionStorage", "generationStorageKey", "generationStatusUrl", "reports.generationQueued", "reports.generationProcessing", "reports.generationRetrying", "reports.generationReady", "reports.generationFailed", "reports.generationLeaveHint"] ) {
  ok(workspace.includes(token), `SCALE-4G: nonblocking report UX missing ${token}.`);
}
ok(workspace.includes("REPORT_GENERATION_POLL_MS = 3000") && workspace.includes("REPORT_GENERATION_MAX_POLLS = 100"), "SCALE-4G: report polling must be explicitly bounded.");
ok(workspace.includes("window.sessionStorage.setItem") && workspace.includes("window.sessionStorage.getItem"), "SCALE-4G: report job tracking must survive navigation in the browser session.");

const i18n = read("lib/enterprise-core-i18n.ts");
for (const token of ["Rapport placé en attente de génération.", "Génération du rapport en cours.", "Le rapport est prêt.", "The report is queued for generation.", "The report is being generated.", "The report is ready."] ) {
  ok(i18n.includes(token), `SCALE-4G: FR/EN durable report copy missing ${token}.`);
}

const exportRoute = read("app/api/enterprise/[organizationId]/reports/[id]/export/route.ts");
ok(exportRoute.includes("financeReportExportSyncMaxRows") && exportRoute.includes("REPORT_EXPORT_REQUIRES_DURABLE_JOB"), "SCALE-4G: report CSV route must fail closed beyond the interactive row budget.");
ok(exportRoute.includes("/^[=+@]/") && exportRoute.includes("/^-[^\\d.,]/"), "SCALE-4G: report CSV export must neutralize spreadsheet formula injection.");
ok(exportRoute.includes('"Cache-Control": "private, no-store"'), "SCALE-4G: report exports must remain private and non-cacheable.");
ok(reportService.includes("take: 500") && constants.includes("financeReportExportSyncMaxRows: 500"), "SCALE-4G: current detailed report snapshots and direct export must share the same bounded 500-row ceiling.");

const ownerE2e = read("tests/e2e/hotfix-574-finance-owner.spec.mjs");
ok(ownerE2e.includes("waitForDurableReport") && ownerE2e.includes("generateResponse.status()).toBe(202)") && ownerE2e.includes('completed.status).toBe("COMPLETED")'), "SCALE-4G: historical owner E2E must follow durable generation to completion.");
ok(ownerE2e.includes("generationKey") && ownerE2e.includes("calculationVersion") && ownerE2e.includes("snapshotJson"), "SCALE-4G: owner E2E must verify immutable idempotent snapshot persistence.");

if (failures.length) {
  console.error("FAIL SCALE-4G durable Finance reports:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS SCALE-4G durable Finance reports: canonical queue, crash-safe idempotence, bounded consistent transactions, tenant status, observability, nonblocking UX and bounded export contracts are protected.");
