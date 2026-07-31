import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/statements-service.ts",
  "app/api/enterprise/[organizationId]/financial-statements/route.ts",
  "prisma/enterprise-finance-reporting.prisma",
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
  "statementQuerySchema.safeParse",
  "writeApiLog",
]);
requireTokens("prisma/enterprise-finance-reporting.prisma", [
  "EnterpriseFinancialStatementSnapshot",
  "payloadJson",
  "publishedAt",
]);
success("enterprise financial statements and snapshots");
