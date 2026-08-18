import fs from "node:fs";
import process from "node:process";

const artifactsDir = process.env.ARTIFACTS_DIR || "artifacts";
const summaryPath = `${artifactsDir}/k6-summary.json`;
const dbSamplesPath = `${artifactsDir}/db-observability.ndjson`;
const reportJsonPath = `${artifactsDir}/scale1-db-load-report.json`;
const reportMarkdownPath = `${artifactsDir}/scale1-db-load-report.md`;

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metric(summary, name, key) {
  return finite(summary?.metrics?.[name]?.values?.[key]);
}

function maxMetric(samples, selector) {
  const values = samples.map(selector).filter((value) => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}

function loadDbSamples() {
  if (!fs.existsSync(dbSamplesPath)) return [];
  return fs
    .readFileSync(dbSamplesPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function safeOrigin(raw) {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

if (!fs.existsSync(summaryPath)) {
  console.error(`Missing k6 summary: ${summaryPath}`);
  process.exit(1);
}

const summary = readJson(summaryPath);
const dbSamples = loadDbSamples();
const targetVus = Number.parseInt(process.env.TARGET_VUS || "0", 10);
const targetOrigin = safeOrigin(process.env.BASE_URL || "");
const executionEvidence = process.env.GITHUB_ACTIONS === "true" ? "CI_PROVEN" : "LOCAL_EXECUTED";

const http = {
  requests: metric(summary, "http_reqs", "count"),
  requestsPerSecond: metric(summary, "http_reqs", "rate"),
  failedRate: metric(summary, "http_req_failed", "rate"),
  checksRate: metric(summary, "checks", "rate"),
  latencyMs: {
    p50: metric(summary, "http_req_duration", "med"),
    p95: metric(summary, "http_req_duration", "p(95)"),
    p99: metric(summary, "http_req_duration", "p(99)"),
  },
};

const database = {
  sampleCount: dbSamples.length,
  maxCurrentConnections: maxMetric(dbSamples, (sample) => sample?.database?.currentConnections),
  maxActiveConnections: maxMetric(dbSamples, (sample) => sample?.database?.activeConnections),
  maxIdleConnections: maxMetric(dbSamples, (sample) => sample?.database?.idleConnections),
  maxIdleInTransactionConnections: maxMetric(dbSamples, (sample) => sample?.database?.idleInTransactionConnections),
  maxLongRunningQueries: maxMetric(dbSamples, (sample) => sample?.database?.longRunningQueries),
  maxConnectionUtilization: maxMetric(dbSamples, (sample) => sample?.database?.connectionUtilization),
  maxProbeLatencyMs: maxMetric(dbSamples, (sample) => sample?.database?.probeLatencyMs),
  maxConnections: maxMetric(dbSamples, (sample) => sample?.database?.maxConnections),
  connectionModes: [...new Set(dbSamples.map((sample) => sample?.database?.connectionPolicy?.mode).filter(Boolean))],
  connectionStatuses: [...new Set(dbSamples.map((sample) => sample?.database?.connectionPolicy?.status).filter(Boolean))],
};

const gates = {
  targetIsIntermediate: [100, 250, 500].includes(targetVus),
  hasDatabaseSamples: database.sampleCount >= 2,
  httpFailureRateUnderOnePercent: http.failedRate != null && http.failedRate < 0.01,
  httpP95UnderOneSecond: http.latencyMs.p95 != null && http.latencyMs.p95 < 1000,
  httpP99UnderTwoSeconds: http.latencyMs.p99 != null && http.latencyMs.p99 < 2000,
  checksAboveNinetyNinePercent: http.checksRate != null && http.checksRate > 0.99,
  neonRuntimePooled:
    database.connectionModes.length === 1 &&
    database.connectionModes[0] === "NEON_POOLED" &&
    database.connectionStatuses.length === 1 &&
    database.connectionStatuses[0] === "OK",
  connectionUtilizationUnderEightyPercent:
    database.maxConnectionUtilization != null && database.maxConnectionUtilization < 0.8,
  noIdleInTransaction:
    database.maxIdleInTransactionConnections != null && database.maxIdleInTransactionConnections === 0,
  noConnectionExhaustion:
    database.maxCurrentConnections != null &&
    database.maxConnections != null &&
    database.maxConnections > 0 &&
    database.maxCurrentConnections < database.maxConnections,
};

const failedGates = Object.entries(gates)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const report = {
  contract: "SCALE-1B",
  issue: 410,
  harnessIssue: 411,
  parentIssue: 354,
  programmeIssue: 352,
  scale7Issue: 360,
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || null,
  githubRunId: process.env.GITHUB_RUN_ID || null,
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  targetOrigin,
  targetVus,
  http,
  database,
  gates,
  failedGates,
  status: failedGates.length === 0 ? "PASS" : "FAIL",
  evidence: {
    loadExecution: executionEvidence,
    note: "This artifact is generated only after a real SCALE-1B load execution. It does not certify SCALE-7 stages above 500 VU.",
  },
};

fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# SCALE-1B — Intermediate PostgreSQL load evidence",
  "",
  `- Status: **${report.status}**`,
  `- Evidence: **${executionEvidence}**`,
  `- Git SHA: \`${report.gitSha || "unknown"}\``,
  `- Target: ${report.targetOrigin || "unknown"}`,
  `- Virtual users: ${targetVus}`,
  `- HTTP requests: ${http.requests ?? "n/a"}`,
  `- HTTP req/s: ${http.requestsPerSecond ?? "n/a"}`,
  `- HTTP failure rate: ${http.failedRate ?? "n/a"}`,
  `- P50/P95/P99: ${http.latencyMs.p50 ?? "n/a"} / ${http.latencyMs.p95 ?? "n/a"} / ${http.latencyMs.p99 ?? "n/a"} ms`,
  `- DB samples: ${database.sampleCount}`,
  `- Max DB connections: ${database.maxCurrentConnections ?? "n/a"} / ${database.maxConnections ?? "n/a"}`,
  `- Max connection utilization: ${database.maxConnectionUtilization ?? "n/a"}`,
  `- Max idle-in-transaction: ${database.maxIdleInTransactionConnections ?? "n/a"}`,
  `- Max >1s active queries: ${database.maxLongRunningQueries ?? "n/a"}`,
  `- Runtime DB mode: ${database.connectionModes.join(", ") || "n/a"}`,
  "",
  "## Gates",
  "",
  ...Object.entries(gates).map(([name, passed]) => `- [${passed ? "x" : " "}] ${name}`),
  "",
  "SCALE-7 / #360 remains the owner of 1,000 / 2,500 / 5,000 VU certification.",
  "",
].join("\n");

fs.writeFileSync(reportMarkdownPath, markdown);

console.log(`SCALE-1B report: ${report.status}`);
if (failedGates.length) {
  console.error(`Failed gates: ${failedGates.join(", ")}`);
  process.exit(1);
}
