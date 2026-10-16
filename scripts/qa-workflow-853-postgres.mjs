import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  inspectInertLockedWorkflowDispatchInventory,
  INERT_DISPATCH_PROBE_LIMIT,
} from "../lib/enterprise/workflows/schedule-dispatch-inventory.mjs";

const target = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(target.hostname) && /test/i.test(target.pathname),
  "WF-06S2E1 is allowed ONLY on localhost/*test* PostgreSQL");
const db = new PrismaClient();
const seed = "wf853-" + randomUUID();
const tenants = [seed + "-a", seed + "-b", seed + "-inactive"];
const defs = [], versions = [], schedules = [], ids = [];
const now = new Date();
const key = (value) => createHash("sha256").update(value).digest("hex");

async function makeTenant(organizationId, count) {
  await db.organization.create({
    data: { id: organizationId, name: "WF-06S2E1 fixture", organizationType: "CLIENT", status: "ACTIVE" },
  });
  const definition = await db.enterpriseWorkflowDefinition.create({
    data: { organizationId, code: "WF853_" + organizationId.slice(-10),
      name: "Inert probe fixture", status: "ACTIVE",
      triggerType: "MANUAL", createdByUserId: seed },
  });
  defs.push(definition.id);
  const version = await db.enterpriseWorkflowVersion.create({
    data: { organizationId, definitionId: definition.id,
      versionNumber: 1, status: "PUBLISHED", createdByUserId: seed },
  });
  versions.push(version.id);
  await db.enterpriseWorkflowDefinition.update({
    where: { id: definition.id }, data: { currentVersionId: version.id },
  });
  const schedule = await db.enterpriseWorkflowSchedule.create({
    data: { organizationId, workflowDefinitionId: definition.id, workflowVersionId: version.id,
      frequency: "DAILY", timeZone: "UTC", hour: 8, minute: 0,
      status: "DISABLED", createdByUserId: seed, nextRunAt: now },
  });
  schedules.push(schedule.id);
  const items = Array.from({ length: count }, (_, i) => {
    const instant = new Date(now.getTime() - (count + 1 - i) * 60_000);
    return {
      id: randomUUID(), organizationId, scheduleId: schedule.id, workflowVersionId: version.id,
      localDate: instant.toISOString().slice(0, 10),
      localTime: instant.toISOString().slice(11, 16), timeZone: "UTC",
      scheduledAt: instant, occurrenceKey: key(organizationId + ":" + i),
    };
  });
  items.push({
    id: randomUUID(), organizationId, scheduleId: schedule.id, workflowVersionId: version.id,
    localDate: new Date(now.getTime() + 60_000).toISOString().slice(0, 10),
    localTime: new Date(now.getTime() + 60_000).toISOString().slice(11, 16),
    timeZone: "UTC", scheduledAt: new Date(now.getTime() + 60_000),
    occurrenceKey: key(organizationId + ":future"),
  });
  await db.enterpriseWorkflowScheduleOccurrence.createMany({ data: items });
  ids.push(...items.map(x => x.id));
  return items;
}

try {
  const a = await makeTenant(tenants[0], 25);
  await makeTenant(tenants[1], 2);
  await makeTenant(tenants[2], 1);
  const before = await db.enterpriseWorkflowScheduleOccurrence.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, revision: true, updatedAt: true },
  });
  await db.organization.update({ where: { id: tenants[2] }, data: { status: "INACTIVE" } });

  await assert.rejects(inspectInertLockedWorkflowDispatchInventory({
    db, organizationId: tenants[0], asOf: new Date("invalid"),
  }), /PROBE_TIME_INVALID/);
  await assert.rejects(inspectInertLockedWorkflowDispatchInventory({
    db, organizationId: " " + tenants[0], asOf: now,
  }), /PROBE_SCOPE_INVALID/);
  await assert.rejects(inspectInertLockedWorkflowDispatchInventory({
    db, organizationId: tenants[0], asOf: new Date(now.getTime() + 60 * 60_000),
  }), /PROBE_TIME_INVALID/);

  const first = await inspectInertLockedWorkflowDispatchInventory({ db, organizationId: tenants[0], asOf: now });
  assert.equal(first.kind, "INERT_DISPATCH_LOCK_PROBE_ONLY");
  assert.equal(first.limit, INERT_DISPATCH_PROBE_LIMIT);
  assert.equal(first.observed.length, 20);
  assert.equal(first.truncated, true);
  assert.ok(first.observed.every(x => x.organizationId === tenants[0] && x.occurrenceKey && x.revision === 1));
  assert.ok(first.observed.every(x => !Object.hasOwn(x, "sourceEntityId") && !Object.hasOwn(x, "executionActorUserId")));
  assert.ok(!first.observed.some(x => x.occurrenceId === a[a.length - 1].id), "future receipt excluded");
  const second = await inspectInertLockedWorkflowDispatchInventory({ db, organizationId: tenants[1], asOf: now });
  assert.equal(second.observed.length, 2);
  assert.equal(second.truncated, false);
  assert.ok(second.observed.every(x => x.organizationId === tenants[1]));
  const third = await inspectInertLockedWorkflowDispatchInventory({ db, organizationId: tenants[2], asOf: now });
  assert.equal(third.observed.length, 0, "inactive client tenant must not leak receipts");
  const missing = await inspectInertLockedWorkflowDispatchInventory({ db, organizationId: seed + "-missing", asOf: now });
  assert.equal(missing.observed.length, 0, "unknown tenant has no fallback");

  let signalLock, releaseLock;
  const locked = new Promise(resolve => { signalLock = resolve; });
  const release = new Promise(resolve => { releaseLock = resolve; });
  const blocker = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EnterpriseWorkflowScheduleOccurrence"
      WHERE "id" = ${a[0].id} FOR UPDATE`;
    signalLock();
    await release;
  }, { timeout: 15_000 });
  await locked;
  try {
    const probe = await inspectInertLockedWorkflowDispatchInventory({ db, organizationId: tenants[0], asOf: now });
    assert.equal(probe.observed.length, 20, "other unlocked rows should fill the bounded probe");
    assert.ok(!probe.observed.some(x => x.occurrenceId === a[0].id),
      "SKIP LOCKED must hide the receipt held by a competing transaction");
  } finally {
    releaseLock();
    await blocker;
  }
  const resumed = await inspectInertLockedWorkflowDispatchInventory({ db, organizationId: tenants[0], asOf: now });
  assert.ok(resumed.observed.some(x => x.occurrenceId === a[0].id), "released lock must become visible");

  const after = await db.enterpriseWorkflowScheduleOccurrence.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, revision: true, updatedAt: true, claimToken: true, workflowRunId: true, outboxEventId: true },
  });
  const stateBefore = new Map(before.map(x => [x.id, x]));
  assert.equal(after.length, before.length);
  for (const item of after) {
    const original = stateBefore.get(item.id);
    assert.equal(item.status, original.status);
    assert.equal(item.revision, original.revision);
    assert.equal(item.updatedAt.getTime(), original.updatedAt.getTime());
    assert.equal(item.claimToken, null);
    assert.equal(item.workflowRunId, null);
    assert.equal(item.outboxEventId, null);
  }
  for (const organizationId of tenants) {
    assert.equal(await db.enterpriseWorkflowRun.count({ where: { organizationId } }), 0);
    assert.equal(await db.enterpriseDomainEvent.count({ where: { organizationId } }), 0);
  }
  console.log("PASS WF-06S2E1: 3 tenant scopes, 20+1 cap, read-only locks, stale/unknown denies, 0 run/outbox");
} finally {
  await db.enterpriseWorkflowScheduleOccurrence.deleteMany({ where: { id: { in: ids } } });
  await db.enterpriseWorkflowSchedule.deleteMany({ where: { id: { in: schedules } } });
  await db.enterpriseWorkflowVersion.deleteMany({ where: { id: { in: versions } } });
  await db.enterpriseWorkflowDefinition.deleteMany({ where: { id: { in: defs } } });
  await db.organization.deleteMany({ where: { id: { in: tenants } } });
  await db.$disconnect();
}
