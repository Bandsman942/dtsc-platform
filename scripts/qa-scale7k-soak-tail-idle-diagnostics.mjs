import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const load = fs.readFileSync("scripts/load/scale7-staged-certification.js", "utf8");
const reportSource = fs.readFileSync("scripts/load/build-scale7-certification-report.mjs", "utf8");
const obsSource = fs.readFileSync("lib/scalability/production-observability.ts", "utf8");
const policy = JSON.parse(fs.readFileSync("scripts/load/scale7-dashboard-p99-policy.json", "utf8"));
function check(ok, name) {
  if (!ok) throw new Error("SCALE-7K FAIL: " + name);
  console.log("SCALE-7K PASS: " + name);
}

const start = load.indexOf('const soakWindowLabels = [');
const end = load.indexOf('const expectedIsolationStatuses', start);
check(start >= 0 && end > start, "k6 soak windows defined");
const sample = {};
const fakeTrends = new Map();
sample.Trend = function Trend(name) {
  const received = [];
  fakeTrends.set(name, received);
  this.add = (value) => received.push(value);
};
sample.profile = "soak";
vm.runInNewContext(load.slice(start, end), sample);
function evalIndex(ms) { return vm.runInNewContext("soakWindowIndex(" + String(ms) + ")", sample); }
check(evalIndex(0) === 0 && evalIndex(299999) === 0, "first interval inclusive and 5-min boundary exclusive");
check(evalIndex(300000) === 1 && evalIndex(599999) === 1 && evalIndex(600000) === 2, "middle boundaries deterministic");
check(evalIndex(899999) === 2 && evalIndex(900000) === 3 && evalIndex(1200000) === 4, "late windows deterministic");
check(evalIndex(-1) === -1, "negative elapsed time not recorded");
function invoke(elapsed, label, value) {
  sample.response = { timings: { duration: value } };
  sample.label = label;
  sample.elapsed = elapsed;
  vm.runInNewContext("recordSoakWindow(response, label, elapsed)", sample);
}
invoke(10000, "dashboard-read", 125);
invoke(300000, "shop-read", 225);
invoke(1200000, "dashboard-read", 425);
invoke(-1, "dashboard-read", 200);
sample.profile = "ramp";
invoke(1400000, "dashboard-read", 500);
const get = (name) => fakeTrends.get(name) || [];
check(JSON.stringify(get("scale7_soak_global_0_5m_ms")) === "[125]" &&
  JSON.stringify(get("scale7_soak_dashboard_0_5m_ms")) === "[125]" &&
  JSON.stringify(get("scale7_soak_global_5_10m_ms")) === "[225]" &&
  get("scale7_soak_dashboard_5_10m_ms").length === 0 &&
  JSON.stringify(get("scale7_soak_global_20_plus_ms")) === "[425]" &&
  JSON.stringify(get("scale7_soak_dashboard_20_plus_ms")) === "[425]",
  "actual k6 Trends segment wall-clock HTTP durations without changing ramp metrics");
check(load.includes("exec.instance.currentTestRunDuration") &&
  !/scale7_soak_(global|dashboard)_.*\}":\s*\[/.test(load),
  "elapsed clock from k6 runtime, no additional threshold added");
for (const type of ["Client", "Lock"]) {
  check(obsSource.includes("wait_event_type = '" + type + "'"), "pg_stat_activity retains anonymized " + type + " wait classification");
}
check(obsSource.includes("FROM pg_stat_activity") &&
  obsSource.includes("idleInTransactionOtherWaitConnections") &&
  !obsSource.includes("pg_stat_activity.query") &&
  !obsSource.includes("application_name AS") &&
  !obsSource.includes("pid AS"), "existing SQL query provides sanitized counts, no statement or process ID");
for(const threshold of [
  'http_req_duration: ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]',
  'tenant_isolation_pass: ["rate==1"]',
]) check(load.includes(threshold), "SLO and tenant isolation unchanged " + threshold);
check(policy.temporary.targetVus === 500 &&
  policy.temporary.expiresAt === "2026-11-10T00:00:00.000Z" &&
  policy.standardP99Ms === 2000 && policy.temporary.p99Ms === 2500 &&
  reportSource.includes("dashboardP99UnderPolicyLimit: http.workloads.dashboard.p99 != null && http.workloads.dashboard.p99 < dashboardP99LimitMs") &&
  reportSource.includes("infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0"),
  "Dashboard temporary limit remains time-bound and noIdle gate is strictly zero");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scale7k-soak-"));
function metric(values) { return { values }; }
function fixture(idle) {
  const metrics = {
    http_reqs: metric({ count: 82000, rate: 58 }),
    http_req_failed: metric({ rate: 0 }), checks: metric({ rate: 1 }),
    tenant_isolation_pass: metric({ rate: 1 }),
    http_req_duration: metric({ med: 160, "p(95)": 500, "p(99)": 1100, avg: 250, max: 2000, count: 82000 }),
  };
  for(const domain of ["dashboard", "enterprise", "shop", "collaboration"]) {
    metrics["http_req_duration{workload:" + domain + "-read}"] =
      metric({ med: 150, "p(95)": 600, "p(99)": 1200, avg: 220, max: 2000, count: 15000 });
  }
  for(const window of ["0_5m","5_10m","10_15m","15_20m","20_plus"]) {
    metrics["scale7_soak_global_" + window + "_ms"] =
      metric({ med: 100, "p(95)": window === "20_plus" ? 850 : 300, "p(99)": window === "20_plus" ? 1900 : 900, avg: 150, max: 3000, count: 5000 });
    metrics["scale7_soak_dashboard_" + window + "_ms"] =
      metric({ med: 125, "p(95)": window === "20_plus" ? 920 : 350, "p(99)": window === "20_plus" ? 2100 : 1000, avg: 190, max: 3100, count: 3000 });
  }
  fs.writeFileSync(path.join(dir, "scale7-k6-summary.json"),
    JSON.stringify({ state: { testRunDurationMs: 1400000 }, metrics }));
  const mk = (date, count) => ({
    generatedAt: date,
    database: {
      currentConnections: 45, maxConnections: 900, connectionUtilization: 0.05,
      idleInTransactionConnections: count,
      idleInTransactionClientWaitConnections: count,
      idleInTransactionLockWaitConnections: 0,
      idleInTransactionOtherWaitConnections: 0,
      idleInTransactionUnder100msConnections: count,
      idleInTransactionAtLeast100msConnections: 0,
      idleInTransactionAtLeast1sConnections: 0,
      oldestIdleInTransactionSeconds: count ? 0.01 : null,
    },
    redis: { status: "OK" }, queues: { dead: 0 },
    ai: { capacity: { activeAttempts: 1, throttledAttempts: 0 } },
  });
  fs.writeFileSync(path.join(dir, "scale7-observability.ndjson"),
    [mk("2026-10-13T07:45:00Z",0),mk("2026-10-13T07:46:00Z",idle),mk("2026-10-13T07:47:00Z",0)]
      .map(x => JSON.stringify(x)).join("\n") + "\n");
}
function certify(idle) {
  fixture(idle);
  const proc = spawnSync(process.execPath, ["scripts/load/build-scale7-certification-report.mjs"], {
    cwd: process.cwd(), encoding: "utf8",
    env: { ...process.env, ARTIFACTS_DIR: dir, TARGET_VUS: "500", LOAD_PROFILE: "soak", GITHUB_ACTIONS: "false", GITHUB_SHA: "" },
  });
  check(!proc.error && fs.existsSync(path.join(dir,"scale7-certification-report.json")),
    "report generated on synthetic long-soak data");
  return { exit: proc.status, data: JSON.parse(fs.readFileSync(path.join(dir,"scale7-certification-report.json"),"utf8")) };
}
try {
  const passing = certify(0);
  check(passing.exit === 0 && passing.data.status === "PASS" && passing.data.gates.noIdleInTransaction === true,
    "all original gates pass with no idle transaction");
  check(passing.data.http.soakWindows.length === 5 &&
    passing.data.http.soakWindows[4].global.p99 === 1900 &&
    passing.data.http.soakWindows[4].dashboard.p99 === 2100,
    "actual reporter includes time-bucketed tail percentiles without applying false gates");
  check(passing.data.infrastructure.idleTransactionEventCount === 0 &&
    passing.data.infrastructure.idleTransactionEvents.length === 0,"no idle event with zero observation");
  const failing = certify(1);
  check(failing.exit !== 0 && failing.data.status === "FAIL" &&
    failing.data.failedGates.includes("noIdleInTransaction") &&
    failing.data.infrastructure.maxIdleInTransaction === 1 &&
    failing.data.infrastructure.idleTransactionEventCount === 1 &&
    failing.data.infrastructure.idleTransactionEvents[0].clientWait === 1 &&
    failing.data.infrastructure.idleTransactionEvents[0].sampledAt === "2026-10-13T07:46:00.000Z",
    "single <100ms idle transaction remains FAIL with anonymized event metadata");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("SCALE-7K diagnostics QA OK");
