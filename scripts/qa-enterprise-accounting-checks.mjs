import "./qa-accounting-framework-registry.mjs";
import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-accounting.prisma",
  "lib/enterprise/accounting/posting-service.ts",
  "lib/enterprise/accounting/journal-service.ts",
  "lib/enterprise/accounting/reversal-service.ts",
  "lib/enterprise/accounting/chart-template-registry.ts",
  "lib/enterprise/accounting/chart-template-application-service.ts",
  "lib/enterprise/accounting/templates/generic-small-business.v1.json",
  "lib/enterprise/module-registry-finance.json",
]);
requireTokens("lib/enterprise/accounting/posting-service.ts", [
  "Prisma.Decimal",
  "POSTING_NOT_BALANCED",
  "pg_advisory_xact_lock",
  "TransactionIsolationLevel.Serializable",
  "idempotencyKey",
  "status: \"POSTED\"",
]);
requireTokens("lib/enterprise/accounting/journal-service.ts", [
  "POSTED_ENTRY_IMMUTABLE",
  "JOURNAL_ENTRY_UNBALANCED",
  "assertPeriodMatchesEntry",
  "JOURNAL_ENTRY_SELF_APPROVAL_FORBIDDEN",
]);
requireTokens("lib/enterprise/accounting/reversal-service.ts", [
  "JOURNAL_ENTRY_REVERSED",
  "reversalOfEntryId",
  "reversedAt",
]);
requireTokens("lib/enterprise/accounting/chart-template-registry.ts", [
  "ACCOUNTING_FRAMEWORKS",
  "CHART_TEMPLATES",
  "validateChartTemplate",
  "validateRegisteredChartTemplates",
  "deepFreeze",
]);
requireTokens("lib/enterprise/accounting/chart-template-application-service.ts", [
  "CHART_TEMPLATE_NOT_APPLICABLE",
  "status: \"POSTED\"",
  "TransactionIsolationLevel.Serializable",
]);
forbidTokens("lib/enterprise/accounting/posting-service.ts", [
  "prisma[sourceEntityType]",
  "eval(",
  "new Function(",
]);
forbidTokens("lib/enterprise/accounting/master-service.ts", [
  "DRAFT_CHART_TEMPLATES",
  "[\"1000\", \"Trésorerie\"",
]);
success("enterprise accounting invariants");
