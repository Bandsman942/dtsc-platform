import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { canonicalInertWorkflowOccurrenceKey } from "../lib/enterprise/workflows/schedule-lease-policy.mjs";

/**
 * WF-06S2E3 (#857): real PostgreSQL transaction/concurrency *fixture* ONLY.
 * These WF857... tables are intentionally absent from production Prisma and
 * every migration. No worker, Cron, route or deployed library imports this.
 * The test is permitted ONLY on localhost databases containing "test".
 *
 * This proves fixture-level transactional properties. It does NOT implement
 * or certify workflow runtime claims, live actors/sources/plans or ERP effects.
 */
const target = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(target.hostname)
  && /test/i.test(target.pathname), "WF-06S2E3 requires localhost/*test* PostgreSQL");
const db = new PrismaClient();
const seed = "wf857-" + randomUUID();
const [tenantA, tenantB, tenantInactive] = [seed+"-a",seed+"-b",seed+"-inactive"];
const tenants = [tenantA, tenantB, tenantInactive];
const vA = seed+"-version-a", vB = seed+"-version-b";
const now = new Date();
const oldest = new Date(now.getTime() - 24*60*60*1000);

const pad = n => String(n).padStart(2,"0");
const utcParts = date => ({
  localDate: date.getUTCFullYear()+"-"+pad(date.getUTCMonth()+1)+"-"+pad(date.getUTCDate()),
  localTime: pad(date.getUTCHours())+":"+pad(date.getUTCMinutes()),
});
const identity = ({organizationId,scheduleId,workflowVersionId,localDate,localTime}) =>
  canonicalInertWorkflowOccurrenceKey({organizationId,scheduleId,workflowVersionId,localDate,localTime});
const fixtureIds = [];
const fixture = (organizationId, workflowVersionId, suffix, when) => {
  const data = { id:randomUUID(), organizationId,
    scheduleId: seed+"-schedule-"+suffix, workflowVersionId,
    ...utcParts(when), scheduledAt:when, status:"READY",revision:1 };
  return {...data, occurrenceKey: identity(data)};
};

async function insertReceipt(item) {
  fixtureIds.push(item.id);
  await db.$executeRaw`
    INSERT INTO "WF857ClaimFixture"
      ("id","organizationId","scheduleId","workflowVersionId",
       "localDate","localTime","scheduledAt","occurrenceKey")
    VALUES (${item.id},${item.organizationId},${item.scheduleId},
            ${item.workflowVersionId},${item.localDate},${item.localTime},
            ${item.scheduledAt},${item.occurrenceKey})
  `;
}

const hold = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function claimFixture({organizationId,workflowVersionId,asOf=now,
  holdLockMs=0,crashBeforeCommit=false}) {
  assert.ok(tenants.includes(organizationId), "fixture tenant must be explicit");
  assert.ok([vA,vB].includes(workflowVersionId), "fixture version must be explicit");
  const floor = new Date(asOf.getTime()-24*60*60*1000);
  return db.$transaction(async tx=>{
    // SKIP LOCKED bounds one tenant/version/due candidate, active CLIENT only.
    const rows = await tx.$queryRaw`
      SELECT r."id",r."organizationId",r."scheduleId",
        r."workflowVersionId",r."localDate",r."localTime",
        r."occurrenceKey",r."revision",r."status"
      FROM "WF857ClaimFixture" r
      JOIN "Organization" org ON org."id"=r."organizationId"
      WHERE r."organizationId"=${organizationId}
        AND r."workflowVersionId"=${workflowVersionId}
        AND r."status"='READY'
        AND org."organizationType"='CLIENT' AND org."status"='ACTIVE'
        AND org."deletedAt" IS NULL
        AND r."scheduledAt" >= ${floor}
        AND r."scheduledAt" <= ${asOf}
      ORDER BY r."scheduledAt" ASC, r."id" ASC
      LIMIT 1
      FOR UPDATE OF r SKIP LOCKED
    `;
    if (rows.length===0) return null;
    const selected=rows[0];
    assert.equal(selected.occurrenceKey,identity(selected),"canonical occurrence mismatch");
    if(holdLockMs) await hold(holdLockMs);
    const updated=await tx.$queryRaw`
      UPDATE "WF857ClaimFixture"
      SET "status"='COMMITTED',"revision"="revision"+1,
          "attemptCount"="attemptCount"+1
      WHERE "id"=${selected.id}
        AND "organizationId"=${organizationId}
        AND "workflowVersionId"=${workflowVersionId}
        AND "status"='READY' AND "revision"=${selected.revision}
      RETURNING "id","revision"
    `;
    assert.equal(updated.length,1,"fixture CAS must have one winner");
    assert.equal(updated[0].revision,selected.revision+1);
    const eventId=randomUUID();
    // The mock outbox is inserted IN THE SAME TRANSACTION as receipt CAS.
    const inserted=await tx.$queryRaw`
      INSERT INTO "WF857OutboxFixture"
        ("id","organizationId","receiptId","occurrenceKey")
      VALUES (${eventId},${organizationId},${selected.id},${selected.occurrenceKey})
      ON CONFLICT DO NOTHING RETURNING "id"
    `;
    assert.equal(inserted.length,1,"duplicate mock effect refused");
    const linked=await tx.$queryRaw`
      UPDATE "WF857ClaimFixture" SET "outboxEventId"=${eventId}
      WHERE "id"=${selected.id} AND "organizationId"=${organizationId}
        AND "revision"=${selected.revision+1} AND "status"='COMMITTED'
      RETURNING "id"
    `;
    assert.equal(linked.length,1,"mock receipt/outbox link CAS");
    if(crashBeforeCommit) throw new Error("WF857_CRASH_BEFORE_COMMIT");
    return {kind:"TEST_FIXTURE_COMMIT_ONLY",organizationId,receiptId:selected.id,eventId};
  },{timeout:30_000,maxWait:30_000});
}

async function state(organizationId) {
  const rows=await db.$queryRaw`
    SELECT r."id",r."status",r."revision",r."attemptCount",r."outboxEventId"
    FROM "WF857ClaimFixture" r WHERE r."organizationId"=${organizationId}
  `;
  const outbox=await db.$queryRaw`
    SELECT "id","receiptId","organizationId","occurrenceKey"
    FROM "WF857OutboxFixture" WHERE "organizationId"=${organizationId}
  `;
  return {rows,outbox};
}

let created=false;
try {
  // TEST DB ONLY. No production migration and no Prisma production tables.
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS "WF857OutboxFixture"');
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS "WF857ClaimFixture"');
  await db.$executeRawUnsafe(`
    CREATE TABLE "WF857ClaimFixture" (
      "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL,
      "scheduleId" TEXT NOT NULL, "workflowVersionId" TEXT NOT NULL,
      "localDate" TEXT NOT NULL, "localTime" TEXT NOT NULL,
      "scheduledAt" TIMESTAMP(3) NOT NULL,
      "occurrenceKey" TEXT NOT NULL UNIQUE,
      "status" TEXT NOT NULL DEFAULT 'READY'
        CHECK ("status" IN ('READY','COMMITTED')),
      "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0),
      "attemptCount" INTEGER NOT NULL DEFAULT 0 CHECK ("attemptCount"<=1),
      "outboxEventId" TEXT,
      UNIQUE ("organizationId","scheduleId","workflowVersionId","localDate","localTime"),
      UNIQUE ("organizationId","id")
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE "WF857OutboxFixture" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "receiptId" TEXT NOT NULL UNIQUE,
      "occurrenceKey" TEXT NOT NULL UNIQUE,
      FOREIGN KEY ("organizationId","receiptId")
      REFERENCES "WF857ClaimFixture" ("organizationId","id")
    )
  `);
  created=true;
  for (const organizationId of tenants) {
    await db.organization.create({data:{id:organizationId,
      name:"WF-06S2E3 test-only tenant",organizationType:"CLIENT",
      status:organizationId===tenantInactive?"INACTIVE":"ACTIVE"}});
  }

  const a=fixture(tenantA,vA,"a-primary",new Date(now.getTime()-30_000));
  const b=fixture(tenantB,vB,"b-primary",new Date(now.getTime()-30_000));
  const inactive=fixture(tenantInactive,vA,"inactive",new Date(now.getTime()-30_000));
  const future=fixture(tenantA,vA,"future",new Date(now.getTime()+60_000));
  const stale=fixture(tenantA,vA,"stale",new Date(now.getTime()-25*60*60*1000));
  for(const item of [a,b,inactive,future,stale])await insertReceipt(item);

  // 12 actual PostgreSQL transactions compete for one A receipt.
  // First worker holds its row lock, other workers must SKIP LOCKED.
  const attempts=await Promise.all(Array.from({length:12},(_,i)=>
    claimFixture({organizationId:tenantA,workflowVersionId:vA,holdLockMs:i===0?120:0})));
  assert.equal(attempts.filter(Boolean).length,1,"12 workers must yield exactly one fixture effect");
  assert.equal(attempts.find(Boolean).receiptId,a.id);
  const aState=await state(tenantA);
  assert.equal(aState.outbox.length,1);
  assert.equal(aState.rows.find(x=>x.id===a.id).status,"COMMITTED");
  assert.equal(aState.rows.find(x=>x.id===a.id).attemptCount,1);
  assert.equal(aState.rows.find(x=>x.id===a.id).revision,2);
  assert.ok(aState.rows.find(x=>x.id===a.id).outboxEventId);

  // Duplicate cron / crash AFTER commit but BEFORE acknowledgement:
  // no second claim and the mock outbox remains unique.
  assert.equal(await claimFixture({organizationId:tenantA,workflowVersionId:vA}),null);
  assert.equal((await Promise.all(Array.from({length:12},()=>
    claimFixture({organizationId:tenantA,workflowVersionId:vA})))).filter(Boolean).length,0);
  assert.equal((await state(tenantA)).outbox.length,1);

  // Cross-tenant, version mismatch, inactive, future, old >24h.
  assert.equal(await claimFixture({organizationId:tenantB,workflowVersionId:vA}),null);
  assert.equal(await claimFixture({organizationId:tenantInactive,workflowVersionId:vA}),null);
  assert.equal(await claimFixture({organizationId:tenantA,workflowVersionId:vB}),null);
  assert.equal((await state(tenantInactive)).outbox.length,0);
  assert.equal((await state(tenantA)).rows.find(x=>x.id===future.id).status,"READY");
  assert.equal((await state(tenantA)).rows.find(x=>x.id===stale.id).status,"READY");

  // Crash BEFORE commit must undo BOTH CAS and mock outbox insert.
  const rollback=fixture(tenantA,vA,"rollback",new Date(now.getTime()-15_000));
  await insertReceipt(rollback);
  await assert.rejects(claimFixture({organizationId:tenantA,workflowVersionId:vA,
    crashBeforeCommit:true}),/WF857_CRASH_BEFORE_COMMIT/);
  const afterRollback=await state(tenantA);
  assert.equal(afterRollback.rows.find(x=>x.id===rollback.id).status,"READY");
  assert.equal(afterRollback.rows.find(x=>x.id===rollback.id).revision,1);
  assert.equal(afterRollback.outbox.length,1,"aborted mock outbox must roll back");
  const recovered=await claimFixture({organizationId:tenantA,workflowVersionId:vA});
  assert.equal(recovered.receiptId,rollback.id);
  assert.equal((await state(tenantA)).outbox.length,2);
  assert.equal(await claimFixture({organizationId:tenantA,workflowVersionId:vA}),null);

  // Another ACTIVE tenant is independent; commit then pretend ACK was lost.
  const committedB=await claimFixture({organizationId:tenantB,workflowVersionId:vB});
  assert.equal(committedB.receiptId,b.id);
  assert.equal(await claimFixture({organizationId:tenantB,workflowVersionId:vB}),null);
  assert.equal((await state(tenantB)).outbox.length,1);

  // Explicit lock competition on a third A fixture: SKIP LOCKED returns
  // promptly without waiting and the receipt reappears after release.
  const contention=fixture(tenantA,vA,"lockheld",new Date(now.getTime()-8_000));
  await insertReceipt(contention);
  let signal,release;
  const acquired=new Promise(resolve=>{signal=resolve;});
  const unlock=new Promise(resolve=>{release=resolve;});
  const blocker=db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "WF857ClaimFixture" WHERE "id"=${contention.id} FOR UPDATE`;
    signal();
    await unlock;
  },{maxWait:30_000,timeout:30_000});
  await acquired;
  try{
    assert.equal(await claimFixture({organizationId:tenantA,workflowVersionId:vA}),null,
      "SKIP LOCKED must not claim an unavailable receipt");
  }finally{release();await blocker;}
  assert.equal((await claimFixture({organizationId:tenantA,workflowVersionId:vA})).receiptId,contention.id);
  assert.equal((await state(tenantA)).outbox.length,3);

  // Real production tables must be unchanged, still RESERVED-only.
  const constraints=await db.$queryRaw`
    SELECT conname FROM pg_constraint
    WHERE conname IN ('EW_Occurrence_status_check','EW_Occurrence_inert_execution_check')
  `;
  assert.equal(constraints.length,2,"no production constraint relaxation");
  for (const organizationId of tenants){
    assert.equal(await db.enterpriseWorkflowRun.count({where:{organizationId}}),0);
    assert.equal(await db.enterpriseDomainEvent.count({where:{organizationId}}),0);
    assert.equal(await db.enterpriseWorkflowScheduleOccurrence.count({where:{organizationId}}),0);
  }
  console.log("PASS WF-06S2E3: 12 actual PostgreSQL fixture transactions, unique mock outbox, 2 tenants, inactive/version/future/stale denies, crash rollback/ack-loss, SKIP LOCKED, zero real ERP effects");
}finally{
  // If interrupted by runner failure, test DB is disposable. On normal
  // completion or failed assertion, always attempt deterministic cleanup.
  if(created){
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "WF857OutboxFixture"');
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "WF857ClaimFixture"');
  }
  await db.organization.deleteMany({where:{id:{in:tenants}}});
  await db.$disconnect();
}
