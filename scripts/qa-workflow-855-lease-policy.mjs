import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  INERT_WORKFLOW_LEASE_POLICY, canonicalInertWorkflowOccurrenceKey,
  planInertWorkflowScheduleClaim, assessInertWorkflowLeaseFence,
} from "../lib/enterprise/workflows/schedule-lease-policy.mjs";

const limitsSource = readFileSync("lib/enterprise/workflows/constants.ts", "utf8");
assert.match(limitsSource, /maxAttempts:\s*3\s*,/, "lease policy must track V1 attempts");
assert.match(limitsSource, /workerLeaseSeconds:\s*90\s*,/, "lease policy must track V1 lease");
assert.equal(INERT_WORKFLOW_LEASE_POLICY.maxAttempts, 3);
assert.equal(INERT_WORKFLOW_LEASE_POLICY.leaseSeconds, 90);
assert.equal(INERT_WORKFLOW_LEASE_POLICY.maxCatchUpMs, 86_400_000);

const t = new Date("2026-10-16T21:00:00.000Z");
function reserved(overrides = {}) {
  const row = {
    id: randomUUID(), organizationId: "org-a", scheduleId: "schedule-a",
    workflowVersionId: "version-a", localDate: "2026-10-16",
    localTime: "21:00", scheduledAt: t, status: "RESERVED",
    occurrenceKey: null, revision: 1, attemptCount: 0, claimToken: null,
    leaseUntil: null, claimedAt: null, completedAt: null,
    workflowRunId: null, outboxEventId: null, lastFailureCode: null,
    ...overrides,
  };
  if (row.occurrenceKey === null) row.occurrenceKey = canonicalInertWorkflowOccurrenceKey(row);
  return row;
}
const source = reserved();
const p = planInertWorkflowScheduleClaim(source, t);
assert.equal(p.kind, "INERT_LEASE_PLAN_ONLY");
assert.equal(p.authorized, false);
assert.equal(p.executable, false);
assert.equal(p.expectedStatus, "RESERVED");
assert.equal(p.expectedRevision, 1);
assert.equal(p.hypotheticalNextRevision, 2);
assert.equal(p.hypotheticalFirstAttempt, 1);
assert.equal(p.hypotheticalLeaseSeconds, 90);
assert.ok(!Object.hasOwn(p, "claimToken"), "no token in inert plan");
assert.ok(!Object.hasOwn(p, "workflowRunId") && !Object.hasOwn(p, "outboxEventId"));

// 12 concurrency *proposals* are identical; DB CAS/locks must still pick
// the ONLY winner later. This simulation is NOT real DB concurrency evidence.
const proposals = Array.from({ length: 12 }, () => planInertWorkflowScheduleClaim(source, t));
assert.ok(proposals.every(x => x.expectedRevision === 1 && x.occurrenceKey === p.occurrenceKey));
let simulatedDbRevision = 1, simulatedWins = 0;
for (const proposal of proposals) {
  if (simulatedDbRevision === proposal.expectedRevision) {
    simulatedDbRevision = proposal.hypotheticalNextRevision;
    simulatedWins += 1;
  }
}
assert.equal(simulatedWins, 1, "expected CAS precondition allows only one logical winner");

function deny(row, now = t, reason = /WORKFLOW_INERT_LEASE_/) {
  assert.throws(() => planInertWorkflowScheduleClaim(row, now), reason);
}
deny(reserved({ status: "CLAIMED" }), t, /STATUS_INVALID/);
deny(reserved({ revision: 0 }), t, /REVISION_INVALID/);
deny(reserved({ revision: Number.MAX_SAFE_INTEGER }), t, /REVISION_EXHAUSTED/);
deny(reserved({ attemptCount: 1 }), t, /ALREADY_MUTATED/);
deny(reserved({ claimToken: randomUUID() }), t, /ALREADY_MUTATED/);
deny(reserved({ leaseUntil: new Date(t.getTime() + 90_000) }), t, /ALREADY_MUTATED/);
deny(reserved({ workflowRunId: randomUUID() }), t, /ALREADY_MUTATED/);
deny(reserved({ outboxEventId: randomUUID() }), t, /ALREADY_MUTATED/);
deny(reserved({ lastFailureCode: "FAILED" }), t, /ALREADY_MUTATED/);
deny(reserved({ scheduledAt: new Date(t.getTime() + 60_000) }), t, /NOT_DUE/);
deny(reserved({ scheduledAt: new Date(t.getTime() - 86_400_001) }), t, /CATCHUP_EXCEEDED/);
deny({ ...source, organizationId: "org-b" }, t, /KEY_MISMATCH/);
deny({ ...source, workflowVersionId: "version-b" }, t, /KEY_MISMATCH/);
deny({ ...source, localDate: "2026-10-17" }, t, /KEY_MISMATCH/);
deny({ ...source, occurrenceKey: "0".repeat(64) }, t, /KEY_MISMATCH/);
deny({ ...source, organizationId: "../bad" }, t, /KEY_MISMATCH/);
assert.throws(() => canonicalInertWorkflowOccurrenceKey({ ...source, localDate: "2026-02-30" }), /LOCAL_DATE_INVALID/);
assert.throws(() => canonicalInertWorkflowOccurrenceKey({ ...source, localTime: "25:90" }), /IDENTITY_INVALID/);
assert.throws(() => planInertWorkflowScheduleClaim(source, new Date("x")), /CLOCK_INVALID/);

// Fall-back 2026-11-01 America/New_York: first and second 01:30 have
// different UTC instants but the same local identity; cannot create two keys.
const fold1 = reserved({localDate:"2026-11-01",localTime:"01:30",scheduledAt:new Date("2026-11-01T05:30:00Z")});
const fold2 = reserved({id:randomUUID(),localDate:"2026-11-01",localTime:"01:30",scheduledAt:new Date("2026-11-01T06:30:00Z")});
assert.equal(fold1.occurrenceKey, fold2.occurrenceKey);
const firstPlan = planInertWorkflowScheduleClaim(fold1, new Date("2026-11-01T05:30:00Z"));
const secondPlan = planInertWorkflowScheduleClaim(fold2, new Date("2026-11-01T06:30:00Z"));
assert.equal(firstPlan.occurrenceKey, secondPlan.occurrenceKey);
assert.notEqual(canonicalInertWorkflowOccurrenceKey(reserved({organizationId:"org-b"})), p.occurrenceKey);

// Snapshot CLAIMED is only hypothetical: the #850 DB CHECK still rejects it.
const token = randomUUID(), claimedAt = new Date(t.getTime() - 30_000);
const claimed = { ...source, status: "CLAIMED", revision: 2, attemptCount: 1,
  claimToken: token, claimedAt, leaseUntil: new Date(t.getTime() + 60_000) };
const fence = assessInertWorkflowLeaseFence(claimed, token, t);
assert.equal(fence.kind, "INERT_LEASE_FENCE_ONLY");
assert.equal(fence.authorized, false);
assert.equal(fence.executable, false);
assert.ok(!Object.hasOwn(fence, "claimToken"));
assert.throws(() => assessInertWorkflowLeaseFence(claimed, randomUUID(), t), /TOKEN_MISMATCH/);
assert.throws(() => assessInertWorkflowLeaseFence(claimed, token, new Date(t.getTime() + 61_000)), /LEASE_INVALID/);
assert.throws(() => assessInertWorkflowLeaseFence({...claimed, attemptCount:4}, token, t), /ATTEMPTS_INVALID/);
assert.throws(() => assessInertWorkflowLeaseFence({...claimed, workflowRunId:randomUUID()}, token, t), /EFFECT_ALREADY_LINKED/);
assert.throws(() => assessInertWorkflowLeaseFence({...claimed, outboxEventId:randomUUID()}, token, t), /EFFECT_ALREADY_LINKED/);
assert.throws(() => assessInertWorkflowLeaseFence({...claimed, leaseUntil:new Date(t.getTime()+120_000)}, token, t), /LEASE_INVALID/);
assert.throws(() => assessInertWorkflowLeaseFence(source, token, t), /NOT_CLAIMED/);

const invariants=readFileSync("prisma/migrations/20261016223500_workflow_schedule_inert_execution_receipts/migration.sql","utf8");
assert.match(invariants, /"EW_Occurrence_inert_execution_check"/);
assert.match(invariants, /"status" = 'RESERVED'/);
console.log("PASS WF-06S2E2: 12 logical CAS proposals, tenant/version/DST keys, attempts, secretless token fencing, expiry, no effects; NOT a DB claim");
