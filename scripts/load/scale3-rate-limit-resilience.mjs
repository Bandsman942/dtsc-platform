import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";

const BASE_URL = String(process.env.BASE_URL || "").replace(/\/+$/, "");
const SESSION_COOKIE = String(process.env.SESSION_COOKIE || "");
const BYPASS_SECRET = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "");
const RUN_ID = String(process.env.SCALE3_RUN_ID || process.env.GITHUB_RUN_ID || `local-${Date.now()}`)
  .replace(/[^A-Za-z0-9_-]/g, "-")
  .slice(0, 48);
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || "artifacts";
const WARMUP_REQUESTS = boundedInt(process.env.SCALE3_WARMUP_REQUESTS, 160, 40, 400);
const WARMUP_CONCURRENCY = boundedInt(process.env.SCALE3_WARMUP_CONCURRENCY, 80, 10, 200);
const WARMUP_LIMIT = 100;
const WARMUP_SETTLE_MS = 500;
const HEALTHY_REQUESTS = boundedInt(process.env.SCALE3_HEALTHY_REQUESTS, 400, 100, 1200);
const HEALTHY_CONCURRENCY = boundedInt(process.env.SCALE3_HEALTHY_CONCURRENCY, 80, 10, 200);
const HEALTHY_LIMIT = boundedInt(process.env.SCALE3_HEALTHY_LIMIT, 50, 5, 100);
const FAILOVER_REQUESTS = boundedInt(process.env.SCALE3_FAILOVER_REQUESTS, 60, 20, 300);
const FAILOVER_CONCURRENCY = boundedInt(process.env.SCALE3_FAILOVER_CONCURRENCY, 30, 5, 100);
const LOCAL_LIMIT = boundedInt(process.env.SCALE3_LOCAL_LIMIT, 5, 1, 25);

function boundedInt(raw, fallback, min, max) {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index] * 100) / 100;
}

function increment(map, value) {
  const key = String(value ?? "null");
  map.set(key, (map.get(key) || 0) + 1);
}

function mapObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function runConcurrent(total, concurrency, operation) {
  const results = new Array(total);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      results[index] = await operation(index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(total, concurrency) }, () => worker()));
  return results;
}

async function requestProbe(mode, runId, limit) {
  const url = new URL(`${BASE_URL}/api/admin/scalability/rate-limit-probe`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("runId", runId);
  url.searchParams.set("limit", String(limit));

  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Cookie: SESSION_COOKIE,
        "x-vercel-protection-bypass": BYPASS_SECRET,
      },
      cache: "no-store",
    });
    const latencyMs = performance.now() - startedAt;
    const body = await response.json().catch(() => null);
    return { status: response.status, latencyMs, body, error: null };
  } catch (error) {
    return {
      status: 0,
      latencyMs: performance.now() - startedAt,
      body: null,
      error: error instanceof Error ? error.name : "RequestError",
    };
  }
}

function summarize(mode, rows) {
  const sources = new Map();
  const reasons = new Map();
  const instanceIds = new Set();
  const requestLatency = [];
  const primitiveLatency = [];
  let httpErrors = 0;
  let invalidPayloads = 0;
  let allowed = 0;
  let degraded = 0;

  for (const row of rows) {
    requestLatency.push(row.latencyMs);
    if (row.status !== 200) {
      httpErrors += 1;
      continue;
    }

    const body = row.body;
    if (!body || body.mode !== mode || typeof body.instanceId !== "string" || !body.result) {
      invalidPayloads += 1;
      continue;
    }

    instanceIds.add(body.instanceId);
    if (typeof body.elapsedMs === "number" && Number.isFinite(body.elapsedMs)) primitiveLatency.push(body.elapsedMs);
    increment(sources, body.result.source);
    increment(reasons, body.result.reason);
    if (body.result.ok === true) allowed += 1;
    if (body.result.degraded === true) degraded += 1;
  }

  return {
    requests: rows.length,
    httpErrors,
    invalidPayloads,
    allowed,
    blocked: rows.length - httpErrors - invalidPayloads - allowed,
    degraded,
    instanceCount: instanceIds.size,
    sources: mapObject(sources),
    reasons: mapObject(reasons),
    latencyMs: {
      p50: percentile(requestLatency, 0.5),
      p95: percentile(requestLatency, 0.95),
      p99: percentile(requestLatency, 0.99),
    },
    primitiveLatencyMs: {
      p50: percentile(primitiveLatency, 0.5),
      p95: percentile(primitiveLatency, 0.95),
      p99: percentile(primitiveLatency, 0.99),
    },
  };
}

function sourceCount(summary, source) {
  return Number(summary.sources[source] || 0);
}

function reasonCount(summary, reason) {
  return Number(summary.reasons[reason] || 0);
}

function gate(condition, label, failures) {
  if (!condition) failures.push(label);
}

function markdownReport(report) {
  const lines = [
    "# SCALE-3 rate-limit resilience evidence",
    "",
    `Status: **${report.status}**`,
    `Generated: ${report.generatedAt}`,
    `Run: ${report.runId}`,
    "",
    "## Warm-up diagnostic (not certification latency)",
    "",
    `Requests: ${report.warmup.requests}; instances: ${report.warmup.instanceCount}; P95 HTTP: ${report.warmup.latencyMs.p95 ?? "n/a"} ms; P99 primitive: ${report.warmup.primitiveLatencyMs.p99 ?? "n/a"} ms; sources: ${JSON.stringify(report.warmup.sources)}.`,
    "",
    "The warm-up uses a distinct rate-limit key and is excluded from the certified healthy latency/quota measurement.",
    "",
    "| Mode | Requests | Allowed | Blocked | Instances | P95 HTTP | P99 primitive | Sources | Reasons |",
    "|---|---:|---:|---:|---:|---:|---:|---|---|",
  ];

  for (const mode of ["healthy", "closed", "local", "open"]) {
    const item = report.modes[mode];
    lines.push(`| ${mode} | ${item.requests} | ${item.allowed} | ${item.blocked} | ${item.instanceCount} | ${item.latencyMs.p95 ?? "n/a"} ms | ${item.primitiveLatencyMs.p99 ?? "n/a"} ms | ${JSON.stringify(item.sources)} | ${JSON.stringify(item.reasons)} |`);
  }

  lines.push("", "## Gates", "");
  if (!report.failedGates.length) lines.push("- PASS — all SCALE-3 resilience gates satisfied.");
  else for (const failure of report.failedGates) lines.push(`- FAIL — ${failure}`);
  lines.push("", "This report intentionally omits cookies, bypass secrets, Redis URLs/tokens, logical rate-limit keys, IPs, user IDs, tenant IDs, hostnames and raw provider errors.", "");
  return lines.join("\n");
}

if (!BASE_URL.startsWith("https://")) {
  console.error("SCALE3: BASE_URL must be HTTPS.");
  process.exit(2);
}
if (!SESSION_COOKIE || !BYPASS_SECRET) {
  console.error("SCALE3: authenticated session cookie and Vercel automation bypass secret are required.");
  process.exit(2);
}
if (HEALTHY_REQUESTS <= HEALTHY_LIMIT) {
  console.error("SCALE3: healthy request count must exceed the distributed limit.");
  process.exit(2);
}

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const warmupRows = await runConcurrent(
  WARMUP_REQUESTS,
  WARMUP_CONCURRENCY,
  () => requestProbe("healthy", `${RUN_ID}-warmup`, WARMUP_LIMIT),
);
const warmup = summarize("healthy", warmupRows);
await new Promise((resolve) => setTimeout(resolve, WARMUP_SETTLE_MS));

const healthyRows = await runConcurrent(
  HEALTHY_REQUESTS,
  HEALTHY_CONCURRENCY,
  () => requestProbe("healthy", `${RUN_ID}-healthy`, HEALTHY_LIMIT),
);
const closedRows = await runConcurrent(
  FAILOVER_REQUESTS,
  FAILOVER_CONCURRENCY,
  () => requestProbe("closed", `${RUN_ID}-closed`, LOCAL_LIMIT),
);
const localRows = await runConcurrent(
  FAILOVER_REQUESTS,
  FAILOVER_CONCURRENCY,
  () => requestProbe("local", `${RUN_ID}-local`, LOCAL_LIMIT),
);
const openRows = await runConcurrent(
  FAILOVER_REQUESTS,
  FAILOVER_CONCURRENCY,
  () => requestProbe("open", `${RUN_ID}-open`, LOCAL_LIMIT),
);

const modes = {
  healthy: summarize("healthy", healthyRows),
  closed: summarize("closed", closedRows),
  local: summarize("local", localRows),
  open: summarize("open", openRows),
};

const failedGates = [];
const healthy = modes.healthy;
const closed = modes.closed;
const local = modes.local;
const open = modes.open;

gate(warmup.httpErrors === 0, "warmup: HTTP errors must be zero", failedGates);
gate(warmup.invalidPayloads === 0, "warmup: invalid payloads must be zero", failedGates);
gate(sourceCount(warmup, "redis") === WARMUP_REQUESTS, "warmup: every result must come from Redis", failedGates);

for (const [mode, summary] of Object.entries(modes)) {
  gate(summary.httpErrors === 0, `${mode}: HTTP errors must be zero`, failedGates);
  gate(summary.invalidPayloads === 0, `${mode}: invalid payloads must be zero`, failedGates);
  gate(summary.latencyMs.p95 !== null && summary.latencyMs.p95 <= 2_000, `${mode}: HTTP p95 must be <= 2000 ms`, failedGates);
}

gate(healthy.instanceCount >= 2, "healthy: Production run must observe at least 2 ephemeral instances", failedGates);
gate(sourceCount(healthy, "redis") === HEALTHY_REQUESTS, "healthy: every result must come from Redis", failedGates);
gate(healthy.degraded === 0, "healthy: no result may be degraded", failedGates);
gate(healthy.allowed === HEALTHY_LIMIT, "healthy: global allowed count must equal the configured Redis limit", failedGates);
gate(healthy.primitiveLatencyMs.p95 !== null && healthy.primitiveLatencyMs.p95 <= 1_000, "healthy: primitive p95 must be <= 1000 ms", failedGates);

gate(sourceCount(closed, "fail-closed") === FAILOVER_REQUESTS, "closed: every controlled timeout must fail closed", failedGates);
gate(reasonCount(closed, "TIMEOUT") === FAILOVER_REQUESTS, "closed: every result must expose normalized TIMEOUT", failedGates);
gate(closed.allowed === 0, "closed: no request may be allowed", failedGates);
gate(closed.degraded === FAILOVER_REQUESTS, "closed: every result must be degraded", failedGates);

gate(sourceCount(local, "local") === FAILOVER_REQUESTS, "local: every controlled timeout must use local fallback", failedGates);
gate(reasonCount(local, "TIMEOUT") === FAILOVER_REQUESTS, "local: every result must expose normalized TIMEOUT", failedGates);
gate(local.degraded === FAILOVER_REQUESTS, "local: every result must be degraded", failedGates);
gate(local.allowed > 0, "local: bounded fallback must allow at least one request", failedGates);
gate(local.allowed <= LOCAL_LIMIT * Math.max(1, local.instanceCount), "local: allowed count must remain bounded by limit × observed instances", failedGates);

gate(sourceCount(open, "fail-open") === FAILOVER_REQUESTS, "open: explicit probe override must fail open", failedGates);
gate(reasonCount(open, "TIMEOUT") === FAILOVER_REQUESTS, "open: every result must expose normalized TIMEOUT", failedGates);
gate(open.allowed === FAILOVER_REQUESTS, "open: explicit probe override must allow every request", failedGates);
gate(open.degraded === FAILOVER_REQUESTS, "open: every result must be degraded", failedGates);

for (const mode of [closed, local, open]) {
  gate(mode.primitiveLatencyMs.p99 !== null && mode.primitiveLatencyMs.p99 <= 300, "controlled failover: primitive p99 must stay <= 300 ms", failedGates);
}

const report = {
  version: 2,
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  status: failedGates.length ? "FAIL" : "PASS",
  configuration: {
    warmupRequests: WARMUP_REQUESTS,
    warmupConcurrency: WARMUP_CONCURRENCY,
    warmupLimit: WARMUP_LIMIT,
    healthyRequests: HEALTHY_REQUESTS,
    healthyConcurrency: HEALTHY_CONCURRENCY,
    healthyLimit: HEALTHY_LIMIT,
    failoverRequests: FAILOVER_REQUESTS,
    failoverConcurrency: FAILOVER_CONCURRENCY,
    localLimit: LOCAL_LIMIT,
  },
  warmup,
  modes,
  failedGates,
};

fs.writeFileSync(path.join(ARTIFACTS_DIR, "scale3-rate-limit-resilience-report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(ARTIFACTS_DIR, "scale3-rate-limit-resilience-report.md"), markdownReport(report));

console.log(`SCALE-3 resilience evidence: ${report.status}`);
console.log(`warmup instances=${warmup.instanceCount}, p95=${warmup.latencyMs.p95}ms, redis=${sourceCount(warmup, "redis")}`);
console.log(`healthy instances=${healthy.instanceCount}, allowed=${healthy.allowed}/${HEALTHY_REQUESTS}, redis=${sourceCount(healthy, "redis")}`);
console.log(`closed/local/open sources=${JSON.stringify({ closed: closed.sources, local: local.sources, open: open.sources })}`);
console.log(`failed gates=${failedGates.length ? failedGates.join(" | ") : "none"}`);

process.exit(failedGates.length ? 1 : 0);
