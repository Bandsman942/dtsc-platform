import fs from "node:fs";

const source = fs.readFileSync("scripts/audit-finance-historical-reversal-history.mjs", "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

for (const forbidden of [
  ".create(",
  ".createMany(",
  ".update(",
  ".updateMany(",
  ".upsert(",
  ".delete(",
  ".deleteMany(",
  ".$executeRaw",
  ".$executeRawUnsafe",
]) {
  check(!source.includes(forbidden), `historical Finance audit must stay read-only: found ${forbidden}`);
}

for (const sensitiveProjection of [
  "businessPartyId",
  "employeeId",
  "maskedExternalReference",
  "primaryEmail",
  "legalName",
  "displayName",
]) {
  check(!source.includes(sensitiveProjection), `historical Finance audit must not project sensitive business fields: ${sensitiveProjection}`);
}

for (const required of [
  'mode: "READ_ONLY"',
  'status: "REVERSED"',
  'status: "CONFIRMED"',
  '"TREASURY_STILL_CONFIRMED"',
  '"POSTED_JOURNAL_NOT_REVERSED"',
  '"CASH_EFFECT_NOT_COMPENSATED"',
  '"OPERATIONAL_BALANCE_GAP"',
  '"AUTO_REPAIR_SAFE"',
  '"AMBIGUOUS"',
  'process.argv.includes("--fail-on-findings")',
]) {
  check(source.includes(required), `historical Finance audit missing contract token: ${required}`);
}

check(source.includes('sourceEntityType: "EnterprisePayment"'), "journal audit must remain scoped to EnterprisePayment");
check(source.includes('archivedAt: null'), "account balance audit must ignore archived financial accounts");
check(source.includes("openingBalance.plus"), "expected operational balance must start from opening balance");
check(source.includes("confirmedNetByAccount"), "expected operational balance must use confirmed Treasury effects");

if (failures.length) {
  console.error("FAIL #735 Finance historical reversal audit contract:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("PASS #735 Finance historical reversal audit remains read-only, source-linked and fail-closed.");
