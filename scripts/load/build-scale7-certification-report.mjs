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
};

const infrastructure = {
  observabilitySamples: samples.length,
  maxDbConnectionUtilization: maxOf(samples, (sample) => sample?.database?.connectionUtilization),
  maxDbConnections: maxOf(samples, (sample) => sample?.database?.currentConnections),
  dbMaxConnections: maxOf(samples, (sample) => sample?.database?.maxConnections),
  maxIdleInTransaction: maxOf(samples, (sample) => sample?.database?.idleInTransactionConnections),
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
  `- Max DB connection utilization: ${infrastructure.maxDbConnectionUtilization ?? "n/a"}`,
  `- Max DB connections: ${infrastructure.maxDbConnections ?? "n/a"} / ${infrastructure.dbMaxConnections ?? "n/a"}`,
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
