import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-accounting.prisma",
  "lib/enterprise/accounting/posting-service.ts",
  "lib/enterprise/accounting/journal-service.ts",
  "lib/enterprise/accounting/reversal-service.ts",
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
forbidTokens("lib/enterprise/accounting/posting-service.ts", [
  "prisma[sourceEntityType]",
  "eval(",
  "new Function(",
]);
success("enterprise accounting invariants");
