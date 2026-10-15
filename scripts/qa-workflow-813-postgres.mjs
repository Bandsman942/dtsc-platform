import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// Mandatory in Quality/Migration CI. Never run against a remote or production DB.
const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(database.hostname) && /test/.test(database.pathname), "WF-00 requires an isolated local test PostgreSQL database");
const prisma = new PrismaClient();
const prefix = `wf813-${randomUUID()}`;
const organizationId = prefix;
const otherTenant = `${prefix}-other`;
let taskCalls = 0;
let taskFault = false;
let pauseTask = null;
let domainPause = null;
let domainCalls = 0;
let domainFault = false;
const adapter = {
  loadEntity: async () => ({ id: "source", title: "Source", revision: 1, status: "TODO" }),
  getTemplateValues: () => ({}), placeholders: new Set(), conditionFields: new Set(), domainActions: new Set(["START"]),
  executeDomainAction: async () => {
    domainCalls++;
    if (domainPause) await domainPause();
    if (domainFault) throw new Error("Response lost after effect");
    return { entityType: "EnterpriseTask", entityId: "source", status: "IN_PROGRESS" };
  },
};
const service = {
  createEnterpriseTaskInTransaction: async (tx, org, actor, input) => {
    taskCalls++;
    const task = await tx.enterpriseTask.create({ data: { organizationId: org, title: input.title, createdByUserId: actor } });
    if (pauseTask) await pauseTask();
    if (taskFault) throw new Error("Crash before task receipt commit");
    return task;
  },
  decideEnterpriseApproval: async () => {},
};
const load = workflowTestLoader({
  "@/lib/prisma": { prisma },
  "@/lib/enterprise/core-v2/service": service,
  "@/lib/enterprise/finance/budget-service": { decideEnterpriseBudgetApproval: async () => {} },
  "@/lib/enterprise/finance/expense-service": { decideEnterpriseExpenseApproval: async () => {} },
  "@/lib/enterprise/procurement/purchase-service": { decideEnterprisePurchaseApproval: async () => {} },
  "@/lib/enterprise/workflows/adapters": { getWorkflowEntityAdapter: () => adapter, compareWorkflowCondition: () => true, resolveWorkflowAssignment: async () => prefix },
  "@/lib/enterprise/workflows/runtime-utils": { resolveWorkflowExecutionUser: async () => prefix, workflowSourceModule: () => "TASKS_OPERATIONS" },
  "@/lib/push/queue": { enqueueWebPushNotification: async () => {} },
  "@/lib/enterprise/cross-module/projection-queue": { enqueueCrossModuleProjections: async () => ({ queued: 0 }) },
  "@/lib/enterprise/cross-module/projection-service": { processCrossModuleProjections: async () => ({ failures: 0 }), processPendingCrossModuleProjections: async () => ({ processed: 0, failures: 0 }) },
  "@/lib/enterprise/finance/overview-summary-service": { invalidateEnterpriseFinanceOverviewSummaryCacheForDomainEvent: async () => {} },
  "@/lib/enterprise/finance/summary-service": { invalidateEnterpriseFinanceSummaryCacheForDomainEvent: async () => {} },
  "@/lib/enterprise/retail/commercial-dashboard-projections": { invalidateCommercialRetailDashboardCacheForDomainEvent: async () => {} },
});
const engine = load("@/lib/enterprise/workflows/engine");
const actions = load("@/lib/enterprise/workflows/action-attempts");
const lease = load("@/lib/enterprise/workflows/execution-lease");
const workers = [load("@/lib/enterprise/workflows/worker").processPendingWorkflowEvents, load("@/lib/enterprise/workflows/worker-isolated").processPendingWorkflowEventsIsolated];
let sequence = 0;
async function fixture(stepType, configuration, status = "RUNNING", stepStatus = "PENDING") {
  const tag = `${prefix}-${sequence++}`;
  const definition = await prisma.enterpriseWorkflowDefinition.create({ data: { organizationId, code: tag, name: "Recovery test", status: "ACTIVE", triggerType: "DOMAIN_EVENT", triggerEntityType: "EnterpriseTask", triggerEventType: "WF813_TEST", createdByUserId: prefix } });
  const version = await prisma.enterpriseWorkflowVersion.create({ data: { organizationId, definitionId: definition.id, versionNumber: 1, status: "PUBLISHED", createdByUserId: prefix } });
  const step = await prisma.enterpriseWorkflowStep.create({ data: { organizationId, workflowVersionId: version.id, code: "ACTION", name: "Action", stepType, position: 0, configurationJson: configuration } });
  const end = await prisma.enterpriseWorkflowStep.create({ data: { organizationId, workflowVersionId: version.id, code: "END", name: "End", stepType: "END", position: 1, configurationJson: { outcome: "COMPLETED" } } });
  await prisma.enterpriseWorkflowTransition.create({ data: { organizationId, workflowVersionId: version.id, fromStepId: step.id, toStepId: end.id, outcome: "DEFAULT" } });
  await prisma.enterpriseWorkflowDefinition.update({ where: { id: definition.id }, data: { currentVersionId: version.id } });
  const run = await prisma.enterpriseWorkflowRun.create({ data: { organizationId, workflowDefinitionId: definition.id, workflowVersionId: version.id, status, triggerType: "DOMAIN_EVENT", triggerEventId: tag, sourceEntityType: "EnterpriseTask", sourceEntityId: tag, currentStepId: step.id, startedByUserId: prefix, ...(status === "WAITING_TIME" ? { resumeAt: new Date(Date.now() - 1000) } : {}) } });
  const stepRun = await prisma.enterpriseWorkflowStepRun.create({ data: { organizationId, workflowRunId: run.id, workflowStepId: step.id, status: stepStatus, attemptCount: stepStatus === "RUNNING" || stepStatus === "WAITING" ? 1 : 0, startedAt: new Date(Date.now() - 3_600_000) } });
  return { run, step, stepRun, definition };
}
const taskConfig = { taskType: "TASK", titleTemplate: "Test task", priority: "NORMAL" };
try {
  await prisma.user.create({ data: { id: prefix, name: "Workflow fixture", email: `${prefix}@example.test`, passwordHash: "disabled-test-fixture" } });
  await prisma.organization.create({ data: { id: organizationId, name: "Workflow recovery fixture" } });
  // Real SQL transactions/CAS: two wake-ups, future waits and stale runners.
  const waiting = await fixture("WAIT_UNTIL", { mode: "RELATIVE_HOURS", hours: 1 }, "WAITING_TIME", "WAITING");
  await Promise.all([engine.advanceWorkflowRun(waiting.run.id), engine.advanceWorkflowRun(waiting.run.id)]);
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: waiting.run.id } })).status, "COMPLETED");
  assert.equal(await prisma.enterpriseWorkflowEvent.count({ where: { workflowRunId: waiting.run.id, eventType: "ENTERPRISE_WORKFLOW_RUN_COMPLETED" } }), 1);
  const future = await fixture("WAIT_UNTIL", { mode: "RELATIVE_HOURS", hours: 1 }, "WAITING_TIME", "WAITING");
  await prisma.enterpriseWorkflowRun.update({ where: { id: future.run.id }, data: { resumeAt: new Date(Date.now() + 3_600_000) } });
  assert.equal((await engine.advanceWorkflowRun(future.run.id)).status, "WAITING_TIME");

  const concurrent = await fixture("CREATE_TASK", taskConfig);
  await Promise.all([engine.advanceWorkflowRun(concurrent.run.id), engine.advanceWorkflowRun(concurrent.run.id)]);
  assert.equal(taskCalls, 1, "Only one runner may invoke the task service");
  assert.equal(await prisma.enterpriseTask.count({ where: { organizationId } }), 1);
  // Simulate the crash window AFTER effect+receipt commit, BEFORE step completion.
  await prisma.enterpriseWorkflowRun.update({ where: { id: concurrent.run.id }, data: { status: "RUNNING", currentStepId: concurrent.step.id, completedAt: null, executionToken: "crashed", executionLeaseUntil: new Date(Date.now() - 1) } });
  await prisma.enterpriseWorkflowStepRun.update({ where: { id: concurrent.stepRun.id }, data: { status: "RUNNING", attemptCount: 3, completedAt: null } });
  await engine.advanceWorkflowRun(concurrent.run.id);
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: concurrent.run.id } })).status, "COMPLETED", "A receipt at the retry limit must still finalize without another effect");
  assert.equal(taskCalls, 1, "Recovery must reuse the committed task receipt");
  const replayed = await engine.startWorkflowRun({ organizationId, workflowDefinitionId: concurrent.definition.id, sourceEntityType: concurrent.run.sourceEntityType, sourceEntityId: concurrent.run.sourceEntityId, triggerEventId: concurrent.run.triggerEventId, triggerType: "DOMAIN_EVENT" });
  assert.equal(replayed.id, concurrent.run.id, "Terminal redelivery returns the pinned run");
  assert.equal(taskCalls, 1);

  // An approval linked before the receipt commits is canonical evidence. A
  // decision delivered before WAITING persistence is recovered by the sweep.
  const approvalRun = await fixture("CREATE_APPROVAL", { assignment: { strategy: "SPECIFIC_USER", userId: prefix } }, "RUNNING", "RUNNING");
  await prisma.enterpriseWorkflowActionAttempt.create({ data: { organizationId, stepRunId: approvalRun.stepRun.id, actionType: "CREATE_APPROVAL", status: "RUNNING", idempotencyKey: actions.workflowActionIdempotencyKey(approvalRun.run.id, approvalRun.step.id, "CREATE_APPROVAL") } });
  const approval = await prisma.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseTask", targetEntityId: approvalRun.run.sourceEntityId, requestedByUserId: `${prefix}-requester`, approverUserId: prefix, workflowRunId: approvalRun.run.id, workflowStepRunId: approvalRun.stepRun.id } });
  assert.equal((await engine.advanceWorkflowRun(approvalRun.run.id)).status, "WAITING_APPROVAL");
  assert.equal((await prisma.enterpriseWorkflowActionAttempt.findFirstOrThrow({ where: { stepRunId: approvalRun.stepRun.id } })).status, "SUCCEEDED");
  await prisma.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedAt: new Date() } });
  await engine.resumeWaitingRuns();
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: approvalRun.run.id } })).status, "COMPLETED");
  assert.equal(await prisma.enterpriseApproval.count({ where: { workflowStepRunId: approvalRun.stepRun.id } }), 1);

  // A past decision in a run now waiting for its next approval must not fill
  // the bounded recovery batch and starve another run's current decision.
  const nextApprovalStep = await prisma.enterpriseWorkflowStep.create({ data: { organizationId, workflowVersionId: approvalRun.run.workflowVersionId, code: "NEXT_APPROVAL", name: "Next approval", stepType: "CREATE_APPROVAL", position: 2, configurationJson: { assignment: { strategy: "SPECIFIC_USER", userId: prefix } } } });
  const nextApprovalStepRun = await prisma.enterpriseWorkflowStepRun.create({ data: { organizationId, workflowRunId: approvalRun.run.id, workflowStepId: nextApprovalStep.id, status: "WAITING", attemptCount: 1 } });
  await prisma.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseTask", targetEntityId: approvalRun.run.sourceEntityId, requestedByUserId: `${prefix}-requester`, approverUserId: prefix, workflowRunId: approvalRun.run.id, workflowStepRunId: nextApprovalStepRun.id } });
  await prisma.enterpriseWorkflowRun.update({ where: { id: approvalRun.run.id }, data: { status: "WAITING_APPROVAL", currentStepId: nextApprovalStep.id, completedAt: null } });
  const laterDecision = await fixture("CREATE_APPROVAL", { assignment: { strategy: "SPECIFIC_USER", userId: prefix } }, "WAITING_APPROVAL", "WAITING");
  await prisma.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseTask", targetEntityId: laterDecision.run.sourceEntityId, requestedByUserId: `${prefix}-requester`, approverUserId: prefix, workflowRunId: laterDecision.run.id, workflowStepRunId: laterDecision.stepRun.id, status: "APPROVED", decidedAt: new Date() } });
  await engine.resumeWaitingRuns(1);
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: laterDecision.run.id } })).status, "COMPLETED", "Old approval decisions must not starve a bounded recovery sweep");
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: approvalRun.run.id } })).status, "WAITING_APPROVAL");

  const notificationRun = await fixture("NOTIFICATION", { recipient: { strategy: "SPECIFIC_USER", userId: prefix }, titleTemplate: "Recovery", bodyTemplate: "Recovery fixture" }, "RUNNING", "RUNNING");
  const notificationKey = actions.workflowActionIdempotencyKey(notificationRun.run.id, notificationRun.step.id, "NOTIFICATION");
  await prisma.enterpriseWorkflowActionAttempt.create({ data: { organizationId, stepRunId: notificationRun.stepRun.id, actionType: "NOTIFICATION", status: "RUNNING", idempotencyKey: notificationKey } });
  const { notifyUser } = load("@/lib/notifications");
  const notification = await notifyUser({ organizationId, userId: prefix, title: "Recovery", body: "Recovery fixture", type: "WORKFLOW", idempotencyKey: notificationKey });
  await engine.advanceWorkflowRun(notificationRun.run.id);
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: notificationRun.run.id } })).status, "COMPLETED");
  assert.equal((await prisma.enterpriseWorkflowActionAttempt.findFirstOrThrow({ where: { stepRunId: notificationRun.stepRun.id } })).resultEntityId, notification.id);
  assert.equal(await prisma.notification.count({ where: { organizationId } }), 1);

  // Simulate crash BEFORE commit: both task and its receipt roll back.
  const rollback = await fixture("CREATE_TASK", taskConfig);
  taskFault = true;
  await engine.advanceWorkflowRun(rollback.run.id);
  taskFault = false;
  assert.equal(await prisma.enterpriseTask.count({ where: { organizationId } }), 1);
  await engine.retryWorkflowStep(rollback.run.id, prefix, "Retry rolled-back action");
  assert.equal(await prisma.enterpriseTask.count({ where: { organizationId } }), 2);

  // Legacy/unprovable effects are quarantined, including manual retry.
  const ambiguous = await fixture("DOMAIN_ACTION", { action: "START" }, "RUNNING", "RUNNING");
  await prisma.enterpriseWorkflowActionAttempt.create({ data: { organizationId, stepRunId: ambiguous.stepRun.id, actionType: "DOMAIN_ACTION:START", status: "RUNNING", idempotencyKey: actions.workflowActionIdempotencyKey(ambiguous.run.id, ambiguous.step.id, "DOMAIN_ACTION:START") } });
  await engine.advanceWorkflowRun(ambiguous.run.id);
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: ambiguous.run.id } })).status, "BLOCKED");
  await assert.rejects(engine.retryWorkflowStep(ambiguous.run.id, prefix, "Inspect"), (error) => error.code === "WORKFLOW_ACTION_RECONCILIATION_REQUIRED");
  assert.equal(domainCalls, 0);

  // The current worker may finish its in-flight action after cancellation,
  // but the receipt must never resurrect the run or start the END step.
  let entered;
  const inside = new Promise((resolve) => { entered = resolve; });
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  domainPause = async () => { entered(); await released; };
  const cancelled = await fixture("DOMAIN_ACTION", { action: "START" });
  const advancing = engine.advanceWorkflowRun(cancelled.run.id);
  await inside;
  const current = await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: cancelled.run.id } });
  await engine.cancelWorkflowRun(current.id, prefix, "Cancel during action", current.revision, true);
  release(); await advancing; domainPause = null;
  assert.equal((await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: current.id } })).status, "CANCELLED");
  assert.equal(await prisma.enterpriseWorkflowStepRun.count({ where: { workflowRunId: current.id } }), 1);
  assert.equal((await prisma.enterpriseWorkflowActionAttempt.findFirstOrThrow({ where: { stepRunId: cancelled.stepRun.id } })).status, "SUCCEEDED");

  // Real effects without a success receipt are not retried on an unknown error.
  domainFault = true;
  const uncertain = await fixture("DOMAIN_ACTION", { action: "START" });
  await engine.advanceWorkflowRun(uncertain.run.id); domainFault = false;
  assert.equal((await prisma.enterpriseWorkflowActionAttempt.findFirstOrThrow({ where: { stepRunId: uncertain.stepRun.id } })).status, "UNCERTAIN");
  await assert.rejects(engine.retryWorkflowStep(uncertain.run.id, prefix, "No proof"), (error) => error.code === "WORKFLOW_ACTION_RECONCILIATION_REQUIRED");

  const tenant = await fixture("CREATE_TASK", taskConfig);
  const token = await lease.acquireWorkflowExecution(tenant.run.id);
  await assert.rejects(actions.beginWorkflowActionAttempt({ organizationId: otherTenant, runId: tenant.run.id, stepId: tenant.step.id, stepRunId: tenant.stepRun.id, actionType: "CREATE_TASK", executionToken: token }), (error) => error.code === "WORKFLOW_EXECUTION_LEASE_LOST");
  await lease.releaseWorkflowExecution(tenant.run.id, token);

  // Production worker SQL for BOTH modes: reclaim only expired PROCESSING;
  // max-attempt crashes go DEAD rather than being retried forever.
  for (const processEvents of workers) {
    const tag = `${prefix}-event-${sequence++}`;
    for (const [suffix, seconds, attemptCount] of [["expired", -120, 1], ["active", 0, 1], ["exhausted", -120, 3]]) {
      await prisma.enterpriseDomainEvent.create({ data: { id: `${tag}-${suffix}`, organizationId, eventType: "WF813_NO_DEFINITIONS", entityType: "WF813_TEST", entityId: tag, idempotencyKey: `${tag}-${suffix}`, processingStatus: "PROCESSING", lockedBy: "old-worker", lockedAt: new Date(Date.now() + seconds * 1000), attemptCount } });
    }
    await Promise.all([processEvents(), processEvents()]);
    const expired = await prisma.enterpriseDomainEvent.findUniqueOrThrow({ where: { id: `${tag}-expired` } });
    assert.equal(expired.processingStatus, "PROCESSED"); assert.equal(expired.attemptCount, 2);
    assert.equal((await prisma.enterpriseDomainEvent.findUniqueOrThrow({ where: { id: `${tag}-active` } })).processingStatus, "PROCESSING");
    assert.equal((await prisma.enterpriseDomainEvent.findUniqueOrThrow({ where: { id: `${tag}-exhausted` } })).processingStatus, "DEAD");
    await prisma.enterpriseDomainEvent.deleteMany({ where: { id: { startsWith: tag } } });
  }
  console.log("PASS WF-00 PostgreSQL: concurrent wake/claim, atomic effect rollback, crash after receipt, ambiguity quarantine, cancellation fencing, tenant ownership, both worker SQL recovery modes.");
} finally {
  await prisma.enterpriseDomainEvent.deleteMany({ where: { organizationId } });
  await prisma.enterpriseApproval.deleteMany({ where: { organizationId } });
  await prisma.enterpriseWorkflowRun.deleteMany({ where: { organizationId } });
  await prisma.enterpriseWorkflowTransition.deleteMany({ where: { organizationId } });
  await prisma.enterpriseWorkflowStep.deleteMany({ where: { organizationId } });
  await prisma.enterpriseWorkflowVersion.deleteMany({ where: { organizationId } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { organizationId } });
  await prisma.enterpriseTask.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.user.deleteMany({ where: { id: prefix } });
  await prisma.$disconnect();
}
