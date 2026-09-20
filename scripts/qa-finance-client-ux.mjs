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
  "components/enterprise/professional/finance-professional-workspace-core.tsx",
  "components/enterprise/professional/enterprise-finance-overview-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-payments-treasury-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-base.tsx",
  "components/enterprise/professional/enterprise-operational-finance-workspace.tsx",
  "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx",
  "components/enterprise/professional/enterprise-exchange-rates-workspace.tsx",
  "components/enterprise/professional/enterprise-accounting-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-accounting-workspace.tsx",
  "components/enterprise/professional/accounting-compact-table.tsx",
  "components/enterprise/professional/accounting-journal-workbench.tsx",
  "components/enterprise/professional/enterprise-finance-advanced-workspace.tsx",
  "components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx",
];
for (const file of financeFiles) if (!exists(file)) fail(`Finance UX: fichier requis absent ${file}`);

const ui = "components/enterprise/professional/finance-professional-ui.ts";
if (exists(ui)) {
  const content = read(ui);
  for (const token of [
    "FinanceLocale", "fr:", "en:", "financeStatusLabel", "financeEnumLabel", "financeErrorMessage", "safeFinanceError",
    "FINANCE_PERIOD_CLOSED", "CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION", "Autre catégorie", "Other category",
    "COST_OF_SALES", "Coût des ventes", "OPERATING_EXPENSE", "Charges d’exploitation", "TAX_RECEIVABLE", "Taxes à récupérer",
  ]) if (!content.includes(token)) fail(`Finance UX: socle i18n/client-safe incomplet (${token})`);
  if (/return\s+error\.message/.test(content)) fail("Finance UX: safeFinanceError ne doit jamais renvoyer error.message brut");
  for (const forbidden of ["Valeur métier à vérifier", "Business value to review"]) {
    if (content.includes(forbidden)) fail(`Finance UX: ancien fallback interne encore exposable (${forbidden})`);
  }
}

const shared = "components/enterprise/professional/finance-professional-workspace-shared.tsx";
const sharedCore = "components/enterprise/professional/finance-professional-workspace-core.tsx";
if (exists(shared) && exists(sharedCore)) {
  const wrapper = read(shared);
  const content = `${wrapper}\n${read(sharedCore)}`;
  for (const token of ["apiError", "safeFinanceError", "financeStatusLabel", "financeEnumLabel", "FinanceLocale"]) if (!content.includes(token)) fail(`Finance UX: workspace partagé incomplet (${token})`);
  for (const token of ["finance-professional-workspace-core", "dtsc:finance-durable-job", "CustomEvent", "body.queued"]) if (!wrapper.includes(token)) fail(`Finance UX: bridge durable incomplet (${token})`);
  if (/body\?\.message\s*\|\|\s*body\?\.error|body\.message\s*\|\|\s*body\.error/.test(content)) fail("Finance UX: les helpers partagés ne doivent pas privilégier un message backend brut");
  if (/throw new Error\(body\?\.message/.test(content)) fail("Finance UX: les mutations partagées ne doivent pas propager body.message au client");
}

const bankWrapper = "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx";
if (exists(bankWrapper)) {
  const content = read(bankWrapper);
  for (const token of ["hotfix-legacy", "sessionStorage", "statusUrl", "progressPercent", "MAX_POLLS", "Le traitement est durable", "The processing is durable"]) if (!content.includes(token)) fail(`Finance UX: suivi durable Banque incomplet (${token})`);
}

const onboarding = "components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx";
if (exists(onboarding)) {
  const content = read(onboarding);
  for (const token of [
    "translateEnterpriseFinance", 't("accountingOnboarding")', 't("accountingOnboardingDescription")', 't("financialStatements")',
    "financeStatusLabel", "safeFinanceError", "defaultTemplateReference", "ContextualUserGuide", "getAccountingOnboardingGuide",
  ]) if (!content.includes(token)) fail(`Finance UX: onboarding final incomplet (${token})`);

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

const modulePage = "components/enterprise/enterprise-finance-module-page.tsx";
const accountingWorkspace = "components/enterprise/professional/enterprise-finance-accounting-workspace.tsx";
if (exists(accountingWorkspace)) {
  const content = read(accountingWorkspace);
  for (const token of [
    "EnterpriseAccountingOnboardingPanel",
    "AccountingCompactTable",
    "AccountingJournalWorkbench",
    "useToastMessage",
    "FinanceAccountingReferenceSelect",
    'type Space = "home" | "post" | "review" | "configure"',
    'presentation="editor"',
    "accounting-query",
    "entry-trace",
  ]) if (!content.includes(token)) fail(`Finance UX: workspace Comptabilité canonique incomplet (${token})`);
}

for (const file of financeFiles) {
  if (!exists(file)) continue;
  const content = read(file);
  if (/\{\s*error\.message\s*\}/.test(content)) fail(`Finance UX: message d'erreur technique rendu directement dans ${file}`);
  if (/\{\s*String\(error\)\s*\}/.test(content)) fail(`Finance UX: erreur brute rendue directement dans ${file}`);
  if (/Invalid payload|PrismaClientKnownRequestError|ZodError/.test(content)) fail(`Finance UX: jargon technique détecté dans une surface cliente ${file}`);
}

if (exists(modulePage)) {
  const content = read(modulePage);
  for (const token of [
    "OPERATIONAL_FINANCE_MODULE_CODES",
    "EnterpriseOperationalFinanceWorkspace",
    "EnterpriseAdvancedFinanceWorkspace",
    "EnterpriseFinanceAccountingWorkspace",
    "EnterpriseFinanceAdvancedWorkspace",
    "DOWNSTREAM_FINANCE_MODULES",
  ]) {
    if (!content.includes(token)) fail(`Finance UX: routeur Finance incomplet (${token})`);
  }
  if (content.includes("EnterpriseFinanceAccountingWorkspaceV3") || content.includes("EnterpriseFinanceAdvancedWorkspaceHotfix")) fail("Finance UX: le routeur Finance actif ne doit plus importer une variante v3/hotfix.");
  if (content.includes("EnterpriseAccountingOnboardingPanel")) fail("Finance UX: le routeur Finance ne doit plus rendre Mise en service avant le workspace Comptabilité");
  if (!content.includes('moduleCode === "FINANCE_ACCOUNTING"')) fail("Finance UX: FINANCE_ACCOUNTING doit être routé explicitement vers son workspace dédié");
  if (!content.includes('"FINANCE_TAX", "FINANCE_CLOSE", "FINANCE_STATEMENTS", "FINANCE_ASSETS"')) fail("Finance UX: les quatre modules Finance aval doivent rester routés vers le workspace canonique avancé");
}

const compactTable = "components/enterprise/professional/accounting-compact-table.tsx";
if (exists(compactTable)) {
  const content = read(compactTable);
  for (const token of ["sticky top-0", "tabular-nums", "overflow-x-auto", "whitespace-nowrap", "text-[12px]", "sm:text-[13px]"]) if (!content.includes(token)) fail(`Finance UX: tableau comptable compact incomplet (${token})`);
}

const workbench = "components/enterprise/professional/accounting-journal-workbench.tsx";
if (exists(workbench)) {
  const content = read(workbench);
  for (const token of ["FinanceAccountingReferenceSelect", "totals.debit", "totals.credit", "totals.balanced", 'presentation="editor"', "useToastMessage"]) if (!content.includes(token)) fail(`Finance UX: Journal Workbench incomplet (${token})`);
}

const guidePath = "lib/user-guides/accounting-onboarding-guide.ts";
if (!exists(guidePath)) fail("Finance UX: guide de mise en service comptable absent");
else {
  const content = read(guidePath);
  for (const token of ["getAccountingOnboardingGuide", "FINANCE_ACCOUNTING_ONBOARDING", "États financiers versionnés", "Versioned financial statements"]) {
    if (!content.includes(token)) fail(`Finance UX: guide Comptabilité incomplet (${token})`);
  }
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
console.log("QA Finance client UX/i18n: OK — client-safe messages, canonical Finance workspaces, durable bridges, guides and FR/EN contracts enforced");