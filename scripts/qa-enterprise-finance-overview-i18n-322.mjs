import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const financeFr = JSON.parse(read("locales/enterprise-finance.fr.json"));
const financeEn = JSON.parse(read("locales/enterprise-finance.en.json"));
const frKeys = Object.keys(financeFr).sort();
const enKeys = Object.keys(financeEn).sort();
check(JSON.stringify(frKeys) === JSON.stringify(enKeys), "Enterprise Finance catalog must keep exact FR/EN key parity");
for (const key of frKeys) {
  check(typeof financeFr[key] === "string" && financeFr[key].trim().length > 0, `Missing French Finance copy for ${key}`);
  check(typeof financeEn[key] === "string" && financeEn[key].trim().length > 0, `Missing English Finance copy for ${key}`);
}

for (const key of [
  "exchangeRatesTitle",
  "exchangeRatesDescription",
  "financeReadinessLoadFailed",
  "projectionHealthUnavailable",
  "projectionRetryFailed",
  "projectionRetried",
  "financeConfigurationSaved",
  "financeReadyForPosting",
  "financeOverviewTitle",
  "configureFinance",
  "financeMetrics",
  "setupAssistant",
  "setupAssistantDescription",
  "recommendedActions",
  "crossModuleContinuity",
  "crossModuleContinuityDescription",
  "financeConfiguration",
  "functionalCurrency",
  "presentationCurrency",
  "automaticPostingAfterApprovals",
]) check(typeof financeFr[key] === "string" && typeof financeEn[key] === "string", `Canonical #322 Finance key missing in FR/EN: ${key}`);

const modulePage = read("components/enterprise/enterprise-finance-module-page.tsx");
check(modulePage.includes('import { translateEnterpriseFinance } from "@/lib/i18n"'), "Finance module entry must import the canonical Enterprise Finance translator");
check(modulePage.includes('t("exchangeRatesTitle")'), "Finance Treasury banner title must come from enterprise-finance catalog");
check(modulePage.includes('t("exchangeRatesDescription")'), "Finance Treasury banner description must come from enterprise-finance catalog");
check(!modulePage.includes("Taux de change et consolidation multi-devise"), "Finance module entry must not keep the French exchange-rate title inline");
check(!modulePage.includes("Exchange rates and multi-currency consolidation"), "Finance module entry must not keep the English exchange-rate title inline");
for (const contract of [
  "ensureCanonicalFinanceModulesForOrganization",
  "resolveEnterpriseModuleAccess",
  "requireEnterpriseMembership",
  'moduleCode === "FINANCE_ACCOUNTING"',
  "EnterpriseOperationalFinanceWorkspace",
  "EnterpriseAdvancedFinanceWorkspace",
]) check(modulePage.includes(contract), `Finance module access/routing contract must remain intact: ${contract}`);

const overview = read("components/enterprise/professional/enterprise-finance-overview-workspace.tsx");
check(overview.includes("translateEnterpriseFinance"), "Finance overview must use the canonical Enterprise Finance translator");
check(overview.includes('financeT(locale, "financeOverviewTitle")'), "Finance overview title must come from canonical Finance copy");
check(overview.includes('financeT(locale, "setupAssistant")'), "Finance setup assistant title must come from canonical Finance copy");
check(overview.includes('financeT(locale, "financeConfiguration")'), "Finance configuration dialog title must come from canonical Finance copy");
check(overview.includes('locale === "en" ? definition.descriptionEn : definition.descriptionFr'), "Finance module description must be locale-aware");
check(overview.includes("diagnostic.labelFr") && overview.includes("diagnostic.labelEn"), "Server-provided bilingual readiness diagnostics must remain projected by locale");
check(overview.includes("diagnostic.messageFr") && overview.includes("diagnostic.messageEn"), "Server-provided bilingual diagnostic messages must remain projected by locale");

for (const literal of [
  "Vue d’ensemble financière",
  "Finance overview",
  "Assistant de mise en service",
  "Setup assistant",
  "Configuration financière",
  "Finance configuration",
  "Continuité inter-module",
  "Cross-module continuity",
  "La préparation Finance ne peut pas être chargée.",
  "Finance readiness cannot be loaded.",
]) check(!overview.includes(literal), `Finance overview still keeps customer copy inline: ${literal}`);

for (const contract of [
  "/finance/configuration",
  "/receivables?page=1&pageSize=1&status=OPEN",
  "/payables?page=1&pageSize=1&status=OPEN",
  "/payments?page=1&pageSize=100&status=CONFIRMED",
  "/cash-sessions?page=1&pageSize=1&status=OPEN",
  "/reconciliations?page=1&pageSize=1&status=SUBMITTED",
  "/sales-invoices?page=1&pageSize=1&status=APPROVED",
  "/erp-projections?page=1&pageSize=20",
  "/erp-projections/${projectionId}/retry",
  "automaticPostingEnabled",
  "inventoryValuationMethod",
  "reconciliationTolerance",
]) check(overview.includes(contract), `Finance overview business contract must remain intact: ${contract}`);

const runner = read("scripts/run-regression-qa-ci.mjs");
check(runner.includes("qa-enterprise-finance-overview-i18n-322.mjs"), "#322 QA must be integrated into Regression QA");

if (failures.length) {
  console.error("Issue #322 Enterprise Finance overview i18n QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Issue #322 Enterprise Finance overview i18n QA passed: canonical FR/EN copy, locale-aware module description, server diagnostics, Finance endpoints and accounting configuration contracts remain intact.");
