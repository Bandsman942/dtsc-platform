import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const overview = "components/enterprise/professional/enterprise-finance-overview-workspace.tsx";
const readiness = "lib/enterprise/accounting/finance-readiness-service.ts";
const configuration = "lib/enterprise/accounting/configuration-service.ts";

requirePaths([overview, readiness, configuration, "lib/user-guides/accounting-onboarding-guide.ts"]);
requireTokens(readiness, [
  "labelFr", "labelEn", "actionKind", "actionHref",
  "PRESENTATION_CURRENCY_READY", "FISCAL_YEAR_REQUIRED", "OPEN_FISCAL_PERIOD_REQUIRED",
  "ORGANIZATION_MAPPINGS_REQUIRED", "JOURNALS_REQUIRED", "RECONCILIATION_TOLERANCE_READY",
  "TREASURY_ACCOUNT_RECOMMENDED", "TAX_CONFIGURATION_CONTEXTUAL",
]);
requireTokens(overview, [
  "diagnostics?: ReadinessDiagnostic[]",
  "DiagnosticCard",
  "diagnostic.severity === \"BLOCKER\"",
  "diagnostic.actionKind === \"LINK\"",
  "diagnostic.actionKind === \"CONFIGURATION\"",
  "Une case se coche automatiquement",
  "A checkmark appears automatically",
]);
forbidTokens(overview, [
  "checklist.hasFunctionalCurrency",
  "checklist.hasFiscalYear",
  "checklist.hasOpenPeriod",
  "checklist.hasChartOfAccounts",
  "checklist.hasSalesJournal",
  "checklist.hasPurchaseJournal",
  "checklist.hasFinancialAccount",
  "checklist.hasTaxConfiguration",
  "checklist.ledgerReady",
  "Boolean(readiness?.configuration), href: \"/enterprise-admin?section=permissions\"",
  "const steps = useMemo",
]);
forbidTokens(configuration, [
  "hasFunctionalCurrency:", "hasFiscalYear:", "hasOpenPeriod:", "hasChartOfAccounts:",
  "hasSalesJournal:", "hasPurchaseJournal:", "hasFinancialAccount:", "hasTaxConfiguration:", "ledgerReady:",
]);
requireTokens("lib/user-guides/accounting-onboarding-guide.ts", ["server-driven", "calculés par le serveur", "automatically"]);

success("ERP stabilization Finance onboarding contract");
