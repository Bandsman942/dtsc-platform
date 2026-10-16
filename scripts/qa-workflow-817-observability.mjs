import assert from "node:assert/strict";
import fs from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const { summarizeWorkflowTiming } = workflowTestLoader({})("@/lib/enterprise/workflows/observability");
const now = new Date("2026-10-16T12:00:00.000Z");
const before = (minutes) => new Date(now.getTime() - minutes * 60_000);
const rows = [
  { status: "COMPLETED", startedAt: before(2), completedAt: before(1), updatedAt: before(1) },
  { status: "COMPLETED", startedAt: before(5), completedAt: before(3), updatedAt: before(3) },
  { status: "COMPLETED", startedAt: before(8), completedAt: before(5), updatedAt: before(5) },
  { status: "WAITING_APPROVAL", startedAt: before(20), completedAt: null, updatedAt: before(10) },
  { status: "BLOCKED", startedAt: before(30), completedAt: null, updatedAt: before(15) },
  { status: "FAILED", startedAt: before(4), completedAt: null, updatedAt: before(3) },
];
const summary = summarizeWorkflowTiming(rows, now, 500, 30);
assert.deepEqual(summary.completedLatency, { p50: 120000, p95: 174000, p99: 178800 });
assert.equal(summary.sampledAt, now.toISOString());
assert.equal(summary.windowDays, 30);
assert.equal(summary.sampleSize, 6);
assert.equal(summary.completedSamples, 3);
assert.equal(summary.waitingSamples, 2);
assert.equal(summary.oldestWaitingAgeMs, 900000);
assert.equal(summary.capped, false);
assert.deepEqual(summarizeWorkflowTiming([], now, 500).completedLatency, { p50: null, p95: null, p99: null }, "No fictitious zero latency");
assert.equal(summarizeWorkflowTiming(rows, now, 6).capped, true, "Capped sample must be labeled");
assert.equal(summarizeWorkflowTiming([
  { status: "COMPLETED", startedAt: before(1), completedAt: before(2), updatedAt: now },
], now, 50).completedLatency.p50, null, "Negative durations are invalid");
const route = fs.readFileSync("app/api/enterprise/[organizationId]/workflow-runs/route.ts", "utf8");
assert.match(route, /sourceEntityType: \{ in: permittedEntityTypes \}/, "ERP source entitlements remain applied");
assert.match(route, /canViewAllRuns \? \{\} : \{ OR:/, "Actor-scoped predicate remains applied");
assert.ok(route.includes("AND: [where, { startedAt:"), "Observability sample must reuse the scoped run predicate");
assert.ok(route.includes("take: sampleLimit") && route.includes("sampleLimit = 500"), "Bound the query");
assert.ok(route.includes("summarizeWorkflowTiming(observations, sampledAt"), "Never estimate missing metrics");
for (const protectedTest of ["scripts/qa-workflow-813-postgres.mjs", "scripts/qa-workflow-814-postgres.mjs", "scripts/qa-workflow-816-publish-manual.mjs"]) {
  if (protectedTest.includes("816")) continue; // expected only after the WF-03 dependency lands
  assert.ok(fs.existsSync(protectedTest), "Existing behavioral Postgres QA must remain: " + protectedTest);
}
console.log("PASS WF-04: bounded actor-scoped observability with real timestamps, null missing values, p50/p95/p99 and no regression removal.");
