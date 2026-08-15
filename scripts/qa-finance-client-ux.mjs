import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));

const financeFiles = [
  "components/enterprise/enterprise-finance-module-page.tsx",
  "components/enterprise/professional/finance-professional-ui.ts",
  "components/enterprise/professional/finance-professional-workspace-shared.tsx",
  "components/enterprise/professional/enterprise-finance-overview-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-payments-treasury-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx",
  "components/enterprise/professional/enterprise-operational-finance-workspace.tsx",
  "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx",
  "components/enterprise/professional/enterprise-exchange-rates-workspace.tsx",
  "components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx",
];
for (const file of financeFiles) if (!exists(file)) fail(`Finance UX: fichier requis absent ${file}`);

const ui = "components/enterprise/professional/finance-professional-ui.ts";
if (exists(ui)) {
  const content = read(ui);
  for (const token of ["FinanceLocale", "fr:", "en:", "financeStatusLabel", "financeEnumLabel", "financeErrorMessage", "safeFinanceError", "FINANCE_PERIOD_CLOSED", "CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION", "Business value to review", "Valeur métier à vérifier"]) if (!content.includes(token)) fail(`Finance UX: socle i18n/client-safe incomplet (${token})`);
  if (/return\s+error\.message/.test(content)) fail("Finance UX: safeFinanceError ne doit jamais renvoyer error.message brut");
}

const shared = "components/enterprise/professional/finance-professional-workspace-shared.tsx";
if (exists(shared)) {
  const content = read(shared);
  for (const token of ["apiError", "safeFinanceError", "financeStatusLabel", "financeEnumLabel", "FinanceLocale"]) if (!content.includes(token)) fail(`Finance UX: workspace partagé incomplet (${token})`);
  if (/body\?\.message\s*\|\|\s*body\?\.error|body\.message\s*\|\|\s*body\.error/.test(content)) fail("Finance UX: les helpers partagés ne doivent pas privilégier un message backend brut");
  if (/throw new Error\(body\?\.message/.test(content)) fail("Finance UX: les mutations partagées ne doivent pas propager body.message au client");
}

const onboarding = "components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx";
if (exists(onboarding)) {
  const content = read(onboarding);
  for (const token of ["translateEnterpriseFinance", 't("accountingOnboarding")', 't("accountingOnboardingDescription")', 't("financialStatements")', "financeStatusLabel", "safeFinanceError", "defaultTemplateReference"]) if (!content.includes(token)) fail(`Finance UX: onboarding final incomplet (${token})`);

  const frPath = "locales/enterprise-finance.fr.json";
  const enPath = "locales/enterprise-finance.en.json";
  if (!exists(frPath) || !exists(enPath)) fail("Finance UX: catalogues enterprise-finance FR/EN absents");
  else {
    const fr = json(frPath);
    const en = json(enPath);
    if (!String(fr.accountingOnboardingDescription || "").includes("plan officiel par défaut")) fail("Finance UX: promesse SYSCOHADA officielle absente du catalogue FR");
    if (!String(en.accountingOnboardingDescription || "").includes("official SYSCOHADA default")) fail("Finance UX: promesse SYSCOHADA officielle absente du catalogue EN");
    if (fr.financialStatements !== "États financiers" || en.financialStatements !== "Financial statements") fail("Finance UX: libellés États financiers FR/EN absents du catalogue canonique");
    if (JSON.stringify(Object.keys(fr).sort()) !== JSON.stringify(Object.keys(en).sort())) fail("Finance UX: parité de clés enterprise-finance FR/EN rompue");
  }

  for (const forbidden of ["bootstrap non officiel", "unofficial bootstrap", "REGULATORY_STATEMENT_MAPPING_NOT_VALIDATED"]) if (content.includes(forbidden)) fail(`Finance UX: jargon de gouvernance historique affiché au client (${forbidden})`);
}

for (const file of financeFiles) {
  if (!exists(file)) continue;
  const content = read(file);
  if (/\{\s*error\.message\s*\}/.test(content)) fail(`Finance UX: message d'erreur technique rendu directement dans ${file}`);
  if (/\{\s*String\(error\)\s*\}/.test(content)) fail(`Finance UX: erreur brute rendue directement dans ${file}`);
  if (/Invalid payload|PrismaClientKnownRequestError|ZodError/.test(content)) fail(`Finance UX: jargon technique détecté dans une surface cliente ${file}`);
}

const modulePage = "components/enterprise/enterprise-finance-module-page.tsx";
if (exists(modulePage)) {
  const content = read(modulePage);
  for (const token of ["OPERATIONAL_FINANCE_MODULE_CODES", "EnterpriseOperationalFinanceWorkspace", "EnterpriseAdvancedFinanceWorkspace", "EnterpriseAccountingOnboardingPanel", "getAccountingOnboardingGuide"]) if (!content.includes(token)) fail(`Finance UX: routeur Finance incomplet (${token})`);
}
const constants = "lib/enterprise/accounting/constants.ts";
if (exists(constants)) {
  const content = read(constants);
  for (const moduleCode of ["FINANCE_OVERVIEW", "FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS", "FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION", "FINANCE_ACCOUNTING", "FINANCE_TAX", "FINANCE_CLOSE", "FINANCE_STATEMENTS", "FINANCE_ASSETS", "FINANCE_INVENTORY"]) if (!content.includes(moduleCode)) fail(`Finance UX: module canonique absent ${moduleCode}`);
}

if (failures.length) {
  console.error(`QA Finance client UX/i18n: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("QA Finance client UX/i18n: OK — client-safe messages and FR/EN contracts enforced");
