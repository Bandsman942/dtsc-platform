import assert from "node:assert/strict";
import fs from "node:fs";
import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/statements-service.ts",
  "app/api/enterprise/[organizationId]/financial-statements/route.ts",
  "components/enterprise/enterprise-finance-workspace.tsx",
  "prisma/enterprise-accounting.prisma",
]);
requireTokens("lib/enterprise/accounting/statements-service.ts", [
  "status IN ('POSTED', 'REVERSED')",
  "trialBalance",
  "generalLedger",
  "incomeStatement",
  "balanceSheet",
  "cashFlow",
  "async function aging",
  "type: \"AR\" | \"AP\"",
  "functionalCurrencyCode",
]);
// Never sum draft journal lines into a published trial balance or income
// statement. Filtering only a second LEFT JOIN still sums those lines.
const statements = fs.readFileSync("lib/enterprise/accounting/statements-service.ts", "utf8");
const balanceQuery = statements.slice(statements.indexOf("async function trialBalance"), statements.indexOf("async function generalLedger"));
assert.match(balanceQuery, /INNER JOIN "EnterpriseJournalEntry" e/);
assert.match(balanceQuery, /AND e\.status IN \('POSTED', 'REVERSED'\)/);
assert.doesNotMatch(balanceQuery, /LEFT JOIN "EnterpriseJournalEntry" e/);
requireTokens("app/api/enterprise/[organizationId]/financial-statements/route.ts", [
  "authorizeFinanceRequest",
  "statementGenerateSchema.safeParse",
  "writeApiLog",
]);
requireTokens("components/enterprise/enterprise-finance-workspace.tsx", [
  'value="AR_AGING"',
  'value="AP_AGING"',
  'value="TAX"',
  'value="JOURNALS"',
  'value="TREASURY"',
]);
requireTokens("prisma/enterprise-accounting.prisma", [
  "EnterpriseFinancialStatementSnapshot",
  "snapshotJson",
  "publishedAt",
]);
success("enterprise financial statements and snapshots retain POSTED + REVERSED ledger history");
