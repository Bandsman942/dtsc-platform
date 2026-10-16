import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// Never connect integration fixtures to a nonlocal or non-test database.
const db = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(db.hostname) && /test/i.test(db.pathname),
  "WF-06S2C requires localhost/*test* PostgreSQL");
const prisma = new PrismaClient();
const prefix = `wf848-${randomUUID()}`;
const org = `${prefix}-client`, other = `${prefix}-other`, actor = `${prefix}-actor`;
const definitions = [], versions = [], schedules = [], tasks = [];
let WorkflowError;
let workflowsAllowed = true, sourceAllowed = true, actorAllowed = true;
const loader = workflowTestLoader({
  "@/lib/prisma": { prisma },
  "@/lib/enterprise/module-access": {
    resolveEnterpriseModuleAccess: async ({ moduleCode }) => ({
      allowed: moduleCode === "WORKFLOWS" && workflowsAllowed,
    }),
  },
  "@/lib/enterprise/workflows/adapters": {
    getWorkflowEntityAdapter: (entityType) => {
      if (entityType !== "EnterpriseTask") {
        throw new WorkflowError("Unsupported.", 400, "WORKFLOW_ENTITY_TYPE_UNSUPPORTED", "CONFIGURATION");
      }
      return {
        entityType,
        loadEntity: async (organizationId, id) => {
          const entity = await prisma.enterpriseTask.findFirst({
            where: { id, organizationId, archivedAt: null },
            select: { id: true, organizationId: true, createdByUserId: true, status: true, revision: true },
          });
          if (!entity) throw new WorkflowError("Entity not found.", 404, "WORKFLOW_SOURCE_NOT_FOUND", "BUSINESS");
          return entity;
        },
      };
    },
  },
  "@/lib/enterprise/workflows/source-access": {
    requireWorkflowSourceAccess: async ({ organizationId, userId, sourceEntityType }) => {
      if (!sourceAllowed || organizationId !== org || userId !== actor || sourceEntityType !== "EnterpriseTask") {
        throw new WorkflowError("ERP module denied.", 403, "WORKFLOW_SOURCE_MODULE_ACCESS_DENIED", "SECURITY");
      }
      return { allowed: true };
    },
  },
  "@/lib/enterprise/workflows/runtime-utils": {
    resolveWorkflowExecutionUser: async ({ organizationId, startedByUserId }) => {
      const member = await prisma.organizationMember.findFirst({
        where: { organizationId, userId: startedByUserId, status: "ACTIVE", removedAt: null },
        select: { userId: true },
      });
      if (!member || !actorAllowed) {
        throw new WorkflowError("Actor revoked.", 403, "WORKFLOW_EXECUTION_MANDATE_REVOKED", "SECURITY");
      }
      return member.userId;
    },
  },
});
WorkflowError = loader("@/lib/enterprise/workflows/errors").EnterpriseWorkflowError;
const { getNextWorkflowOccurrence } = loader("@/lib/enterprise/workflows/advanced-schedule");
const { assertDisabledWorkflowScheduleReadiness: preflight, WORKFLOW_SCHEDULE_SAFETY: limits } =
  loader("@/lib/enterprise/workflows/schedule-readiness");
const asOf = new Date("2026-10-31T22:00:00Z");
const config = { frequency: "DAILY", timeZone: "America/New_York", hour: 1, minute: 30 };
const define = async (organizationId, label) => {
  const definition = await prisma.enterpriseWorkflowDefinition.create({
    data: {
      organizationId, code: `WF848_${label}`, name: "Readonly WF848",
      triggerType: "MANUAL", triggerEntityType: "EnterpriseTask",
      status: "ACTIVE", createdByUserId: actor,
    },
  });
  definitions.push(definition.id);
  const version = await prisma.enterpriseWorkflowVersion.create({
    data: {
      organizationId, definitionId: definition.id, versionNumber: 1, status: "PUBLISHED",
      createdByUserId: actor, publishedAt: asOf,
    },
  });
  versions.push(version.id);
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: definition.id }, data: { currentVersionId: version.id },
  });
  return { definition, version };
};
const makeSchedule = async (definition, version, overrides = {}) => {
  const id = randomUUID();
  const due = getNextWorkflowOccurrence(config, asOf, {
    organizationId: org, scheduleId: id, versionId: version.id,
  });
  assert.equal(due.scheduledAt.toISOString(), "2026-11-01T05:30:00.000Z", "FIRST DST fold is 05:30Z");
  const schedule = await prisma.enterpriseWorkflowSchedule.create({
    data: {
      id, organizationId: org, workflowDefinitionId: definition.id, workflowVersionId: version.id,
      ...config, nextRunAt: due.scheduledAt, createdByUserId: actor, status: "DISABLED",
      sourceEntityType: "EnterpriseTask", sourceEntityId: tasks[0],
      executionActorUserId: actor, mandateVerifiedAt: asOf,
      ...overrides,
    },
  });
  schedules.push(schedule.id);
  return schedule;
};
const rejects = async (input, code) => assert.rejects(
  preflight(input),
  (error) => error.code === code,
  `Expected fail-closed ${code}`,
);

try {
  await prisma.organization.createMany({ data: [
    { id: org, name: "WF848 CLIENT", organizationType: "CLIENT", status: "ACTIVE" },
    { id: other, name: "WF848 OTHER", organizationType: "CLIENT", status: "ACTIVE" },
  ] });
  await prisma.user.create({ data: {
    id: actor, name: "WF848 test actor", email: `${actor}@example.test`, passwordHash: "fixture",
  } });
  await prisma.organizationMember.create({ data: {
    organizationId: org, userId: actor, role: "OWNER", status: "ACTIVE",
  } });
  const own = await define(org, "MAIN");
  const task = await prisma.enterpriseTask.create({
    data: { organizationId: org, title: "WF848 business source", createdByUserId: actor },
  });
  tasks.push(task.id);
  const foreignTask = await prisma.enterpriseTask.create({
    data: { organizationId: other, title: "WF848 foreign source", createdByUserId: actor },
  });
  tasks.push(foreignTask.id);
  const valid = await makeSchedule(own.definition, own.version);
  const payload = { organizationId: org, scheduleId: valid.id, asOf };
  const before = {
    runs: await prisma.enterpriseWorkflowRun.count({ where: { organizationId: org } }),
    receipts: await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { organizationId: org } }),
    events: await prisma.enterpriseDomainEvent.count({ where: { organizationId: org } }),
    revision: valid.revision,
  };
  const ready = await preflight(payload);
  assert.deepEqual(Object.keys(ready).sort(), [
    "kind", "nextRunAt", "organizationId", "revision", "scheduleId", "status", "workflowVersionId",
  ].sort());
  assert.equal(ready.kind, "INERT_READINESS_ONLY");
  assert.equal(ready.status, "DISABLED");
  assert.equal(ready.nextRunAt.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.ok(Object.isFrozen(ready));
  await rejects({ ...payload, scheduleId: "nonexistent" }, "WORKFLOW_PREFLIGHT_SCHEDULE_NOT_FOUND");
  await rejects({ ...payload, organizationId: other }, "WORKFLOW_PREFLIGHT_SCHEDULE_NOT_FOUND");
  await rejects({ ...payload, asOf: new Date("invalid") }, "WORKFLOW_PREFLIGHT_TIME_INVALID");

  workflowsAllowed = false;
  await rejects(payload, "WORKFLOW_PREFLIGHT_WORKFLOWS_DENIED");
  workflowsAllowed = true;
  sourceAllowed = false;
  await rejects(payload, "WORKFLOW_SOURCE_MODULE_ACCESS_DENIED");
  sourceAllowed = true;
  actorAllowed = false;
  await rejects(payload, "WORKFLOW_EXECUTION_MANDATE_REVOKED");
  actorAllowed = true;

  await prisma.organizationMember.updateMany({
    where: { organizationId: org, userId: actor }, data: { removedAt: asOf },
  });
  await rejects(payload, "WORKFLOW_PREFLIGHT_ACTOR_REVOKED");
  await prisma.organizationMember.updateMany({
    where: { organizationId: org, userId: actor }, data: { removedAt: null },
  });
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: null },
  });
  await rejects(payload, "WORKFLOW_PREFLIGHT_VERSION_RETIRED");
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: own.version.id },
  });

  await prisma.enterpriseWorkflowSchedule.update({
    where: { id: valid.id }, data: { sourceEntityId: foreignTask.id },
  });
  await rejects(payload, "WORKFLOW_SOURCE_NOT_FOUND");
  await prisma.enterpriseWorkflowSchedule.update({
    where: { id: valid.id }, data: { sourceEntityId: task.id },
  });
  await prisma.enterpriseWorkflowSchedule.update({
    where: { id: valid.id }, data: { nextRunAt: new Date("2026-11-01T06:30:00.000Z") },
  });
  await rejects(payload, "WORKFLOW_PREFLIGHT_CURSOR_INCONSISTENT");
  await prisma.enterpriseWorkflowSchedule.update({
    where: { id: valid.id }, data: { nextRunAt: new Date("2026-11-01T05:30:00.000Z") },
  });
  await rejects({ ...payload, asOf: new Date("2026-11-03T12:00:00Z") }, "WORKFLOW_PREFLIGHT_CATCHUP_EXCEEDED");
  assert.equal((await preflight({ ...payload, asOf: new Date("2026-11-01T05:31:00Z") })).kind,
    "INERT_READINESS_ONLY", "One bounded catch-up remains a passive assessment");

  const unattested = await makeSchedule(own.definition, own.version, {
    sourceEntityType: null, sourceEntityId: null, executionActorUserId: null, mandateVerifiedAt: null,
  });
  await rejects({ ...payload, scheduleId: unattested.id }, "WORKFLOW_PREFLIGHT_MANDATE_MISSING");

  // Create more than 10 tenant-owned schedules on the same definition.
  const bulkIds = Array.from({ length: limits.maxSchedulesPerDefinition - 2 }, () => randomUUID());
  await prisma.enterpriseWorkflowSchedule.createMany({
    data: bulkIds.map((id) => ({
      id, organizationId: org, workflowDefinitionId: own.definition.id, workflowVersionId: own.version.id,
      ...config, status: "DISABLED", createdByUserId: actor,
    })),
  });
  schedules.push(...bulkIds);
  // Exactly 10 on the same definition is allowed.
  assert.equal((await preflight(payload)).kind, "INERT_READINESS_ONLY");
  const overId = randomUUID();
  await prisma.enterpriseWorkflowSchedule.create({ data: {
    id: overId, organizationId: org, workflowDefinitionId: own.definition.id,
    workflowVersionId: own.version.id, ...config, status: "DISABLED", createdByUserId: actor,
  } });
  schedules.push(overId);
  await rejects(payload, "WORKFLOW_PREFLIGHT_SAFETY_LIMIT");
  await prisma.enterpriseWorkflowSchedule.delete({ where: { id: overId } });
  schedules.splice(schedules.indexOf(overId), 1);

  // Tenant ceiling is independent of per-definition limit (5 x 9 schedules).
  const others = [];
  for (let i = 0; i < 5; i++) others.push(await define(org, `EXTRA${i}`));
  const extraIds = [];
  const extra = [];
  for (const { definition, version } of others) {
    for (let j = 0; j < 9; j++) {
      const id = randomUUID();
      extraIds.push(id);
      extra.push({
        id, organizationId: org, workflowDefinitionId: definition.id, workflowVersionId: version.id,
        ...config, status: "DISABLED", createdByUserId: actor,
      });
    }
  }
  await prisma.enterpriseWorkflowSchedule.createMany({ data: extra });
  schedules.push(...extraIds);
  assert.ok(await prisma.enterpriseWorkflowSchedule.count({ where: { organizationId: org } })
    > limits.maxSchedulesPerTenant);
  await rejects(payload, "WORKFLOW_PREFLIGHT_SAFETY_LIMIT");

  const current = await prisma.enterpriseWorkflowSchedule.findFirstOrThrow({
    where: { id: valid.id, organizationId: org }, select: { revision: true, status: true },
  });
  assert.equal(current.revision, before.revision);
  assert.equal(current.status, "DISABLED");
  assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId: org } }), before.runs);
  assert.equal(await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { organizationId: org } }), before.receipts);
  assert.equal(await prisma.enterpriseDomainEvent.count({ where: { organizationId: org } }), before.events);

  const source = readFileSync("lib/enterprise/workflows/schedule-readiness.ts", "utf8");
  for (const guard of ["resolveEnterpriseModuleAccess", "requireWorkflowSourceAccess",
    "getWorkflowEntityAdapter", "resolveWorkflowExecutionUser", "getNextWorkflowOccurrence",
    "status: \"DISABLED\"", "WORKFLOW_PREFLIGHT_CURSOR_INCONSISTENT", "INERT_READINESS_ONLY"]) {
    assert.ok(source.includes(guard), `Preflight guard missing: ${guard}`);
  }
  for (const disallowed of ["startWorkflowRun(", "reserveDueStagedWorkflowOccurrence(",
    "enterpriseWorkflowRun.create(", "enterpriseDomainEvent.create(", "enterpriseWorkflowSchedule.update("]) {
    assert.ok(!source.includes(disallowed), `Read-only preflight attempted a mutation: ${disallowed}`);
  }
  console.log("PASS WF-06S2C real PostgreSQL: live plan/source/actor gates, 2 tenants, version, DST FIRST, bounded catch-up, anti-flood safety ceilings and no ERP run/receipt/event.");
} finally {
  await prisma.enterpriseWorkflowScheduleOccurrence.deleteMany({ where: { scheduleId: { in: schedules } } });
  await prisma.enterpriseWorkflowSchedule.deleteMany({ where: { id: { in: schedules } } });
  await prisma.enterpriseTask.deleteMany({ where: { id: { in: tasks } } });
  await prisma.enterpriseWorkflowVersion.deleteMany({ where: { id: { in: versions } } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { id: { in: definitions } } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: org, userId: actor } });
  await prisma.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await prisma.user.deleteMany({ where: { id: actor } });
  await prisma.$disconnect();
}
