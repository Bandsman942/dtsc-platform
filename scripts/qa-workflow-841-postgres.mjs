import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// A destructive, real-PostgreSQL QA; refuse remote/production DBs even with a
// mistakenly supplied DATABASE_URL. CI provides dtsc_quality_test and
// dtsc_migration_test on localhost.
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname) && /test/.test(url.pathname),
  "WF-06S1 requires an isolated local test PostgreSQL database");
const prisma = new PrismaClient();
const prefix = `wf841-${randomUUID()}`;
const organizationId = `${prefix}-tenant`;
const otherTenant = `${prefix}-other`;
const actor = `${prefix}-actor`;
const loader = workflowTestLoader({ "@/lib/prisma": { prisma } });
const { getNextWorkflowOccurrence } = loader("@/lib/enterprise/workflows/advanced-schedule");
const { reserveDueStagedWorkflowOccurrence: reserve } = loader("@/lib/enterprise/workflows/schedule-ledger");

const makeDefinition = async (tenant, suffix) => {
  const definition = await prisma.enterpriseWorkflowDefinition.create({
    data: { organizationId: tenant, code: `WF841_${suffix}`, name: "Staged ledger verification", status: "ACTIVE", triggerType: "MANUAL", createdByUserId: actor },
  });
  const version = await prisma.enterpriseWorkflowVersion.create({
    data: { organizationId: tenant, definitionId: definition.id, versionNumber: 1, status: "PUBLISHED", publishedAt: new Date("2026-10-16T15:00:00Z"), createdByUserId: actor },
  });
  await prisma.enterpriseWorkflowDefinition.update({ where: { id: definition.id }, data: { currentVersionId: version.id } });
  return { definition, version };
};
const scheduleConfig = { frequency: "DAILY", timeZone: "America/New_York", hour: 1, minute: 30 };
const due = "2026-11-01T05:30:00.000Z"; // first 01:30 on fall-back
const next = "2026-11-02T06:30:00.000Z"; // next day, no second 01:30
const schedules = [];
const definitions = [];
const versions = [];

try {
  const a = await makeDefinition(organizationId, "A");
  const b = await makeDefinition(otherTenant, "B");
  definitions.push(a.definition.id, b.definition.id);
  versions.push(a.version.id, b.version.id);

  const staged = await prisma.enterpriseWorkflowSchedule.create({
    data: {
      organizationId, workflowDefinitionId: a.definition.id, workflowVersionId: a.version.id,
      ...scheduleConfig, status: "STAGED", createdByUserId: actor, nextRunAt: new Date(due),
    },
  });
  schedules.push(staged.id);
  assert.equal(staged.revision, 1);
  const expected = getNextWorkflowOccurrence(scheduleConfig, new Date("2026-11-01T05:29:59Z"),
    { organizationId, scheduleId: staged.id, versionId: a.version.id });
  assert.equal(expected.scheduledAt.toISOString(), due);

  const competitor = await prisma.enterpriseWorkflowSchedule.create({
    data: { organizationId: otherTenant, workflowDefinitionId: b.definition.id, workflowVersionId: b.version.id,
      ...scheduleConfig, status: "STAGED", nextRunAt: new Date(due), createdByUserId: actor },
  });
  schedules.push(competitor.id);
  const disabled = await prisma.enterpriseWorkflowSchedule.create({
    data: { organizationId, workflowDefinitionId: a.definition.id, workflowVersionId: a.version.id,
      ...scheduleConfig, nextRunAt: new Date(due), createdByUserId: actor },
  });
  schedules.push(disabled.id);
  assert.equal(disabled.status, "DISABLED");
  assert.equal(await reserve(organizationId, disabled.id, new Date(due)), null);
  assert.equal(await reserve(otherTenant, staged.id, new Date(due)), null, "cross-tenant id rejected");
  assert.equal(await reserve(organizationId, competitor.id, new Date(due)), null, "other tenant id rejected");
  assert.equal(await reserve(organizationId, staged.id, new Date("2026-11-01T05:29:59Z")), null, "never reserve early");

  // Competing workers can only reserve one ledger row; the cursor increment is
  // a part of the SAME transaction as the unique receipt insertion.
  const results = await Promise.all(Array.from({ length: 12 }, () =>
    reserve(organizationId, staged.id, new Date("2026-11-01T05:35:00Z"))));
  assert.equal(results.filter(Boolean).length, 1, "only one worker may reserve the due occurrence");
  const receipt = results.find(Boolean);
  assert.equal(receipt.scheduledAt.toISOString(), due);
  assert.equal(receipt.nextRunAt.toISOString(), next);
  const occurrenceCount = await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { scheduleId: staged.id } });
  assert.equal(occurrenceCount, 1);
  const cursor = await prisma.enterpriseWorkflowSchedule.findUnique({ where: { id: staged.id } });
  assert.equal(cursor.nextRunAt.toISOString(), next);
  assert.equal(cursor.revision, 2);
  assert.equal(await reserve(organizationId, staged.id, new Date("2026-11-01T06:35:00Z")), null,
    "second fall-back 01:30 is never a second reservation");
  assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId } }), 0,
    "reservation must never start a domain workflow");

  // A replayed cursor is skipped by DB UNIQUE and still advances atomically.
  await prisma.enterpriseWorkflowSchedule.update({ where: { id: staged.id },
    data: { nextRunAt: new Date(due) } });
  assert.equal(await reserve(organizationId, staged.id, new Date("2026-11-01T05:35:00Z")), null);
  assert.equal(await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { scheduleId: staged.id } }), 1);
  assert.equal((await prisma.enterpriseWorkflowSchedule.findUnique({ where: { id: staged.id } })).nextRunAt.toISOString(), next);

  // A corrupt cursor pointing to the SECOND DST-fold instant fails closed
  // without modifying the cursor or any ledger row.
  const duplicateFold = "2026-11-01T06:30:00.000Z";
  await prisma.enterpriseWorkflowSchedule.update({ where: { id: staged.id },
    data: { nextRunAt: new Date(duplicateFold) } });
  await assert.rejects(() => reserve(organizationId, staged.id, new Date("2026-11-01T06:35:00Z")),
    /WORKFLOW_SCHEDULE_CURSOR_INCONSISTENT/);
  assert.equal((await prisma.enterpriseWorkflowSchedule.findUnique({ where: { id: staged.id } })).nextRunAt.toISOString(), duplicateFold);
  assert.equal(await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { scheduleId: staged.id } }), 1);

  // Cross-definition version FKs are enforced by PostgreSQL, even if callers
  // bypass the service and attempt a direct Prisma write.
  await assert.rejects(() => prisma.enterpriseWorkflowSchedule.create({
    data: { organizationId, workflowDefinitionId: a.definition.id, workflowVersionId: b.version.id,
      ...scheduleConfig, nextRunAt: new Date(due), status: "STAGED", createdByUserId: actor },
  }));
  await assert.rejects(() => prisma.enterpriseWorkflowScheduleOccurrence.create({
    data: { organizationId: otherTenant, scheduleId: staged.id, workflowVersionId: a.version.id,
      localDate: "2026-11-01", localTime: "01:30", timeZone: "America/New_York",
      scheduledAt: new Date(due), occurrenceKey: "0".repeat(64) },
  }), "cross-tenant receipt must fail FK");

  const out = await reserve(otherTenant, competitor.id, new Date("2026-11-01T05:35:00Z"));
  assert.ok(out);
  assert.notEqual(out.occurrenceKey, receipt.occurrenceKey, "tenant-scoped unique key");
  assert.equal(await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { scheduleId: competitor.id } }), 1);
  console.log("PASS WF-06S1 PostgreSQL: tenant+definition+version FKs, atomic cursor/receipt, 12 concurrent workers, DST fold, replay, corruption rollback and DISABLED default.");
} finally {
  await prisma.enterpriseWorkflowScheduleOccurrence.deleteMany({ where: { scheduleId: { in: schedules } } });
  await prisma.enterpriseWorkflowSchedule.deleteMany({ where: { id: { in: schedules } } });
  await prisma.enterpriseWorkflowVersion.deleteMany({ where: { id: { in: versions } } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { id: { in: definitions } } });
  await prisma.$disconnect();
}
