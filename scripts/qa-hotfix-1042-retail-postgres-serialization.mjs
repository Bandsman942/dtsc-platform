import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma, PrismaClient } = require("@prisma/client");

// This test creates and drops a disposable probe table. Never execute against
// an application or Production database: CI provisions dtsc_quality_test.
const databaseUrl = process.env.DATABASE_URL || "";
if (process.env.CI !== "true" || !/\/dtsc_quality_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error("RETAIL_1042_POSTGRES_QA_REQUIRES_EPHEMERAL_CI_DATABASE");
}

const source = fs.readFileSync("lib/enterprise/retail/transaction-retry.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const retryModule = { exports: {} };
vm.runInNewContext(output, {
  module: retryModule, exports: retryModule.exports, Promise, Set, Error, setTimeout,
});
const { withRetailTransactionRetry } = retryModule.exports;
const prisma = new PrismaClient();
const tableName = '"QaRetail1042Serialization"';

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE ${tableName} ("id" INTEGER PRIMARY KEY, "counter" INTEGER NOT NULL)`);
  await prisma.$executeRawUnsafe(`INSERT INTO ${tableName} ("id", "counter") VALUES (1, 0)`);

  let waiting = 0;
  let releaseBarrier;
  const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
  const attempts = { A: 0, B: 0 };

  const increment = (actor) => withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    attempts[actor] += 1;
    const rows = await tx.$queryRaw`SELECT "counter" FROM "QaRetail1042Serialization" WHERE "id" = 1`;
    assert.equal(rows.length, 1);
    const current = rows[0].counter;
    // Force two concurrent transactions to read version 0 before either
    // updates. PostgreSQL SERIALIZABLE aborts at least one writer (P2034).
    if (attempts[actor] === 1) {
      waiting += 1;
      if (waiting === 2) releaseBarrier();
      await Promise.race([
        barrier,
        new Promise((_, reject) => setTimeout(() => reject(new Error("SERIALIZATION_QA_BARRIER_TIMEOUT")), 10000)),
      ]);
    }
    await tx.$executeRaw`UPDATE "QaRetail1042Serialization" SET "counter" = ${current + 1} WHERE "id" = 1`;
    return current + 1;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 }), { maxAttempts: 5, baseDelayMs: 0 });

  await Promise.all([increment("A"), increment("B")]);
  const rows = await prisma.$queryRaw`SELECT "counter" FROM "QaRetail1042Serialization" WHERE "id" = 1`;
  assert.equal(rows[0].counter, 2, "Serializable retries must not lose an update");
  assert.ok(attempts.A + attempts.B >= 3, "Real PostgreSQL must force a transaction retry after the write conflict");
  assert.ok(attempts.A <= 5 && attempts.B <= 5, "Retries must stay bounded");
  console.log(`HOTFIX #1042 PostgreSQL SERIALIZABLE: real concurrent conflict recovered in ${attempts.A + attempts.B} transactions without lost writes.`);
} finally {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName}`).catch((error) => {
    console.warn("QA cleanup failed; disposable CI database will be removed:", error.message);
  });
  await prisma.$disconnect();
}
