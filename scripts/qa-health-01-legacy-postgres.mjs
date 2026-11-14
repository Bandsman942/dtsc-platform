import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("LOCAL_POSTGRES_ONLY");
}
const prisma = new PrismaClient();
const key = randomUUID();
const orgA = "qa-health-redact-a-" + key;
const orgB = "qa-health-redact-b-" + key;
const actorId = "qa-health-redact-user-" + key;
const ids = {
  clinical: "qa-redact-clinical-" + key,
  otherSector: "qa-redact-retail-" + key,
  otherTenant: "qa-redact-other-" + key,
};
const run = (args, env = {}) => {
  const result = spawnSync(process.execPath, [
    "scripts/health-legacy-projection-redact.mjs",
    "--organization-id=" + orgA,
    "--max-scanned=100",
    ...args,
  ], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, ...env } });
  return result;
};
const parseReport = (proc) => {
  assert.equal(proc.status, 0, "Expected CLI success with no PHI in logs");
  return JSON.parse(proc.stdout.trim());
};

try {
  await prisma.user.create({
    data: { id: actorId, name: "FICTITIOUS_QA_ACTOR", email: "health-redact-" + key + "@example.invalid", passwordHash: "TEST_ONLY_NOT_VALID" },
  });
  await prisma.organization.createMany({
    data: [
      { id: orgA, name: "FICTIONAL_HEALTH_TENANT", status: "ACTIVE" },
      { id: orgB, name: "FICTIONAL_OTHER_TENANT", status: "ACTIVE" },
    ],
  });
  const common = { createdById: actorId, recordType: "QA_SYNTHETIC_LEGACY", status: "DRAFT" };
  await prisma.enterpriseSectorRecord.createMany({
    data: [
      { ...common, id: ids.clinical, organizationId: orgA, sectorCode: "HEALTH_CARE", moduleCode: "CONSULTATIONS",
        title: "FICTIONAL_QA_NAME", summary: "FICTIONAL_QA_CLINICAL_SUMMARY", payloadJson: { diagnosis: "FICTIONAL_QA_ONLY" } },
      { ...common, id: ids.otherSector, organizationId: orgA, sectorCode: "RETAIL", moduleCode: "CONSULTATIONS",
        title: "FICTIONAL_RETAIL_TITLE", summary: "FICTIONAL_NONHEALTH", payloadJson: { note: "TEST" } },
      { ...common, id: ids.otherTenant, organizationId: orgB, sectorCode: "HEALTH_CARE", moduleCode: "CONSULTATIONS",
        title: "FICTIONAL_OTHER_TENANT", summary: "FICTIONAL_PRIVATE_TEST", payloadJson: { diagnosis: "QA_ONLY" } },
    ],
  });

  const dry = parseReport(run([]));
  assert.equal(dry.mode, "DRY_RUN");
  assert.equal(dry.candidates, 1);
  assert.equal(dry.redacted, 0);
  assert.equal(dry.nextOffset, 1,"Next page must use numeric offset without exposing identifiers");
  const following = parseReport(run(["--offset=1"]));
  assert.equal(following.scanned, 0,"Second page must not restart at first record");
  assert.equal(following.nextOffset, 1);
  const before = await prisma.enterpriseSectorRecord.findUniqueOrThrow({ where: { id: ids.clinical } });
  assert.equal(before.title, "FICTIONAL_QA_NAME", "Dry-run must not mutate");

  const gated = run(["--apply", "--snapshot-ref=QA_LOCAL_SNAPSHOT_REF", "--ack=REDACT_LEGACY_CLINICAL_TEXT"]);
  assert.notEqual(gated.status, 0, "Apply without environment gate must be refused");
  assert.equal((await prisma.enterpriseSectorRecord.findUniqueOrThrow({ where: { id: ids.clinical } })).title, before.title);

  const applied = parseReport(run([
    "--apply", "--snapshot-ref=QA_LOCAL_SNAPSHOT_REF", "--ack=REDACT_LEGACY_CLINICAL_TEXT",
  ], { HEALTH_LEGACY_REDACTION_ENABLE: "true" }));
  assert.equal(applied.redacted, 1);
  assert.equal(applied.concurrent, 0);
  const after = await prisma.enterpriseSectorRecord.findUniqueOrThrow({ where: { id: ids.clinical } });
  assert.equal(after.title, "CONSULTATIONS · historique");
  assert.equal(after.summary, null);
  assert.deepEqual(after.payloadJson, {});

  const again = parseReport(run([]));
  assert.equal(again.candidates, 0, "Redaction must be idempotent");
  const other = await prisma.enterpriseSectorRecord.findUniqueOrThrow({ where: { id: ids.otherSector } });
  assert.equal(other.title, "FICTIONAL_RETAIL_TITLE", "Other sector must be untouched");
  const neighboring = await prisma.enterpriseSectorRecord.findUniqueOrThrow({ where: { id: ids.otherTenant } });
  assert.equal(neighboring.title, "FICTIONAL_OTHER_TENANT", "Another tenant must be untouched");

  const optimistic = await prisma.enterpriseSectorRecord.updateMany({
    where: {
      id: ids.clinical, organizationId: orgA, sectorCode: "HEALTH_CARE",
      moduleCode: "CONSULTATIONS", updatedAt: before.updatedAt,
    },
    data: { summary: "NOT_ALLOWED_STALE_WRITE" },
  });
  assert.equal(optimistic.count, 0, "Stale write must not override redaction");
  assert.equal((await prisma.enterpriseSectorRecord.findUniqueOrThrow({ where: { id: ids.clinical } })).summary, null);
  console.log("✅ HEALTH-01 PostgreSQL: dry-run, explicit gate, scoped redaction, second tenant, retry, stale-write guard");
} finally {
  await prisma.enterpriseSectorRecord.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: actorId } });
  await prisma.$disconnect();
}
