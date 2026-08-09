import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/finance-readiness-service.ts",
  "lib/enterprise/accounting/configuration-service.ts",
  "lib/enterprise/accounting/chart-lifecycle-service.ts",
  "lib/enterprise/accounting/posting-service.ts",
]);

requireTokens("lib/enterprise/accounting/finance-readiness-service.ts", [
  "resolveEnterpriseFinanceReadiness",
  "FinanceReadinessMode",
  "FISCAL_YEAR_REQUIRED",
  "OPEN_FISCAL_PERIOD_REQUIRED",
  "TEMPLATE_SEMANTIC_COVERAGE_REQUIRED",
  "ORGANIZATION_MAPPINGS_REQUIRED",
  "JOURNALS_REQUIRED",
  "TREASURY_ACCOUNT_RECOMMENDED",
  "TAX_CONFIGURATION_CONTEXTUAL",
]);
requireTokens("lib/enterprise/accounting/configuration-service.ts", [
  "resolveEnterpriseFinanceReadiness",
  "mode: \"POSTING\"",
  "blockers: readiness.blockers",
]);
requireTokens("lib/enterprise/accounting/chart-lifecycle-service.ts", [
  "resolveEnterpriseFinanceReadiness",
  "mode: \"SETUP\"",
]);
requireTokens("lib/enterprise/accounting/posting-service.ts", ["assertFinanceReady"]);

forbidTokens("lib/enterprise/accounting/configuration-service.ts", [
  "configuration.readinessStatus !== \"READY\"",
  "Object.values(checklist).every(Boolean)",
]);
forbidTokens("lib/enterprise/accounting/chart-lifecycle-service.ts", [
  "listRequiredPostingSemanticKeys",
  "requiredJournalTypes",
]);

success("ERP stabilization finance readiness authority");
