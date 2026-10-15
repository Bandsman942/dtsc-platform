import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const load = workflowTestLoader({ "@/lib/prisma": { prisma: {} } });
const { executeWaitUntilStep } = load("@/lib/enterprise/workflows/steps/wait-until");
const { workflowEventReadySql, workflowEventFailure } = load("@/lib/enterprise/workflows/event-recovery");
const { EnterpriseWorkflowError } = load("@/lib/enterprise/workflows/errors");
const { getWorkflowRecoveryMessage } = load("@/lib/enterprise/workflows/recovery-messages");
const { publicWorkflowRun } = load("@/lib/enterprise/workflows/public-run");
const internalRun = { id: "run", status: "RUNNING", executionToken: "private", executionLeaseUntil: new Date() };
assert.deepEqual(publicWorkflowRun(internalRun), { id: "run", status: "RUNNING" });
assert.equal(internalRun.executionToken, "private", "Serializing must not mutate runtime ownership");
const fixed = Date.parse("2026-10-15T15:00:00Z");
const originalNow = Date.now;
Date.now = () => fixed;
try {
  const context = {
    run: { resumeAt: new Date(fixed - 1) },
    step: { code: "WAIT", name: "Wait", configurationJson: { mode: "RELATIVE_HOURS", hours: 1 } },
    stepRun: { startedAt: new Date(fixed - 3_600_000) }, adapter: {}, entity: {},
  };
  assert.equal((await executeWaitUntilStep(context)).kind, "SUCCEEDED", "A due relative wait must not schedule itself again");
  context.run.resumeAt = null;
  assert.equal((await executeWaitUntilStep(context)).kind, "SUCCEEDED", "Crash before wait persistence retains its original start time");
  context.stepRun.startedAt = new Date(fixed);
  const future = await executeWaitUntilStep(context);
  assert.equal(future.kind, "WAITING");
  assert.equal(future.resumeAt.getTime(), fixed + 3_600_000);
  context.run.resumeAt = future.resumeAt;
  Date.now = () => fixed + 3_600_000;
  assert.equal((await executeWaitUntilStep(context)).kind, "SUCCEEDED");
} finally { Date.now = originalNow; }
const predicate = workflowEventReadySql(new Date(fixed));
assert.ok(Prisma.sql`${predicate}`.text.includes("'PROCESSING'"));
assert.equal(workflowEventFailure(new EnterpriseWorkflowError("retry", 503, "RETRY", "TRANSIENT"), 1).dead, false);
assert.equal(workflowEventFailure(new EnterpriseWorkflowError("retry", 503, "RETRY", "TRANSIENT"), 3).dead, true);
for (const category of ["BUSINESS", "CONFIGURATION", "SECURITY", "TERMINAL"]) {
  assert.equal(workflowEventFailure(new EnterpriseWorkflowError("stop", 409, "STOP", category), 1).dead, true);
}
assert.match(getWorkflowRecoveryMessage("WORKFLOW_ACTION_RECONCILIATION_REQUIRED", "en"), /verified/);
assert.match(getWorkflowRecoveryMessage("WORKFLOW_ACTION_RECONCILIATION_REQUIRED", "fr"), /vérifié/);
assert.equal(getWorkflowRecoveryMessage("PRIVATE_BACKEND_DETAIL", "fr"), undefined);
console.log("PASS WF-00: deterministic wait/restart/deadline, finite retry policy, safe FR/EN recovery messages.");
