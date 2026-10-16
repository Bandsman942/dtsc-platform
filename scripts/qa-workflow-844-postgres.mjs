import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// Integration assertions mutate records: never point this script at production.
const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(database.hostname) && /test/.test(database.pathname),
  "WF-06S2A requires a dedicated local test PostgreSQL DB");
const prisma = new PrismaClient();
const prefix = `wf844-${randomUUID()}`;
const organizationId = `${prefix}-tenant`, otherTenant = `${prefix}-other`, actor = `${prefix}-actor`;
const loader = workflowTestLoader({ "@/lib/prisma": { prisma } });
const { createDisabledWorkflowSchedule: create, disabledWorkflowScheduleCreateSchema: schema } =
  loader("@/lib/enterprise/workflows/schedule-authoring");
const schedules = [], definitions = [], versions = [];
const makeDefinition = async (tenant, suffix, source = "EnterpriseTask") => {
  const definition = await prisma.enterpriseWorkflowDefinition.create({
    data: { organizationId: tenant, code: `WF844_${suffix}`, name: "Inert schedule authoring QA",
      status: "ACTIVE", triggerType: "MANUAL", triggerEntityType: source, createdByUserId: actor },
  });
  const version = await prisma.enterpriseWorkflowVersion.create({
    data: { organizationId: tenant, definitionId: definition.id, versionNumber: 1,
      status: "PUBLISHED", createdByUserId: actor, publishedAt: new Date("2026-10-16T16:00:00Z") },
  });
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: definition.id }, data: { currentVersionId: version.id },
  });
  definitions.push(definition.id);
  versions.push(version.id);
  return { definition, version };
};
const schedule = { frequency: "DAILY", timeZone: "America/New_York", hour: 1, minute: 30 };
const date = new Date("2026-10-31T20:00:00Z");
try {
  for (const id of [organizationId, otherTenant]) {
    await prisma.organization.create({
      data: { id, name: "WF-06S2A fixture", organizationType: "CLIENT", status: "ACTIVE" },
    });
  }
  await prisma.user.create({ data: { id: actor, email: `${actor}@example.test`,
    name: "Disabled scheduler QA", passwordHash: "disabled-test-fixture" } });
  await prisma.organizationMember.create({ data: {
    organizationId, userId: actor, role: "OWNER", status: "ACTIVE",
  } });
  const own = await makeDefinition(organizationId, "A");
  const external = await makeDefinition(otherTenant, "B");
  const sourceless = await makeDefinition(organizationId, "C", null);
  const base = { workflowDefinitionId: own.definition.id, workflowVersionId: own.version.id, schedule };

  assert.equal(schema.safeParse({ ...base, status: "ENABLED" }).success, false,
    "Caller cannot supply an executable status");
  assert.equal(schema.safeParse({ ...base, schedule: { ...schedule, timeZone: "Invalid/Zone" } }).success, false);
  assert.equal(schema.safeParse({ ...base, schedule: { ...schedule, frequency: "WEEKLY" } }).success, false);
  assert.equal(schema.safeParse({ ...base, schedule: { ...schedule, dayOfWeek: 3 } }).success, false);

  const beforeRuns = await prisma.enterpriseWorkflowRun.count({ where: { organizationId } });
  const created = await create({ organizationId, actorUserId: actor, payload: base, asOf: date });
  schedules.push(created.id);
  assert.equal(created.status, "DISABLED");
  assert.equal(created.nextRunAt.toISOString(), "2026-11-01T05:30:00.000Z",
    "Fall-back always uses the first 01:30 local instant");
  assert.equal(created.workflowVersionId, own.version.id);
  const persisted = await prisma.enterpriseWorkflowSchedule.findFirstOrThrow({
    where: { id: created.id, organizationId },
  });
  assert.equal(persisted.createdByUserId, actor);
  assert.equal(persisted.status, "DISABLED");

  const second = await create({
    organizationId, actorUserId: actor, payload: base,
    asOf: new Date("2026-11-01T05:31:00Z"),
  });
  schedules.push(second.id);
  assert.equal(second.nextRunAt.toISOString(), "2026-11-02T06:30:00.000Z",
    "Second DST fold must never create a second same-day schedule");
  assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId } }), beforeRuns);
  assert.equal(await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { scheduleId: { in: schedules } } }), 0,
    "Authoring does not reserve receipts or dispatch runs");

  await assert.rejects(
    create({ organizationId: otherTenant, actorUserId: actor, payload: base, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE",
    "Cross-tenant definition/version rejected before writing",
  );
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: {
      workflowDefinitionId: own.definition.id, workflowVersionId: external.version.id, schedule,
    }, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE",
    "Cannot attach another tenant's version",
  );
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: {
      workflowDefinitionId: sourceless.definition.id, workflowVersionId: sourceless.version.id, schedule,
    }, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_SOURCE_REQUIRED",
  );
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: null },
  });
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: base, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE",
    "Retired/replaced current version must fail closed",
  );
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: own.version.id },
  });
  await prisma.organizationMember.updateMany({
    where: { organizationId, userId: actor }, data: { removedAt: new Date() },
  });
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: base, asOf: date }),
    (error) => error.code === "WORKFLOW_MEMBERSHIP_REQUIRED",
    "Revoked author cannot create schedule even through direct service invocation",
  );
  assert.equal(await prisma.enterpriseWorkflowSchedule.count({ where: { organizationId } }), 2);
  assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId } }), beforeRuns);

  // Static route gates complement real DB service assertions; no mock grants.
  const route = readFileSync("app/api/enterprise/[organizationId]/workflow-schedules/route.ts", "utf8");
  for (const guard of ["getSession", "getEnterpriseWorkflowAccess", "canCreateDraft",
    "requireWorkflowSourceAccess", "isSameOriginRequest", "rateLimit(", "writeAuditLog",
    "listReadableWorkflowEntityTypes", "status: \"DISABLED\""]) {
    assert.ok(route.includes(guard), `Schedule route missing guard: ${guard}`);
  }
  assert.ok(!route.includes("reserveDueStagedWorkflowOccurrence"));
  console.log("PASS WF-06S2A PostgreSQL: disabled-only drafts, 2 tenants, active membership, current version, DST fold, zero runs/receipts, API guard contract.");
} finally {
  await prisma.enterpriseWorkflowScheduleOccurrence.deleteMany({ where: { scheduleId: { in: schedules } } });
  await prisma.enterpriseWorkflowSchedule.deleteMany({ where: { id: { in: schedules } } });
  await prisma.enterpriseWorkflowVersion.deleteMany({ where: { id: { in: versions } } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { id: { in: definitions } } });
  await prisma.organizationMember.deleteMany({ where: { organizationId, userId: actor } });
  await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherTenant] } } });
  await prisma.user.deleteMany({ where: { id: actor } });
  await prisma.$disconnect();
}
