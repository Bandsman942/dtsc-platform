import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };
const count = (source, token) => source.split(token).length - 1;

const cache = read("lib/read-cache.ts");
const redis = read("lib/redis-rest.ts");
const financeCache = read("lib/enterprise/finance/overview-read-cache.ts");
const financeSummary = read("lib/enterprise/finance/overview-summary-service.ts");
const financeRoute = read("app/api/enterprise/[organizationId]/finance/overview-summary/route.ts");
const workflowWorker = read("lib/enterprise/workflows/worker.ts");
const isolatedWorkflowWorker = read("lib/enterprise/workflows/worker-isolated.ts");
const regression = read("scripts/qa-regression-checks.mjs");

const cacheTimeout = Number(cache.match(/READ_CACHE_TIMEOUT_MS\s*=\s*(\d+)/)?.[1]);
const redisTimeout = Number(redis.match(/REDIS_REST_TIMEOUT_MS\s*=\s*(\d+)/)?.[1]);
ok(cacheTimeout === 120, "SCALE-5A: interactive read-cache timeout must remain 120 ms.");
ok(Number.isFinite(redisTimeout) && cacheTimeout < redisTimeout, "SCALE-5A: read-cache timeout must remain lower than the generic Redis timeout.");
ok(cache.includes('createHash("sha256").update(organizationId)'), "SCALE-5A: tenant cache keys must hash the organization identifier.");
ok(cache.includes("tenantDigest(input.organizationId)"), "SCALE-5A: cache key must be tenant scoped through the organization digest.");
ok(!cache.includes("${input.organizationId}"), "SCALE-5A: raw organization ids must not be embedded in cache keys.");
ok(cache.includes("Math.min(input.ttlSeconds, 5 * 60)"), "SCALE-5A: cache TTL must remain globally bounded to five minutes.");
ok(cache.includes('["GET", key]'), "SCALE-5A: cache lookup must use a single Redis GET primitive.");
ok(count(cache, "redisRestCommand<") === 1, "SCALE-5A: read-through lookup must not add extra Redis command round-trips.");
ok(!cache.includes('["INCR"'), "SCALE-5A: cache telemetry must not create an extra Redis metrics round-trip on HIT.");
ok(cache.includes("JSON.parse(cached.result)") && cache.includes("input.validate(parsed)"), "SCALE-5A: cached JSON must be parsed and schema-validated before reuse.");
ok(cache.indexOf('source: "HIT"') < cache.indexOf("const loaderStartedAt"), "SCALE-5A: a valid HIT must return before the PostgreSQL loader starts.");
ok(cache.includes('source: "FALLBACK"') && cache.includes("redisReason: cached.reason"), "SCALE-5A: Redis unavailability must fall back to the canonical loader.");
ok(cache.includes('["SETEX", key, ttlSeconds, serialized]'), "SCALE-5A: MISS results must be cached with an explicit TTL.");
ok(cache.includes('keys.map((key) => ["DEL", key])'), "SCALE-5A: invalidation must batch tenant cache deletes.");
ok(!cache.includes("NEXT_PUBLIC_"), "SCALE-5A: Redis cache configuration must remain server-only.");

ok(financeCache.includes('FINANCE_OVERVIEW_CACHE_TTL_SECONDS = 15'), "SCALE-5A: Finance Overview freshness TTL must remain 15 seconds.");
for (const prefix of [
  "SALES_INVOICE_",
  "SUPPLIER_INVOICE_",
  "PAYMENT_",
  "CASH_SESSION_",
  "RECONCILIATION_",
  "JOURNAL_ENTRY_",
  "ENTERPRISE_APPROVAL_",
  "ENTERPRISE_BUDGET_",
  "ENTERPRISE_EXPENSE_",
]) {
  ok(financeCache.includes(`"${prefix}"`), `SCALE-5A: Finance mutation prefix ${prefix} must invalidate the overview cache.`);
}
ok(financeCache.includes("financeOverviewEventInvalidatesCache"), "SCALE-5A: Finance invalidation must be driven by an explicit event predicate.");
ok(financeCache.includes("new Set("), "SCALE-5A: cache invalidation must deduplicate organizations before Redis calls.");

ok(count(financeSummary, ".count(") === 8, "SCALE-5A: canonical Finance Overview loader must retain exactly eight PostgreSQL COUNT queries.");
ok(financeSummary.includes("loadCanonicalEnterpriseFinanceOverviewSummary"), "SCALE-5A: Finance Overview must keep an explicit PostgreSQL canonical loader.");
ok(financeSummary.includes("readThroughTenantCache({"), "SCALE-5A: Finance Overview must use the tenant read-through cache.");
ok(financeSummary.includes("validate: isEnterpriseFinanceOverviewSummary"), "SCALE-5A: Finance Overview cached values must use the structural validator.");
ok(financeSummary.includes("loader: () => loadCanonicalEnterpriseFinanceOverviewSummary(organizationId)"), "SCALE-5A: cache MISS/FALLBACK must reconstruct from PostgreSQL.");

ok(financeRoute.includes('authorizeFinanceRequest(req, organizationId, "FINANCE_OVERVIEW", "view")'), "SCALE-5A: Finance Overview RBAC contract must remain unchanged.");
ok(financeRoute.includes("getEnterpriseFinanceOverviewSummaryCached"), "SCALE-5A: Finance Overview route must read through the cache contract.");
ok(financeRoute.includes("NextResponse.json(summary.value)"), "SCALE-5A: route response must preserve the existing business JSON contract.");
for (const token of ["readSource", "cacheLookupMs", "dbLoaderMs", "cacheWriteAvailable", "redisReason"]) {
  ok(financeRoute.includes(token), `SCALE-5A: route telemetry must expose technical field ${token}.`);
}
for (const sensitiveToken of ["openReceivables:", "openPayables:", "unallocatedPayments:", "invoicesToPost:"]) {
  ok(!financeRoute.includes(sensitiveToken), `SCALE-5A: route telemetry must not log Finance value ${sensitiveToken}.`);
}

for (const [label, worker] of [["workflow", workflowWorker], ["isolated workflow", isolatedWorkflowWorker]]) {
  ok(worker.includes('RETURNING "id", "attemptCount", "organizationId", "eventType"'), `SCALE-5A: ${label} worker must return tenant/event identity for invalidation.`);
  ok(worker.includes("processedEvents.push({ organizationId: event.organizationId, eventType: event.eventType })"), `SCALE-5A: ${label} worker must collect only successfully settled events.`);
  const settledIndex = worker.lastIndexOf('processingStatus: "PROCESSED"');
  const invalidationIndex = worker.lastIndexOf("const financeOverviewCacheInvalidation = await invalidateFinanceOverviewReadCacheForEvents(processedEvents)");
  ok(settledIndex >= 0 && invalidationIndex > settledIndex, `SCALE-5A: ${label} cache invalidation must happen after durable PROCESSED settlement.`);
  ok(worker.includes('.catch(() => ({ attempted: 0, redisAvailable: false, redisReason: "ERROR" as const }))'), `SCALE-5A: ${label} invalidation must fail open when Redis fails.`);
  ok(worker.includes("FOR UPDATE SKIP LOCKED"), `SCALE-5A: ${label} worker must preserve multi-instance-safe claims.`);
  for (const token of ["BANK_STATEMENT_IMPORT_EVENT_TYPE", "AUDIT_EXPORT_EVENT_TYPE", "FINANCE_REPORT_GENERATION_EVENT_TYPE"]) {
    ok(count(worker, token) >= 6, `SCALE-5A: ${label} worker must preserve SCALE-4 bulk exclusion ${token}.`);
  }
}

ok(regression.includes('await import("./qa-scale4-worker-claim-isolation.mjs")'), "SCALE-5A: SCALE-4 ownership regression gate must remain active.");
ok(regression.includes('await import("./qa-scale5a-read-cache.mjs")'), "SCALE-5A: read-cache gate must be wired into Regression QA.");

if (failures.length) {
  console.error("SCALE-5A tenant read cache QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("SCALE-5A tenant read cache QA passed: tenant-scoped Redis reads are bounded, validated, reconstructible and invalidated fail-open after workflow settlement.");
