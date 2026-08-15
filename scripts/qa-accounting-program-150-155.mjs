import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredPaths = [
  "lib/enterprise/accounting/semantic-account-registry.ts",
  "lib/enterprise/accounting/semantic-account-resolver.ts",
  "lib/enterprise/accounting/chart-lifecycle-service.ts",
  "lib/enterprise/accounting/journal-template-registry.ts",
  "lib/enterprise/accounting/country-accounting-overlays.ts",
  "lib/enterprise/accounting/regulatory-statements-service.ts",
  "lib/enterprise/accounting/chart-version-migration-service.ts",
  "lib/enterprise/accounting/accounting-program-schemas.ts",
  "app/api/enterprise/[organizationId]/accounting-setup/route.ts",
  "app/api/enterprise/[organizationId]/regulatory-statements/route.ts",
  "components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx",
  "components/enterprise/professional/finance-professional-ui.ts",
  "locales/enterprise-finance.fr.json",
  "locales/enterprise-finance.en.json",
  "lib/user-guides/accounting-onboarding-guide.ts",
  "docs/ACCOUNTING_PROGRAM_COMPLETION.md",
];
for (const file of requiredPaths) if (!exists(file)) fail(`Accounting 3-8: fichier requis absent ${file}`);

const templatePath = "lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json";
if (exists(templatePath)) {
  const template = json(templatePath);
  if (template.code !== "OHADA_SYSCOHADA" || template.version !== "0.1.0" || template.status !== "PUBLISHED") fail("Accounting 3-8: SYSCOHADA 0.1.0 publié attendu");
  if (template.source?.kind !== "OFFICIAL") fail("Accounting 3-8: SYSCOHADA 0.1.0 doit être OFFICIAL dans la gouvernance DTSC");
  if (template.effectiveFrom !== "2018-01-01") fail("Accounting 3-8: date d'effet SYSCOHADA attendue 2018-01-01");
  if (!template.languages?.includes("fr") || !template.languages?.includes("en")) fail("Accounting 3-8: template FR/EN requis");
  if ((template.financialStatementMappings || []).length === 0) fail("Accounting 3-8: rubriques d'états financiers requises");
  for (const mapping of template.financialStatementMappings || []) if (!["DEBIT", "CREDIT"].includes(mapping.normalBalance)) fail(`Accounting 3-8: sens normal absent ${mapping.lineCode}`);

  const expectedMappings = [
    "ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "SALES_REVENUE", "SERVICE_REVENUE", "WORK_REVENUE", "TAX_PAYABLE", "TAX_RECEIVABLE",
    "INVENTORY", "GOODS_INVENTORY", "RAW_MATERIALS_INVENTORY", "CONSUMABLES_INVENTORY", "FINISHED_GOODS_INVENTORY", "COST_OF_SALES", "GOODS_RECEIVED_CLEARING",
    "FIXED_ASSET", "SOFTWARE_ASSET", "ACCUMULATED_DEPRECIATION", "DEPRECIATION_EXPENSE", "ASSET_CLEARING", "OPERATING_EXPENSE", "EXPENSE_CLEARING",
    "CUSTOMER_ADVANCES", "SUPPLIER_ADVANCES", "EMPLOYEE_PAYABLE", "PAYROLL_PAYABLE", "PAYROLL_EXPENSE", "PAYROLL_WITHHOLDING_PAYABLE", "SOCIAL_SECURITY_PAYABLE",
    "BANK_CHARGES", "CASH_VARIANCE_EXPENSE", "CASH_VARIANCE_INCOME", "FX_LOSS", "FX_GAIN", "BORROWINGS", "PROVISIONS", "INTEREST_EXPENSE", "INCOME_TAX_EXPENSE", "EQUITY_CAPITAL",
  ];
  const mappingKeys = new Set((template.semanticMappings || []).map((mapping) => mapping.mappingKey));
  for (const key of expectedMappings) if (!mappingKeys.has(key)) fail(`Accounting 3-8: mapping requis absent ${key}`);
  const requiredJournalTypes = ["SALES", "PURCHASES", "BANK", "CASH", "MOBILE_MONEY", "PAYROLL", "INVENTORY", "ASSETS", "TAX", "ADJUSTMENT", "GENERAL", "OPENING"];
  const journalTypes = new Set((template.journals || []).map((journal) => journal.journalType));
  for (const type of requiredJournalTypes) if (!journalTypes.has(type)) fail(`Accounting 3-8: journal requis absent ${type}`);
}

if (exists("lib/enterprise/accounting/semantic-account-registry.ts")) {
  const content = read("lib/enterprise/accounting/semantic-account-registry.ts");
  for (const token of ["expectedAccountTypes", "requiredForPosting", "fallbackAllowed", "consumerEvents", "validateTemplateSemanticCoverage", "WORK_REVENUE", "DEPRECIATION_EXPENSE", "BORROWINGS"]) if (!content.includes(token)) fail(`Accounting 3-8: semantic registry incomplet (${token})`);
  if (!content.includes('fallbackAllowed: false')) fail("Accounting 3-8: aucun fallback silencieux ne doit être autorisé");
}
if (exists("lib/enterprise/accounting/semantic-account-resolver.ts")) {
  const content = read("lib/enterprise/accounting/semantic-account-resolver.ts");
  for (const token of ["organizationId", "accountingDate", "effectiveFrom", "effectiveTo", "POSTING_ACCOUNT_TYPE_INCOMPATIBLE", "POSTING_ACCOUNT_SUBTYPE_INCOMPATIBLE"]) if (!content.includes(token)) fail(`Accounting 3-8: resolver sémantique incomplet (${token})`);
  if (/effectiveFrom:\s*\{\s*lte:\s*new Date\(\)/.test(content)) fail("Accounting 3-8: le resolver doit utiliser accountingDate");
}
if (exists("lib/enterprise/accounting/chart-lifecycle-service.ts")) {
  const content = read("lib/enterprise/accounting/chart-lifecycle-service.ts");
  for (const token of ["previewChartTemplateAdoption", "getAccountingChartReadiness", "activateAccountingChart", "createCustomChildAccount", "LEDGER_ACCOUNT_IN_USE", "ACTIVE_CHART_REPLACEMENT_AFTER_POSTING_FORBIDDEN", "diffOrganizationChartAgainstTemplate"]) if (!content.includes(token)) fail(`Accounting 3-8: lifecycle incomplet (${token})`);
}
if (exists("lib/enterprise/accounting/chart-template-application-service.ts")) {
  const content = read("lib/enterprise/accounting/chart-template-application-service.ts");
  for (const token of ["adoptDraftChartTemplate", "chartTemplateReference(template)", "applyTemplateMappings", "applyTemplateJournals"]) if (!content.includes(token)) fail(`Accounting 3-8: adoption template incomplète (${token})`);
}
if (exists("lib/enterprise/accounting/country-accounting-overlays.ts")) {
  const content = read("lib/enterprise/accounting/country-accounting-overlays.ts");
  if (!content.includes("COUNTRY_ACCOUNTING_OVERLAYS") || !content.includes("Deliberately empty")) fail("Accounting 3-8: registre overlays pays invalide");
  for (const token of ["source", "effectiveFrom", "compatibleFrameworkCodes", "compatibleTemplateReferences"]) if (!content.includes(token)) fail(`Accounting 3-8: contrat overlay incomplet (${token})`);
}
if (exists("lib/enterprise/accounting/regulatory-statements-service.ts")) {
  const content = read("lib/enterprise/accounting/regulatory-statements-service.ts");
  for (const token of ["REGULATORY_STATEMENT", "POSTED", "template.financialStatementMappings", "normalBalance", 'mapping.normalBalance === "CREDIT"']) if (!content.includes(token)) fail(`Accounting 3-8: couche états financiers incomplète (${token})`);
}
if (exists("lib/enterprise/accounting/chart-version-migration-service.ts")) {
  const content = read("lib/enterprise/accounting/chart-version-migration-service.ts");
  for (const token of ["diffAccountingTemplates", "previewChartTemplateUpgrade", "CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION", "postedEntries", "DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE", "ACCOUNTING_TEMPLATE_PRODUCTION_READY", "futureVersionsRequireControlledMigration"]) if (!content.includes(token)) fail(`Accounting 3-8: version/migration gate incomplet (${token})`);
}
if (exists("components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx")) {
  const content = read("components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx");
  for (const token of ["translateEnterpriseFinance", 't("accountingOnboarding")', 't("accountingOnboardingDescription")', "ADOPT_TEMPLATE", "APPLY_RECOMMENDED_JOURNALS", "ACTIVATE_CHART", "regulatorySupport", "financeStatusLabel", "safeFinanceError"]) if (!content.includes(token)) fail(`Accounting 3-8: onboarding UI incomplet (${token})`);

  if (exists("locales/enterprise-finance.fr.json") && exists("locales/enterprise-finance.en.json")) {
    const frCatalog = json("locales/enterprise-finance.fr.json");
    const enCatalog = json("locales/enterprise-finance.en.json");
    if (frCatalog.accountingOnboarding !== "Mise en service comptable") fail("Accounting 3-8: libellé FR d'onboarding comptable manquant dans le catalogue canonique");
    if (!String(frCatalog.accountingOnboardingDescription || "").includes("SYSCOHADA")) fail("Accounting 3-8: description FR SYSCOHADA absente du catalogue canonique");
    if (!String(enCatalog.accountingOnboardingDescription || "").includes("official SYSCOHADA default")) fail("Accounting 3-8: official SYSCOHADA default absent du catalogue canonique EN");
    if (JSON.stringify(Object.keys(frCatalog).sort()) !== JSON.stringify(Object.keys(enCatalog).sort())) fail("Accounting 3-8: parité de clés FR/EN du catalogue Finance rompue");
  }
}

const sectorAdapters = path.join(root, "lib/enterprise/accounting/sector-adapters");
if (fs.existsSync(sectorAdapters)) {
  for (const entry of fs.readdirSync(sectorAdapters)) {
    if (!entry.endsWith(".ts")) continue;
    const content = fs.readFileSync(path.join(sectorAdapters, entry), "utf8");
    if (/accountMappingKey:\s*["']\d+["']/.test(content)) fail(`Accounting 3-8: hardcode de compte réglementaire interdit dans sector-adapters/${entry}`);
    if (/OHADA_SYSCOHADA|OHADA_AUDCIF|SYSCOHADA/i.test(content)) fail(`Accounting 3-8: adapter sectoriel couplé directement à SYSCOHADA (${entry})`);
  }
}

if (failures.length) {
  console.error(`QA Accounting Program 150-155: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("QA Accounting Program 150-155: OK — official default, future-safe mappings, statements and migrations covered");
