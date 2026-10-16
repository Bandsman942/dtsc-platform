import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// QA fixtures MUST NEVER reach production or remote databases.
const target = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(target.hostname) && /test/i.test(target.pathname),
  "WF-06S2D needs isolated localhost/*test* PostgreSQL");
const prisma = new PrismaClient();
const seed = `wf850-${randomUUID()}`;
const tenants = [`${seed}-a`, `${seed}-b`], defs = [], versions = [], schedules = [], receipts = [];
try {
  for (let i = 0; i < tenants.length; i++) {
    const organizationId = tenants[i];
    await prisma.organization.create({
      data: { id: organizationId, name: "WF-06S2D fixture", organizationType: "CLIENT", status: "ACTIVE" },
    });
    const def = await prisma.enterpriseWorkflowDefinition.create({
      data: { organizationId, code: `WF850_${i}`, name: "Inert receipt",
        status: "ACTIVE", triggerType: "MANUAL", createdByUserId: seed },
    });
    defs.push(def.id);
    const version = await prisma.enterpriseWorkflowVersion.create({
      data: { organizationId, definitionId: def.id, versionNumber: 1,
        status: "PUBLISHED", createdByUserId: seed },
    });
    versions.push(version.id);
    await prisma.enterpriseWorkflowDefinition.update({ where: { id: def.id }, data: { currentVersionId: version.id } });
    const schedule = await prisma.enterpriseWorkflowSchedule.create({
      data: { organizationId, workflowDefinitionId: def.id, workflowVersionId: version.id,
        frequency: "DAILY", timeZone: "UTC", hour: 8, minute: 0, status: "DISABLED",
        nextRunAt: new Date("2026-10-17T08:00:00.000Z"), createdByUserId: seed },
    });
    schedules.push(schedule.id);
    const receipt = await prisma.enterpriseWorkflowScheduleOccurrence.create({
      data: { organizationId, scheduleId: schedule.id, workflowVersionId: version.id,
        localDate: "2026-10-17", localTime: "08:00", timeZone: "UTC",
        scheduledAt: new Date("2026-10-17T08:00:00.000Z"),
        occurrenceKey: (i === 0 ? "a" : "b").repeat(64) },
    });
    receipts.push(receipt.id);
    assert.equal(receipt.status, "RESERVED");
    assert.equal(receipt.attemptCount, 0);
    assert.equal(receipt.revision, 1);
    assert.equal(receipt.claimToken, null);
    assert.equal(receipt.workflowRunId, null);
    assert.equal(receipt.outboxEventId, null);
    assert.ok(receipt.updatedAt instanceof Date);
  }
  const rejected = [
    { status: "READY" }, { status: "CLAIMED" },
    { claimToken: randomUUID() }, { leaseUntil: new Date("2026-10-17T08:01:00Z") },
    { attemptCount: 1 }, { claimedAt: new Date("2026-10-17T08:00:00Z") },
    { completedAt: new Date("2026-10-17T08:00:01Z") }, { lastFailureCode: "RETRY" },
    { workflowRunId: randomUUID() }, { outboxEventId: randomUUID() }, { revision: 0 },
  ];
  for (const data of rejected) {
    await assert.rejects(prisma.enterpriseWorkflowScheduleOccurrence.update({ where: { id: receipts[0] }, data }),
      "DB must reject premature receipts and claims");
  }
  const after = await prisma.enterpriseWorkflowScheduleOccurrence.findUniqueOrThrow({ where: { id: receipts[0] } });
  assert.equal(after.status, "RESERVED");
  assert.equal(after.attemptCount, 0);
  assert.equal(after.revision, 1);
  assert.equal(after.workflowRunId, null);
  assert.equal(after.outboxEventId, null);
  assert.equal(after.claimToken, null);
  const guards = await prisma.$queryRaw`
    SELECT conname FROM pg_constraint WHERE conname IN
      ('EW_Occurrence_inert_execution_check', 'EW_Occurrence_revision_check',
       'EW_Occurrence_run_fkey', 'EW_Occurrence_outbox_fkey')`;
  assert.equal(guards.length, 4, "Expected 4 PostgreSQL safety constraints");
  const uniqueIndexes = await prisma.$queryRaw`
    SELECT indexname FROM pg_indexes WHERE tablename = 'EnterpriseWorkflowScheduleOccurrence'
      AND indexname IN ('EW_Occurrence_org_run_key', 'EW_Occurrence_org_outbox_key')`;
  assert.equal(uniqueIndexes.length, 2, "Run and outbox references must have unique indexes");
  for (const organizationId of tenants) {
    assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId } }), 0);
    assert.equal(await prisma.enterpriseDomainEvent.count({ where: { organizationId } }), 0);
  }
  console.log("PASS WF-06S2D: two tenants, inert defaults, 11 refused mutations, FK/unique guards, 0 effects");
} finally {
  await prisma.enterpriseWorkflowScheduleOccurrence.deleteMany({ where: { id: { in: receipts } } });
  await prisma.enterpriseWorkflowSchedule.deleteMany({ where: { id: { in: schedules } } });
  await prisma.enterpriseWorkflowVersion.deleteMany({ where: { id: { in: versions } } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { id: { in: defs } } });
  await prisma.organization.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
}
