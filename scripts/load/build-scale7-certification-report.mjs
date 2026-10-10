import fs from "node:fs";
import process from "node:process";

const artifactsDir = process.env.ARTIFACTS_DIR || "artifacts";
const summaryPath = `${artifactsDir}/scale7-k6-summary.json`;
const observabilityPath = `${artifactsDir}/scale7-observability.ndjson`;
const reportJsonPath = `${artifactsDir}/scale7-certification-report.json`;
const reportMarkdownPath = `${artifactsDir}/scale7-certification-report.md`;

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function metric(summary, name, key) {
  return finite(summary?.metrics?.[name]?.values?.[key]);
}
function latency(summary, name) {
  return {
    p50: metric(summary, name, "med"),
    p95: metric(summary, name, "p(95)"),
    p99: metric(summary, name, "p(99)"),
    avg: metric(summary, name, "avg"),
    max: metric(summary, name, "max"),
    count: metric(summary, name, "count"),
  };
}
function maxOf(samples, selector) {
  const values = samples.map(selector).filter((value) => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}
function readNdjson(path) {
  if (!fs.existsSync(path)) return [];
  return fs.readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
}
function safeOrigin(raw) {
  try { return new URL(raw).origin; } catch { return null; }
}

if (!fs.existsSync(summaryPath)) {
  console.error(`Missing k6 summary: ${summaryPath}`);
  process.exit(1);
}

const summary = readJson(summaryPath);
const samples = readNdjson(observabilityPath);
const targetVus = Number.parseInt(process.env.TARGET_VUS || "0", 10);
const profile = (process.env.LOAD_PROFILE || "").toLowerCase();

// One versioned expiring policy drives both k6 and the sanitized certification report.
const dashboardP99Policy = readJson("scripts/load/scale7-dashboard-p99-policy.json");
if (dashboardP99Policy.contract !== "SCALE-7-DASHBOARD-P99-TEMPORARY" ||
    dashboardP99Policy.standardP99Ms !== 2000 ||
    dashboardP99Policy.temporary?.p99Ms !== 2500 ||
    dashboardP99Policy.temporary?.targetVus !== 500 ||
    !Number.isFinite(Date.parse(dashboardP99Policy.temporary.startsAt)) ||
    !Number.isFinite(Date.parse(dashboardP99Policy.temporary.expiresAt)) ||
    Date.parse(dashboardP99Policy.temporary.expiresAt) <= Date.parse(dashboardP99Policy.temporary.startsAt)) {
  console.error("Invalid SCALE-7 Dashboard P99 policy");
  process.exit(1);
}
const policyNowMs = Date.now();
const temporaryDashboardP99Active = targetVus === dashboardP99Policy.temporary.targetVus &&
  policyNowMs >= Date.parse(dashboardP99Policy.temporary.startsAt) &&
  policyNowMs < Date.parse(dashboardP99Policy.temporary.expiresAt);
const dashboardP99LimitMs = temporaryDashboardP99Active
  ? dashboardP99Policy.temporary.p99Ms
  : dashboardP99Policy.standardP99Ms;

let authTopology = { tenantCount: null, identityCount: null };
try {
  const parsed = JSON.parse(process.env.SCALE7_AUTH_CONTEXTS_JSON || "{}");
  const tenants = Array.isArray(parsed.tenants) ? parsed.tenants : [];
  authTopology = {
    tenantCount: tenants.length,
    identityCount: tenants.reduce((count, tenant) => count + (Array.isArray(tenant?.sessionCookies) ? tenant.sessionCookies.length : 0), 0),
  };
} catch {
  authTopology = { tenantCount: null, identityCount: null };
}
const validStage = [500, 1000, 2500, 5000].includes(targetVus);
const validProfile = ["ramp", "soak", "spike"].includes(profile);

const http = {
  requests: metric(summary, "http_reqs", "count"),
  requestsPerSecond: metric(summary, "http_reqs", "rate"),
  failedRate: metric(summary, "http_req_failed", "rate"),
  checksRate: metric(summary, "checks", "rate"),
  tenantIsolationRate: metric(summary, "tenant_isolation_pass", "rate"),
  latencyMs: latency(summary, "http_req_duration"),
  workloads: {
    dashboard: latency(summary, "http_req_duration{workload:dashboard-read}"),
    enterprise: latency(summary, "http_req_duration{workload:enterprise-read}"),
    shop: latency(summary, "http_req_duration{workload:shop-read}"),
    collaboration: latency(summary, "http_req_duration{workload:collaboration-read}"),
    ai: latency(summary, "http_req_duration{workload:ai-request}"),
  },
  serverPhases: {
    shop: { access: latency(summary, "scale7_shop_access_ms"), data: latency(summary, "scale7_shop_data_ms") },
    collaboration: { access: latency(summary, "scale7_collaboration_access_ms"), data: latency(summary, "scale7_collaboration_data_ms") },
  },
};

const infrastructure = {
  observabilitySamples: samples.length,
  maxDbConnectionUtilization: maxOf(samples, (sample) => sample?.database?.connectionUtilization),
  maxDbConnections: maxOf(samples, (sample) => sample?.database?.currentConnections),
  dbMaxConnections: maxOf(samples, (sample) => sample?.database?.maxConnections),
  maxIdleInTransaction: maxOf(samples, (sample) => sample?.database?.idleInTransactionConnections),
  maxIdleInTransactionUnder100ms: maxOf(samples, (sample) => sample?.database?.idleInTransactionUnder100msConnections),
  maxIdleInTransactionAtLeast100ms: maxOf(samples, (sample) => sample?.database?.idleInTransactionAtLeast100msConnections),
  maxIdleInTransactionAtLeast1s: maxOf(samples, (sample) => sample?.database?.idleInTransactionAtLeast1sConnections),
  maxIdleInTransactionAgeSeconds: maxOf(samples, (sample) => sample?.database?.oldestIdleInTransactionSeconds),
  maxLongRunningQueries: maxOf(samples, (sample) => sample?.database?.longRunningQueries),
  redisStatuses: [...new Set(samples.map((sample) => sample?.redis?.status).filter(Boolean))],
  maxQueueDead: maxOf(samples, (sample) => sample?.queues?.dead),
  maxAiActiveAttempts: maxOf(samples, (sample) => sample?.ai?.capacity?.activeAttempts),
  maxAiThrottledAttempts: maxOf(samples, (sample) => sample?.ai?.capacity?.throttledAttempts),
};

const gates = {
  validStage,
  validProfile,
  hasObservabilitySamples: infrastructure.observabilitySamples >= 2,
  errorRateUnderOnePercent: http.failedRate != null && http.failedRate < 0.01,
  p95UnderOneSecond: http.latencyMs.p95 != null && http.latencyMs.p95 < 1000,
  p99UnderTwoSeconds: http.latencyMs.p99 != null && http.latencyMs.p99 < 2000,
  dashboardP95UnderOneSecond: http.workloads.dashboard.p95 != null && http.workloads.dashboard.p95 < 1000,
  dashboardP99UnderPolicyLimit: http.workloads.dashboard.p99 != null && http.workloads.dashboard.p99 < dashboardP99LimitMs,
  enterpriseP95UnderOneSecond: http.workloads.enterprise.p95 != null && http.workloads.enterprise.p95 < 1000,
  enterpriseP99UnderTwoSeconds: http.workloads.enterprise.p99 != null && http.workloads.enterprise.p99 < 2000,
  shopP95UnderOneSecond: http.workloads.shop.p95 != null && http.workloads.shop.p95 < 1000,
  shopP99UnderTwoSeconds: http.workloads.shop.p99 != null && http.workloads.shop.p99 < 2000,
  collaborationP95UnderOneSecond: http.workloads.collaboration.p95 != null && http.workloads.collaboration.p95 < 1000,
  collaborationP99UnderTwoSeconds: http.workloads.collaboration.p99 != null && http.workloads.collaboration.p99 < 2000,
  checksAboveNinetyNinePercent: http.checksRate != null && http.checksRate > 0.99,
  tenantIsolationPerfect: http.tenantIsolationRate === 1,
  dbConnectionUtilizationUnderEightyPercent:
    infrastructure.maxDbConnectionUtilization != null && infrastructure.maxDbConnectionUtilization < 0.8,
  noDbConnectionExhaustion:
    infrastructure.maxDbConnections != null &&
    infrastructure.dbMaxConnections != null &&
    infrastructure.dbMaxConnections > 0 &&
    infrastructure.maxDbConnections < infrastructure.dbMaxConnections,
  noIdleInTransaction:
    infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0,
  redisNeverUnavailable:
    infrastructure.redisStatuses.length > 0 && !infrastructure.redisStatuses.includes("UNAVAILABLE"),
};

const failedGates = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name);
const evidence = process.env.GITHUB_ACTIONS === "true" ? "CI_PROVEN" : "LOCAL_EXECUTED";
const durationSeconds = finite(summary?.state?.testRunDurationMs) != null
  ? Math.round(summary.state.testRunDurationMs / 1000)
  : null;

const report = {
  contract: "SCALE-7",
  issue: 360,
  programmeIssue: 352,
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || null,
  githubRunId: process.env.GITHUB_RUN_ID || null,
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  targetOrigin: safeOrigin(process.env.BASE_URL || ""),
  targetVus,
  profile,
  durationSeconds,
  authTopology,
  sloPolicy: {
    dashboardP99LimitMs,
    temporaryDashboardP99Active,
    standardDashboardP99Ms: dashboardP99Policy.standardP99Ms,
    temporaryExpiresAt: dashboardP99Policy.temporary.expiresAt,
    temporaryTargetVus: dashboardP99Policy.temporary.targetVus,
    changeIssue: dashboardP99Policy.temporary.changeIssue,
    reversionIssue: dashboardP99Policy.temporary.reversionIssue,
  },
  http,
  infrastructure,
  gates,
  failedGates,
  status: failedGates.length === 0 ? "PASS" : "FAIL",
  evidence: {
    loadExecution: evidence,
    note: "SCALE-7 certification evidence is valid only for this exact stage, profile, SHA and archived GitHub Actions run.",
  },
};

fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# SCALE-7 — Staged load certification",
  "",
  `- Status: **${report.status}**`,
  `- Evidence: **${evidence}**`,
  `- Git SHA: \`${report.gitSha || "unknown"}\``,
  `- Stage: **${targetVus} simultaneous users**`,
  `- Profile: **${profile || "unknown"}**`,
  `- Tenants / identities: ${authTopology.tenantCount ?? "n/a"} / ${authTopology.identityCount ?? "n/a"}`,
  `- Duration: ${durationSeconds ?? "n/a"} s`,
  `- Requests: ${http.requests ?? "n/a"}`,
  `- Requests/s: ${http.requestsPerSecond ?? "n/a"}`,
  `- HTTP failures: ${http.failedRate ?? "n/a"}`,
  `- Checks: ${http.checksRate ?? "n/a"}`,
  `- Tenant isolation: ${http.tenantIsolationRate ?? "n/a"}`,
  `- P50/P95/P99: ${http.latencyMs.p50 ?? "n/a"} / ${http.latencyMs.p95 ?? "n/a"} / ${http.latencyMs.p99 ?? "n/a"} ms`,
  `- Dashboard P50/P95/P99: ${http.workloads.dashboard.p50 ?? "n/a"} / ${http.workloads.dashboard.p95 ?? "n/a"} / ${http.workloads.dashboard.p99 ?? "n/a"} ms`,
  `- Dashboard P99 objective: <${dashboardP99LimitMs} ms (temporary 500-VU policy: ${temporaryDashboardP99Active ? "ACTIVE" : "INACTIVE"}; expires ${dashboardP99Policy.temporary.expiresAt}; standard <2000 ms; #788)`,
  `- Enterprise P50/P95/P99: ${http.workloads.enterprise.p50 ?? "n/a"} / ${http.workloads.enterprise.p95 ?? "n/a"} / ${http.workloads.enterprise.p99 ?? "n/a"} ms`,
  `- Shop internal access/data P95: ${http.serverPhases.shop.access.p95 ?? "n/a"} / ${http.serverPhases.shop.data.p95 ?? "n/a"} ms (diagnostic only)`,
  `- Collaboration internal access/data P95: ${http.serverPhases.collaboration.access.p95 ?? "n/a"} / ${http.serverPhases.collaboration.data.p95 ?? "n/a"} ms (diagnostic only)`,
  `- Shop P50/P95/P99: ${http.workloads.shop.p50 ?? "n/a"} / ${http.workloads.shop.p95 ?? "n/a"} / ${http.workloads.shop.p99 ?? "n/a"} ms`,
  `- Collaboration P50/P95/P99: ${http.workloads.collaboration.p50 ?? "n/a"} / ${http.workloads.collaboration.p95 ?? "n/a"} / ${http.workloads.collaboration.p99 ?? "n/a"} ms`,
  `- Max DB connection utilization: ${infrastructure.maxDbConnectionUtilization ?? "n/a"}`,
  `- Max DB connections: ${infrastructure.maxDbConnections ?? "n/a"} / ${infrastructure.dbMaxConnections ?? "n/a"}`,
  `- Max idle-in-transaction: ${infrastructure.maxIdleInTransaction ?? "n/a"} (under 100ms ${infrastructure.maxIdleInTransactionUnder100ms ?? "n/a"}; >=100ms ${infrastructure.maxIdleInTransactionAtLeast100ms ?? "n/a"}; >=1s ${infrastructure.maxIdleInTransactionAtLeast1s ?? "n/a"}; oldest ${infrastructure.maxIdleInTransactionAgeSeconds ?? "n/a"} s)`,
  `- Redis statuses: ${infrastructure.redisStatuses.join(", ") || "n/a"}`,
  `- Max AI active attempts: ${infrastructure.maxAiActiveAttempts ?? "n/a"}`,
  `- Max AI throttled attempts: ${infrastructure.maxAiThrottledAttempts ?? "n/a"}`,
  "",
  "## Gates",
  "",
  ...Object.entries(gates).map(([name, passed]) => `- [${passed ? "x" : " "}] ${name}`),
  "",
  "A higher stage must not be attempted until the previous stage has a PASS report for the required certification profiles.",
  "",
].join("\n");

fs.writeFileSync(reportMarkdownPath, markdown);
console.log(`SCALE-7 ${targetVus} ${profile}: ${report.status}`);
if (failedGates.length) {
  console.error(`Failed gates: ${failedGates.join(", ")}`);
  process.exit(1);
}
