import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// This is strictly a read-only catalog inspection of a disposable Postgres
// service database created by GitHub Actions. Never query a live Neon branch,
// even if a developer runs the script accidentally with production credentials.
const rawUrl=process.env.DATABASE_URL||"";
let databaseUrl;
try {databaseUrl=new URL(rawUrl);}catch {throw new Error("TEST_POSTGRES_LOCAL_ONLY");}
if(process.env.CI!=="true" || !["127.0.0.1","localhost"].includes(databaseUrl.hostname) ||
   !["postgresql:","postgres:"].includes(databaseUrl.protocol))
  throw new Error("TEST_POSTGRES_LOCAL_ONLY");

const client=new PrismaClient();
try {
  const columns=await client.$queryRaw`
    SELECT a.attname AS name FROM pg_attribute a
    JOIN pg_class t ON t.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='EnterpriseSupplierClaimCompensation'
      AND a.attnum>0 AND NOT a.attisdropped
  `;
  const names=new Set(columns.map(row=>row.name));
  for(const field of ["reversedAt","reversedByUserId","reversalReason",
    "reversalJournalEntryId","postingJournalEntryId","revision"])assert.ok(names.has(field),field);

  const constraints=await client.$queryRaw`
    SELECT c.conname AS name, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='EnterpriseSupplierClaimCompensation'
      AND c.conname IN ('supplier_comp_state_check','supplier_comp_no_ghost_decision')
  `;
  assert.equal(constraints.length,2,"Both immutable status constraints must be deployed");
  const state=constraints.find(row=>row.name==="supplier_comp_state_check")?.definition||"";
  const ghosts=constraints.find(row=>row.name==="supplier_comp_no_ghost_decision")?.definition||"";
  assert.ok(state.includes("REVERSED") && state.includes("reversalJournalEntryId") &&
    state.includes("reversedByUserId") && state.includes("reversalReason"),
    "REVERSED needs a canonical journal, independent actor and reason");
  assert.ok(ghosts.includes("REVERSED") && ghosts.includes("reversedAt"),
    "Old states cannot claim a ghost reversal");

  const triggers=await client.$queryRaw`
    SELECT tg.tgname AS name, tg.tgenabled AS enabled
    FROM pg_trigger tg JOIN pg_class t ON t.oid=tg.tgrelid
    WHERE t.relname='EnterpriseSupplierClaimCompensation'
      AND tg.tgname='supplier_comp_draft_immutable'
  `;
  assert.equal(triggers.length,1);
  assert.equal(triggers[0].enabled,"O");

  const functions=await client.$queryRaw`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p WHERE p.proname='protect_supplier_claim_compensation_draft'
  `;
  assert.equal(functions.length,1);
  assert.ok(functions[0].definition.includes("REVERSED") &&
    functions[0].definition.includes("reversalJournalEntryId"),
    "A posted supplier compensation must have only the verified domain inverse transition");

  const indexes=await client.$queryRaw`
    SELECT indexname AS name FROM pg_indexes
    WHERE schemaname='public' AND tablename='EnterpriseSupplierClaimCompensation'
  `;
  assert.ok(indexes.some(row=>row.name==="supplier_comp_reversal_journal_key"));

  const payableColumns=await client.$queryRaw`
    SELECT t.relname AS table_name,a.attname AS column_name
    FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public'
      AND (t.relname='EnterprisePayable' AND a.attname='compensatedAmount'
        OR t.relname='EnterpriseSupplierInvoice' AND a.attname='amountCompensated')
      AND a.attnum>0 AND NOT a.attisdropped
  `;
  assert.equal(payableColumns.length,2,"Independent non-cash debt balances must exist");
  console.log("PostgreSQL migration smoke #1212: supplier-claim inverse state, immutable trigger, unique inverse journal and separated compensated balances verified on disposable CI database");
}finally{
  await client.$disconnect();
}
