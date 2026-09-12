import "./qa-hotfix-582-finance-accounting-tax-close-statements-assets.mjs";
import "./qa-accounting-598-gl-workbench.mjs";
import "./qa-accounting-622-atomicity.mjs";
import "./qa-accounting-624-pos-atomicity.mjs";
import "./qa-scale4f-durable-bulk-finance.mjs";
import "./qa-accounting-framework-registry.mjs";
import "./qa-syscohada-source-provenance.mjs";
import "./qa-syscohada-dataset-pipeline.mjs";
import "./qa-accounting-program-150-155.mjs";
import "./qa-accounting-acceptance-contract.mjs";
import "./qa-finance-client-ux.mjs";
import "./qa-erp-stabilization-final.mjs";
import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-accounting.prisma",
  "lib/enterprise/accounting/posting-service.ts",
  "lib/enterprise/accounting/journal-service.ts",
  "lib/enterprise/accounting/accounting-dimension-validation.ts",
  "lib/enterprise/accounting/accounting-query-service.ts",
  "lib/enterprise/accounting/accounting-source-link-registry.ts",
  "lib/enterprise/accounting/reversal-service.ts",
  "lib/enterprise/accounting/chart-template-registry.ts",
  "lib/enterprise/accounting/chart-template-application-service.ts",
  "lib/enterprise/accounting/semantic-account-registry.ts",
  "lib/enterprise/accounting/semantic-account-resolver.ts",
  "lib/enterprise/accounting/chart-lifecycle-service.ts",
  "lib/enterprise/accounting/finance-readiness-service.ts",
  "lib/enterprise/accounting/journal-template-registry.ts",
  "lib/enterprise/accounting/country-accounting-overlays.ts",
  "lib/enterprise/accounting/regulatory-statements-service.ts",
  "lib/enterprise/accounting/chart-version-migration-service.ts",
  "lib/enterprise/accounting/templates/generic-small-business.v1.json",
  "lib/enterprise/accounting/templates/syscohada/source-manifest.json",
  "lib/enterprise/accounting/templates/syscohada/dataset-schema.v1.json",
  "lib/ai/tools/executors/finance-accounting-query.ts",
  "components/enterprise/professional/accounting-compact-table.tsx",
  "components/enterprise/professional/accounting-journal-workbench.tsx",
  "components/enterprise/professional/enterprise-finance-accounting-workspace-v3.tsx",
  "app/api/enterprise/[organizationId]/accounting-query/route.ts",
  "scripts/accounting/verify-syscohada-source.mjs",
  "scripts/accounting/syscohada-dataset-lib.mjs",
  "scripts/accounting/build-syscohada-dataset.mjs",
  "lib/enterprise/module-registry-finance.json",
  "scripts/qa-accounting-598-gl-workbench.mjs",
  "scripts/qa-accounting-622-atomicity.mjs",
  "scripts/qa-accounting-624-pos-atomicity.mjs",
  "scripts/qa-finance-client-ux.mjs",
  "scripts/qa-erp-stabilization-final.mjs",
  "scripts/qa-erp-stabilization-finance-readiness.mjs",
  "scripts/qa-erp-stabilization-finance-onboarding.mjs",
  "scripts/qa-erp-stabilization-rbac.mjs",
  "scripts/qa-erp-stabilization-observability.mjs",
  "scripts/qa-erp-cross-module-finance.mjs",
]);
requireTokens("lib/enterprise/accounting/posting-service.ts", ["Prisma.Decimal", "POSTING_NOT_BALANCED", "pg_advisory_xact_lock", "TransactionIsolationLevel.Serializable", "idempotencyKey", "status: \"POSTED\"", "resolveSemanticPostingAccount"]);
requireTokens("lib/enterprise/accounting/journal-service.ts", ["POSTED_ENTRY_IMMUTABLE", "JOURNAL_ENTRY_UNBALANCED", "assertPeriodMatchesEntry", "JOURNAL_ENTRY_SELF_APPROVAL_FORBIDDEN", "validateAccountingDimensions"]);
requireTokens("lib/enterprise/accounting/accounting-query-service.ts", ["getAccountingGeneralLedger", "getAccountingTrialBalance", "openingBalance", "closingBalance", "status: \"POSTED\""]);
requireTokens("lib/enterprise/accounting/reversal-service.ts", ["JOURNAL_ENTRY_REVERSED", "reversalOfEntryId", "reversedAt"]);
requireTokens("lib/enterprise/accounting/chart-template-registry.ts", ["ACCOUNTING_FRAMEWORKS", "CHART_TEMPLATES", "OHADA_AUDCIF", "DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE", "STATEMENT_NORMAL_BALANCES", "validateChartTemplate", "validateRegisteredChartTemplates", "deepFreeze"]);
requireTokens("lib/enterprise/accounting/chart-template-application-service.ts", ["CHART_TEMPLATE_NOT_APPLICABLE", "status: \"POSTED\"", "TransactionIsolationLevel.Serializable", "adoptDraftChartTemplate", "chartTemplateReference(template)"]);
requireTokens("lib/enterprise/accounting/semantic-account-resolver.ts", ["accountingDate", "effectiveFrom", "effectiveTo", "POSTING_ACCOUNT_TYPE_INCOMPATIBLE"]);
requireTokens("lib/enterprise/accounting/chart-version-migration-service.ts", ["CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION", "DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE", "ACCOUNTING_TEMPLATE_PRODUCTION_READY", "futureVersionsRequireControlledMigration"]);
requireTokens("lib/enterprise/accounting/regulatory-statements-service.ts", ["normalBalance", "REGULATORY_STATEMENT", "POSTED"]);
forbidTokens("lib/enterprise/accounting/posting-service.ts", ["prisma[sourceEntityType]", "eval(", "new Function("]);
forbidTokens("lib/enterprise/accounting/master-service.ts", ["DRAFT_CHART_TEMPLATES", "[\"1000\", \"Trésorerie\""]);
success("enterprise accounting invariants");
