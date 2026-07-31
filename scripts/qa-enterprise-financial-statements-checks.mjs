import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/statements-service.ts",
  "app/api/enterprise/[organizationId]/financial-statements/route.ts",
  "components/enterprise/enterprise-finance-workspace.tsx",
  "prisma/enterprise-accounting.prisma",
]);
requireTokens("lib/enterprise/accounting/statements-service.ts", [
  "e.status = 'POSTED'",
  "trialBalance",
  "generalLedger",
  "incomeStatement",
  "balanceSheet",
  "cashFlow",
  "async function aging",
  "type: \"AR\" | \"AP\"",
  "functionalCurrencyCode",
]);
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
success("enterprise financial statements and snapshots");
