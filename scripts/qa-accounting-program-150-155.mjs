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
  "lib/user-guides/accounting-onboarding-guide.ts",
  "docs/ACCOUNTING_PROGRAM_COMPLETION.md",
];
for (const file of requiredPaths) if (!exists(file)) fail(`Accounting 3-8: fichier requis absent ${file}`);

if (exists("lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json")) {
  const template = json("lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json");
  if (template.code !== "OHADA_SYSCOHADA" || template.version !== "0.1.0") fail("Accounting 3-8: bootstrap SYSCOHADA attendu en 0.1.0");
  if (template.source?.kind !== "DTSC_INTERNAL") fail("Accounting 3-8: bootstrap non officiel doit rester DTSC_INTERNAL");
  if (template.effectiveFrom !== "2018-01-01") fail("Accounting 3-8: date d'effet SYSCOHADA bootstrap attendue 2018-01-01");
  if (template.financialStatementMappings?.length !== 0) fail("Accounting 3-8: aucune rubrique réglementaire ne doit être inventée dans le bootstrap non officiel");

  const expectedMappings = [
    "ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "SALES_REVENUE", "TAX_PAYABLE", "TAX_RECEIVABLE",
    "INVENTORY", "COST_OF_SALES", "GOODS_RECEIVED_CLEARING", "FIXED_ASSET", "ASSET_CLEARING",
    "OPERATING_EXPENSE", "EXPENSE_CLEARING", "CUSTOMER_ADVANCES", "SUPPLIER_ADVANCES", "EMPLOYEE_PAYABLE",
    "PAYROLL_PAYABLE", "PAYROLL_EXPENSE", "PAYROLL_WITHHOLDING_PAYABLE", "BANK_CHARGES",
    "CASH_VARIANCE_EXPENSE", "CASH_VARIANCE_INCOME",
  ];
  const mappingKeys = new Set((template.semanticMappings || []).map((mapping) => mapping.mappingKey));
  for (const key of expectedMappings) if (!mappingKeys.has(key)) fail(`Accounting 3-8: mapping bootstrap requis absent ${key}`);

  const requiredJournalTypes = ["SALES", "PURCHASES", "BANK", "CASH", "PAYROLL", "INVENTORY", "ASSETS", "ADJUSTMENT", "GENERAL", "OPENING"];
  const journalTypes = new Set((template.journals || []).map((journal) => journal.journalType));
  for (const type of requiredJournalTypes) if (!journalTypes.has(type)) fail(`Accounting 3-8: journal bootstrap requis absent ${type}`);
}

if (exists("lib/enterprise/accounting/semantic-account-registry.ts")) {
  const content = read("lib/enterprise/accounting/semantic-account-registry.ts");
  for (const token of ["expectedAccountTypes", "requiredForPosting", "fallbackAllowed", "consumerEvents", "validateTemplateSemanticCoverage"]) {
    if (!content.includes(token)) fail(`Accounting 3-8: contrat semantic registry incomplet (${token})`);
  }
  if (!content.includes('fallbackAllowed: false')) fail("Accounting 3-8: les mappings obligatoires ne doivent pas autoriser de fallback silencieux");
}

if (exists("lib/enterprise/accounting/semantic-account-resolver.ts")) {
  const content = read("lib/enterprise/accounting/semantic-account-resolver.ts");
  for (const token of ["organizationId", "accountingDate", "effectiveFrom", "effectiveTo", "POSTING_ACCOUNT_TYPE_INCOMPATIBLE", "POSTING_ACCOUNT_SUBTYPE_INCOMPATIBLE"]) {
    if (!content.includes(token)) fail(`Accounting 3-8: resolver sémantique incomplet (${token})`);
  }
  if (/effectiveFrom:\s*\{\s*lte:\s*new Date\(\)/.test(content)) fail("Accounting 3-8: le resolver doit utiliser accountingDate, jamais l'heure courante, pour l'effectivité du mapping");
}

if (exists("lib/enterprise/accounting/chart-lifecycle-service.ts")) {
  const content = read("lib/enterprise/accounting/chart-lifecycle-service.ts");
  for (const token of ["previewChartTemplateAdoption", "getAccountingChartReadiness", "activateAccountingChart", "createCustomChildAccount", "LEDGER_ACCOUNT_IN_USE", "ACTIVE_CHART_REPLACEMENT_AFTER_POSTING_FORBIDDEN", "diffOrganizationChartAgainstTemplate"]) {
    if (!content.includes(token)) fail(`Accounting 3-8: lifecycle incomplet (${token})`);
  }
}

if (exists("lib/enterprise/accounting/chart-template-application-service.ts")) {
  const content = read("lib/enterprise/accounting/chart-template-application-service.ts");
  for (const token of ["adoptDraftChartTemplate", "chartTemplateReference(template)", "applyTemplateMappings", "applyTemplateJournals"]) {
    if (!content.includes(token)) fail(`Accounting 3-8: adoption template incomplète (${token})`);
  }
}

if (exists("lib/enterprise/accounting/country-accounting-overlays.ts")) {
  const content = read("lib/enterprise/accounting/country-accounting-overlays.ts");
  if (!content.includes("COUNTRY_ACCOUNTING_OVERLAYS")) fail("Accounting 3-8: registre d'overlays pays absent");
  if (!content.includes("Deliberately empty")) fail("Accounting 3-8: le registre pays doit documenter explicitement l'absence de règle nationale inventée");
  for (const token of ["source", "effectiveFrom", "compatibleFrameworkCodes", "compatibleTemplateReferences"]) if (!content.includes(token)) fail(`Accounting 3-8: contrat overlay incomplet (${token})`);
}

if (exists("lib/enterprise/accounting/regulatory-statements-service.ts")) {
  const content = read("lib/enterprise/accounting/regulatory-statements-service.ts");
  for (const token of ["REGULATORY_STATEMENT_MAPPING_NOT_VALIDATED", "REGULATORY_STATEMENT", "POSTED", "template.financialStatementMappings"]) {
    if (!content.includes(token)) fail(`Accounting 3-8: couche réglementaire incomplète (${token})`);
  }
}

if (exists("lib/enterprise/accounting/chart-version-migration-service.ts")) {
  const content = read("lib/enterprise/accounting/chart-version-migration-service.ts");
  for (const token of ["diffAccountingTemplates", "previewChartTemplateUpgrade", "CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION", "postedEntries", "OHADA_SYSCOHADA@0.1.0", "TRUSTED_REGULATORY_SOURCE_REQUIRED", "HUMAN_OWNER_APPROVAL_REQUIRED"]) {
    if (!content.includes(token)) fail(`Accounting 3-8: version/migration gate incomplet (${token})`);
  }
}

if (exists("components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx")) {
  const content = read("components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx");
  for (const token of ["Mise en service comptable", "ADOPT_TEMPLATE", "APPLY_RECOMMENDED_JOURNALS", "ACTIVATE_CHART", "regulatorySupport"]) {
    if (!content.includes(token)) fail(`Accounting 3-8: onboarding UI incomplet (${token})`);
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
console.log("QA Accounting Program 150-155: OK");
