import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const policy = JSON.parse(fs.readFileSync("scripts/load/scale7-dashboard-p99-policy.json", "utf8"));
const load = fs.readFileSync("scripts/load/scale7-staged-certification.js", "utf8");
const reportScript = fs.readFileSync("scripts/load/build-scale7-certification-report.mjs", "utf8");

function expect(ok, description) {
  if (!ok) throw new Error("FAIL SCALE-7 P99 policy: " + description);
  console.log("PASS SCALE-7 P99 policy: " + description);
}
function limitFor(timestamp, vus) {
  const now = Date.parse(timestamp);
  const temporary = policy.temporary;
  return vus === temporary.targetVus &&
    now >= Date.parse(temporary.startsAt) &&
    now < Date.parse(temporary.expiresAt)
    ? temporary.p99Ms : policy.standardP99Ms;
}
expect(policy.contract === "SCALE-7-DASHBOARD-P99-TEMPORARY", "one versioned source of truth");
expect(policy.standardP99Ms === 2000 && policy.temporary.p99Ms === 2500, "exact strict and temporary limits");
expect(policy.temporary.changeIssue === 789 && policy.temporary.reversionIssue === 788, "explicit debt ownership");
expect(policy.temporary.targetVus === 500, "only the 500-VU stage may use temporary tolerance");
expect(policy.temporary.startsAt === "2026-10-10T00:00:00.000Z" &&
  policy.temporary.expiresAt === "2026-11-10T00:00:00.000Z", "bounded UTC dates");
expect(limitFor("2026-10-09T23:59:59.999Z", 500) === 2000, "before start: strict 2000");
expect(limitFor("2026-10-10T00:00:00.000Z", 500) === 2500, "start inclusive: temporary 2500");
expect(limitFor("2026-11-09T23:59:59.999Z", 500) === 2500, "last permitted millisecond");
expect(limitFor("2026-11-10T00:00:00.000Z", 500) === 2000, "expiration: automatic strict 2000");
for (const vus of [1000, 2500, 5000]) {
  expect(limitFor("2026-10-20T12:00:00Z", vus) === 2000, vus + " VUs are always strict");
}
expect(load.includes('JSON.parse(open("./scale7-dashboard-p99-policy.json"))') &&
  reportScript.includes('readJson("scripts/load/scale7-dashboard-p99-policy.json")'), "k6 and report read the same policy");
expect(load.includes("policyNowMs < Date.parse(dashboardP99Policy.temporary.expiresAt)") &&
  reportScript.includes("policyNowMs < Date.parse(dashboardP99Policy.temporary.expiresAt)"), "expiry enforced by both");
expect(load.includes('"http_req_duration{workload:dashboard-read}": ["p(95)<1000",') &&
  load.includes("dashboardP99LimitMs") &&
  reportScript.includes("dashboardP99UnderPolicyLimit: http.workloads.dashboard.p99 != null && http.workloads.dashboard.p99 < dashboardP99LimitMs"), "both Dashboard gates enforce effective P99");
for (const workload of ["enterprise", "shop", "collaboration"]) {
  expect(load.includes('"http_req_duration{workload:' + workload + '-read}": ["p(95)<1000", "p(99)<2000"]'), workload + " k6 is strict");
  expect(reportScript.includes(workload + "P99UnderTwoSeconds:"), workload + " report is strict");
}
expect(load.includes('http_req_duration: ["p(95)<1000", "p(99)<2000"]') &&
  reportScript.includes("p99UnderTwoSeconds: http.latencyMs.p99 != null && http.latencyMs.p99 < 2000"), "global SLO unchanged");
expect(load.includes('tenant_isolation_pass: ["rate==1"]') &&
  reportScript.includes("tenantIsolationPerfect: http.tenantIsolationRate === 1"), "tenant isolation must be perfect");
expect(reportScript.includes("infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0"), "idle-in-transaction is strictly zero");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scale7-policy-"));
function metric(values) { return { values }; }
function createFixture(dashboardP99, idle) {
  const metrics = {
    http_reqs: metric({ count: 36000, rate: 48 }),
    http_req_failed: metric({ rate: 0 }),
    checks: metric({ rate: 1 }),
    tenant_isolation_pass: metric({ rate: 1 }),
    http_req_duration: metric({ med: 180, "p(95)": 540, "p(99)": 1900, avg: 240, max: 3100, count: 35000 }),
  };
  for (const name of ["dashboard", "enterprise", "shop", "collaboration"]) {
    metrics["http_req_duration{workload:" + name + "-read}"] = metric({
      med: 180, "p(95)": 800, "p(99)": name === "dashboard" ? dashboardP99 : 1600,
      avg: 310, max: 3400, count: 9000,
    });
  }
  fs.writeFileSync(path.join(directory, "scale7-k6-summary.json"),
    JSON.stringify({ state: { testRunDurationMs: 740000 }, metrics }) + "\n");
  const observation = {
    database: {
      connectionUtilization: 0.06, currentConnections: 55, maxConnections: 900,
      idleInTransactionConnections: idle, idleInTransactionUnder100msConnections: idle,
      idleInTransactionAtLeast100msConnections: 0,
      idleInTransactionAtLeast1sConnections: 0, oldestIdleInTransactionSeconds: 0,
    },
    redis: { status: "OK" }, queues: { dead: 0 },
    ai: { capacity: { activeAttempts: 1, throttledAttempts: 0 } },
  };
  fs.writeFileSync(path.join(directory, "scale7-observability.ndjson"),
    JSON.stringify(observation) + "\n" + JSON.stringify(observation) + "\n");
}
function scenario(p99, vus, idle) {
  createFixture(p99, idle);
  const run = spawnSync(process.execPath, ["scripts/load/build-scale7-certification-report.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env, ARTIFACTS_DIR: directory,
      TARGET_VUS: String(vus), LOAD_PROFILE: "ramp",
      GITHUB_ACTIONS: "false", GITHUB_SHA: "", GITHUB_RUN_ID: "",
    },
  });
  expect(run.error == null, "report subprocess launched");
  const report = JSON.parse(fs.readFileSync(path.join(directory, "scale7-certification-report.json"), "utf8"));
  return { result: report, exit: run.status };
}
try {
  const strict = scenario(1900, 500, 0);
  expect(strict.exit === 0 && strict.result.status === "PASS", "500 VUs all strict baseline gates pass");
  const nowLimit = limitFor(new Date().toISOString(), 500);
  const temporary = scenario(2400, 500, 0);
  expect(temporary.result.sloPolicy.dashboardP99LimitMs === nowLimit &&
    temporary.result.gates.dashboardP99UnderPolicyLimit === (nowLimit === 2500) &&
    (temporary.exit === 0) === (nowLimit === 2500), "500 VUs 2400ms matches current time-bound policy");
  const boundary = scenario(2500, 500, 0);
  expect(boundary.exit !== 0 && !boundary.result.gates.dashboardP99UnderPolicyLimit, "2500ms boundary never passes");
  const higher = scenario(2400, 1000, 0);
  expect(higher.exit !== 0 && higher.result.sloPolicy.dashboardP99LimitMs === 2000 &&
    !higher.result.gates.dashboardP99UnderPolicyLimit, "1000 VUs 2400ms fails");
  const idle = scenario(1900, 500, 1);
  expect(idle.exit !== 0 && !idle.result.gates.noIdleInTransaction, "one idle <100ms still FAIL");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log("SCALE-7 temporary P99 policy contract OK");
