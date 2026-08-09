import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const parseJson = (file) => JSON.parse(read(file));

const files = {
  registry: "lib/enterprise/accounting/chart-template-registry.ts",
  application: "lib/enterprise/accounting/chart-template-application-service.ts",
  types: "lib/enterprise/accounting/chart-template-types.ts",
  legacyTemplate: "lib/enterprise/accounting/templates/generic-small-business.v1.json",
  master: "lib/enterprise/accounting/master-service.ts",
  architecture: "docs/ACCOUNTING_FRAMEWORK_TEMPLATE_ARCHITECTURE.md",
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(path.join(root, file))) fail(`Absent: ${file}`);
}

if (failures.length === 0) {
  const registry = read(files.registry);
  const application = read(files.application);
  const master = read(files.master);
  const architecture = read(files.architecture);
  const template = parseJson(files.legacyTemplate);

  for (const marker of [
    "ACCOUNTING_FRAMEWORKS",
    "CHART_TEMPLATES",
    "listAccountingFrameworks",
    "listChartTemplates",
    "getChartTemplate",
    "validateChartTemplate",
    "validateRegisteredChartTemplates",
    "FRAMEWORK_CODE_DUPLICATE",
    "GROUP_HIERARCHY_CYCLE",
    "ACCOUNT_HIERARCHY_CYCLE",
    "TEMPLATE_REFERENCE_DUPLICATE",
    "deepFreeze",
  ]) {
    if (!registry.includes(marker)) fail(`Registry: marqueur manquant ${marker}`);
  }

  for (const marker of [
    "getChartTemplate",
    "status !== \"PUBLISHED\"",
    "CHART_TEMPLATE_NOT_APPLICABLE",
    "status: \"POSTED\"",
    "TransactionIsolationLevel.Serializable",
    "enterpriseAccountGroup.createMany",
    "enterpriseLedgerAccount.createMany",
    "CHART_TEMPLATE_APPLIED",
    "templateVersion",
    "templateReference",
    "organizationId",
  ]) {
    if (!application.includes(marker)) fail(`Application service: marqueur manquant ${marker}`);
  }

  if (master.includes("DRAFT_CHART_TEMPLATES")) fail("master-service.ts ne doit plus contenir DRAFT_CHART_TEMPLATES");
  if (master.includes("[\"1000\", \"Trésorerie\"")) fail("master-service.ts contient encore les données du template legacy");
  if (!master.includes("chart-template-application-service")) fail("master-service.ts doit réexporter le service d’application canonique");
  if (!master.includes("getChartTemplate")) fail("createChartOfAccounts doit valider le template via le registre");

  const requiredMetadata = ["code", "frameworkCode", "version", "status", "effectiveFrom", "source", "accounts"];
  for (const key of requiredMetadata) {
    if (!(key in template)) fail(`Template générique: métadonnée manquante ${key}`);
  }
  if (template.code !== "GENERIC_SMALL_BUSINESS") fail("Template générique: code legacy modifié");
  if (template.frameworkCode !== "DTSC_GENERIC") fail("Template générique: framework attendu DTSC_GENERIC");
  if (template.version !== "1.0.0") fail("Template générique: version initiale attendue 1.0.0");
  if (template.status !== "PUBLISHED") fail("Template générique: statut attendu PUBLISHED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(template.effectiveFrom || "")) fail("Template générique: effectiveFrom invalide");
  if (!template.source?.authority || !template.source?.reference || !/^\d{4}-\d{2}-\d{2}$/.test(template.source?.verifiedAt || "")) fail("Template générique: provenance incomplète");

  const expectedCodes = ["1000", "1100", "1200", "1500", "1590", "2000", "2100", "2200", "3000", "4000", "5000", "6000", "9990"];
  const codes = template.accounts.map((account) => account.code);
  if (codes.length !== expectedCodes.length || expectedCodes.some((code, index) => codes[index] !== code)) {
    fail("Template générique: la liste legacy des 13 comptes a changé");
  }

  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) fail("Template générique: codes de comptes dupliqués");
  const allowedTypes = new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"]);
  const allowedSubtypes = new Set(["CASH", "BANK", "MOBILE_MONEY", "ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "INVENTORY", "FIXED_ASSET", "ACCUMULATED_DEPRECIATION", "TAX_RECEIVABLE", "TAX_PAYABLE", "PAYROLL_PAYABLE", "REVENUE", "COST_OF_SALES", "OPERATING_EXPENSE", "RETAINED_EARNINGS", "CLEARING"]);
  for (const account of template.accounts) {
    if (!allowedTypes.has(account.accountType)) fail(`Template générique: accountType invalide ${account.code}:${account.accountType}`);
    if (account.accountSubtype && !allowedSubtypes.has(account.accountSubtype)) fail(`Template générique: accountSubtype invalide ${account.code}:${account.accountSubtype}`);
    if (account.parentCode && !uniqueCodes.has(account.parentCode)) fail(`Template générique: parent absent ${account.code}:${account.parentCode}`);
    if (account.isSystemAccount !== true) fail(`Template générique: compte legacy non système ${account.code}`);
    const mustBlockDirectPosting = account.accountSubtype === "ACCOUNTS_RECEIVABLE" || account.accountSubtype === "ACCOUNTS_PAYABLE";
    if (account.allowDirectPosting === mustBlockDirectPosting) fail(`Template générique: règle allowDirectPosting modifiée ${account.code}`);
    if (account.isControlAccount !== false) fail(`Template générique: comportement isControlAccount legacy modifié ${account.code}`);
  }

  for (const marker of [
    "Framework Registry",
    "Template Version",
    "Organization Chart",
    "Semantic Account Mapping",
    "GENERIC_SMALL_BUSINESS",
    "SYSCOHADA",
    "SYCEBNL",
    "PUBLISHED",
    "immutable",
  ]) {
    if (!architecture.includes(marker)) fail(`Documentation architecture: marqueur manquant ${marker}`);
  }
}

if (failures.length) {
  console.error(`QA Accounting Framework Registry: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("QA Accounting Framework Registry: OK");
