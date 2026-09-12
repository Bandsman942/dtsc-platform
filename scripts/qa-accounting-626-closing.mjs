import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/closing-posting-builders.ts",
  "lib/enterprise/accounting/closing-operations-service.ts",
  "lib/enterprise/accounting/closing-operations-schemas.ts",
  "lib/enterprise/accounting/c5-semantic-aliases.ts",
  "lib/enterprise/accounting/c5-error-response.ts",
  "app/api/enterprise/[organizationId]/financial-close/operations/route.ts",
  "app/api/enterprise/[organizationId]/financial-close/fx-revaluation/route.ts",
  "app/api/enterprise/[organizationId]/financial-close/year-end/route.ts",
  "app/api/enterprise/[organizationId]/asset-accounting/[profileId]/disposals/[disposalId]/post/route.ts",
  "components/enterprise/professional/closing-operations-panel.tsx",
  "components/enterprise/professional/asset-disposal-panel.tsx",
  "components/enterprise/enterprise-closing-operations-page.tsx",
  "components/enterprise/enterprise-asset-disposals-page.tsx",
  "app/enterprise-modules/FINANCE_CLOSE/operations/page.tsx",
  "app/enterprise-modules/FINANCE_ASSETS/disposals/page.tsx",
  "components/enterprise/enterprise-finance-module-page.tsx",
  "tests/e2e/accounting-c5-closing.spec.mjs",
  ".github/workflows/accounting-acceptance.yml",
  "docs/ACCOUNTING_626_CLOSING.md",
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
  "MONETARY_SEMANTIC_KEYS",
  '"BORROWINGS"',
  '"CUSTOMER_ADVANCES"',
  'FROM "EnterpriseAccountMapping" m',
  'm."effectiveFrom" IS NULL',
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
  "c5SerializableRetry",
  '"P2034"',
  '"P2002"',
  "assertActiveClientOrganization",
  "postBusinessEventTx",
  'postingEvent: "FX_CLOSING_REVALUATION_POSTED"',
  'postingEvent: "YEAR_END_CLOSED"',
  'postingEvent: "ASSET_DISPOSAL_POSTED"',
  "reverseJournalEntryTx",
  'authorization: "SYSTEM_CLOSING"',
  "FX_REVALUATION_NEXT_OPEN_PERIOD_REQUIRED",
  "YEAR_END_NEXT_OPEN_FISCAL_YEAR_REQUIRED",
  'status: "DISPOSED"',
  'scheduledDate: { gte: disposal.disposalDate }',
  'status: "CANCELLED"',
  "TransactionIsolationLevel.Serializable",
]);
requireTokens("lib/enterprise/accounting/c5-semantic-aliases.ts", [
  'ASSET_DISPOSAL_GAIN: "CASH_VARIANCE_INCOME"',
  'ASSET_DISPOSAL_LOSS: "CASH_VARIANCE_EXPENSE"',
  "No regulatory account number is hard-coded",
]);
requireTokens("lib/enterprise/accounting/c5-error-response.ts", [
  "FX_REVALUATION_NEXT_OPEN_PERIOD_REQUIRED",
  "YEAR_END_NEXT_OPEN_FISCAL_YEAR_REQUIRED",
  "ASSET_DISPOSAL_LEDGER_BASIS_INVALID",
  "c5FinanceErrorResponse",
]);
requireTokens("lib/enterprise/accounting/reversal-service.ts", ["SYSTEM_CLOSING"]);
requireTokens("lib/enterprise/accounting/journal-template-registry.ts", [
  "FX_CLOSING_REVALUATION_POSTED",
  "YEAR_END_CLOSED",
  "ASSET_DISPOSAL_POSTED",
]);
requireTokens("app/api/enterprise/[organizationId]/financial-close/operations/route.ts", [
  '"FINANCE_CLOSE", "view"',
  "listEnterpriseCurrencies",
  "reversalRecordsAsOriginal",
  "FX_CLOSING_REVALUATION_POSTED",
  "YEAR_END_CLOSED",
]);
requireTokens("app/api/enterprise/[organizationId]/financial-close/fx-revaluation/route.ts", [
  '"FINANCE_CLOSE", "close"',
  "closingFxRevaluationSchema.safeParse",
  "c5FinanceErrorResponse",
  "writeAuditLog",
]);
requireTokens("app/api/enterprise/[organizationId]/financial-close/year-end/route.ts", [
  '"FINANCE_CLOSE", "close"',
  "yearEndCloseSchema.safeParse",
  "c5FinanceErrorResponse",
  "writeAuditLog",
]);
requireTokens("app/api/enterprise/[organizationId]/asset-accounting/[profileId]/disposals/[disposalId]/post/route.ts", [
  '"FINANCE_ASSETS", "post"',
  "assetDisposalPostingSchema.safeParse",
  "c5FinanceErrorResponse",
  "writeAuditLog",
]);
requireTokens("components/enterprise/professional/closing-operations-panel.tsx", [
  "Closing operations",
  "Opérations de clôture",
  "/financial-close/fx-revaluation",
  "/financial-close/year-end",
  "reversalRecordsAsOriginal",
]);
requireTokens("components/enterprise/professional/asset-disposal-panel.tsx", [
  "Asset disposals",
  "Cessions d’actifs",
  "/disposals/${disposal.id}/post",
  "Asset profile currency",
  "Devise du profil d’actif",
  'readOnly aria-readonly="true"',
  "canManage",
]);
requireTokens("components/enterprise/enterprise-closing-operations-page.tsx", [
  'moduleCode: "FINANCE_CLOSE"',
  "resolveEnterpriseModuleCapabilities",
  "canManage={capabilities.canManage}",
]);
requireTokens("components/enterprise/enterprise-asset-disposals-page.tsx", [
  'moduleCode: "FINANCE_ASSETS"',
  "resolveEnterpriseModuleCapabilities",
  "canManage={capabilities.canManage}",
]);
requireTokens("components/enterprise/enterprise-finance-module-page.tsx", [
  "/enterprise-modules/FINANCE_CLOSE/operations",
  "/enterprise-modules/FINANCE_ASSETS/disposals",
]);
requireTokens("tests/e2e/accounting-c5-closing.spec.mjs", [
  "Promise.all",
  "FX_CLOSING_REVALUATION_POSTED",
  "enterpriseExchangeRateSnapshot",
  "FINANCE_PERIOD_CLOSED",
  "c5-other-tenant",
  "ASSET_DISPOSAL_POSTED",
  'toBe("DISPOSED")',
  'toBe("CANCELLED")',
  "YEAR_END_CLOSED",
  "RETAINED_EARNINGS",
  "pnlBalance",
  "retainedOpening",
]);
requireTokens(".github/workflows/accounting-acceptance.yml", [
  "node scripts/qa-accounting-626-closing.mjs",
  "Accounting C5 closing acceptance",
  "tests/e2e/accounting-c5-closing.spec.mjs",
  "/tmp/dtsc-accounting-c5-playwright.log",
]);

forbidTokens("lib/enterprise/accounting/closing-operations-service.ts", ["prisma.$transaction(async (tx) => {\n    return prisma.$transaction", "deleteMany({"]);
forbidTokens("lib/enterprise/accounting/closing-posting-builders.ts", ["accountCode:", '"121"', '"675"', '"776"']);
forbidTokens("components/enterprise/professional/closing-operations-panel.tsx", ["window.prompt", "window.confirm"]);
forbidTokens("components/enterprise/professional/asset-disposal-panel.tsx", ["window.prompt", "window.confirm"]);

success("Accounting C5 FX, year-end, asset-disposal, concurrency and production-like contracts");
