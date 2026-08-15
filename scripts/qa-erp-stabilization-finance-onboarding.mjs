import "./qa-erp-stabilization-observability.mjs";
import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const overview = "components/enterprise/professional/enterprise-finance-overview-workspace.tsx";
const financeFr = "locales/enterprise-finance.fr.json";
const financeEn = "locales/enterprise-finance.en.json";
const readiness = "lib/enterprise/accounting/finance-readiness-service.ts";
const configuration = "lib/enterprise/accounting/configuration-service.ts";

requirePaths([overview, financeFr, financeEn, readiness, configuration, "lib/user-guides/accounting-onboarding-guide.ts"]);
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
  'financeT(locale, "setupAssistantDescription")',
]);
requireTokens(financeFr, [
  '"setupAssistantDescription": "Les étapes sont calculées par le serveur. Une case se coche automatiquement dès que la configuration correspondante est réellement valide."',
]);
requireTokens(financeEn, [
  '"setupAssistantDescription": "Steps are calculated by the server. A checkmark appears automatically as soon as the corresponding configuration is truly valid."',
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