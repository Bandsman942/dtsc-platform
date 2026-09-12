import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/closing-posting-builders.ts",
  "lib/enterprise/accounting/closing-operations-service.ts",
  "lib/enterprise/accounting/closing-operations-schemas.ts",
  "lib/enterprise/accounting/c5-semantic-aliases.ts",
  "app/api/enterprise/[organizationId]/financial-close/fx-revaluation/route.ts",
  "app/api/enterprise/[organizationId]/financial-close/year-end/route.ts",
  "app/api/enterprise/[organizationId]/asset-accounting/[profileId]/disposals/[disposalId]/post/route.ts",
]);

requireTokens("lib/enterprise/accounting/constants.ts", [
  "FX_CLOSING_REVALUATION_POSTED",
  "YEAR_END_CLOSED",
  "ASSET_DISPOSAL_POSTED",
]);
requireTokens("lib/enterprise/accounting/posting-registry-final.ts", [
  "buildClosingFxRevaluationPosting",
  "buildYearEndClosingPosting",
  "buildAssetDisposalPosting",
]);
requireTokens("lib/enterprise/accounting/closing-posting-builders.ts", [
  "MONETARY_ACCOUNT_SUBTYPES",
  "e.status IN ('POSTED', 'REVERSED')",
  "resolveExchangeRateDetails",
  "snapshotExchangeRate",
  'accountMappingKey: "FX_GAIN"',
  'accountMappingKey: "FX_LOSS"',
  'accountMappingKey: "RETAINED_EARNINGS"',
  "resolveC5SemanticAliasAccount",
  'journalType: "ASSETS"',
]);
requireTokens("lib/enterprise/accounting/closing-operations-service.ts", [
  "postBusinessEventTx",
  'postingEvent: "FX_CLOSING_REVALUATION_POSTED"',
  'postingEvent: "YEAR_END_CLOSED"',
  'postingEvent: "ASSET_DISPOSAL_POSTED"',
  "reverseJournalEntryTx",
  'authorization: "SYSTEM_CLOSING"',
  "FX_REVALUATION_NEXT_OPEN_PERIOD_REQUIRED",
  "YEAR_END_NEXT_OPEN_FISCAL_YEAR_REQUIRED",
  'status: "DISPOSED"',
  'status: "CANCELLED"',
  "TransactionIsolationLevel.Serializable",
]);
requireTokens("lib/enterprise/accounting/c5-semantic-aliases.ts", [
  'ASSET_DISPOSAL_GAIN: "CASH_VARIANCE_INCOME"',
  'ASSET_DISPOSAL_LOSS: "CASH_VARIANCE_EXPENSE"',
  "No regulatory account number is hard-coded",
]);
requireTokens("lib/enterprise/accounting/reversal-service.ts", ["SYSTEM_CLOSING"]);
requireTokens("lib/enterprise/accounting/journal-template-registry.ts", [
  "FX_CLOSING_REVALUATION_POSTED",
  "YEAR_END_CLOSED",
  "ASSET_DISPOSAL_POSTED",
]);
requireTokens("app/api/enterprise/[organizationId]/financial-close/fx-revaluation/route.ts", [
  '"FINANCE_CLOSE", "close"',
  "closingFxRevaluationSchema.safeParse",
  "writeAuditLog",
]);
requireTokens("app/api/enterprise/[organizationId]/financial-close/year-end/route.ts", [
  '"FINANCE_CLOSE", "close"',
  "yearEndCloseSchema.safeParse",
  "writeAuditLog",
]);
requireTokens("app/api/enterprise/[organizationId]/asset-accounting/[profileId]/disposals/[disposalId]/post/route.ts", [
  '"FINANCE_ASSETS", "post"',
  "assetDisposalPostingSchema.safeParse",
  "writeAuditLog",
]);

forbidTokens("lib/enterprise/accounting/closing-operations-service.ts", ["prisma.$transaction(async (tx) => {\n    return prisma.$transaction", "deleteMany({"]);
forbidTokens("lib/enterprise/accounting/closing-posting-builders.ts", ["accountCode:", '"121"', '"675"', '"776"']);

success("Accounting C5 FX, year-end and asset-disposal closing contracts");
