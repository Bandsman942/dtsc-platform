import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, tokens, scope) => {
  for (const token of tokens) check(source.includes(token), `${scope}: missing ${token}`);
};

const retiredCompatibilityBridges = [
  ["components/enterprise/professional/enterprise-customers-workspace-v2.tsx", "enterprise-customers-workspace"],
  ["components/enterprise/professional/enterprise-catalog-workspace-v2.tsx", "enterprise-catalog-workspace"],
  ["components/enterprise/professional/enterprise-crm-workspace-v2.tsx", "enterprise-crm-workspace"],
  ["components/enterprise/professional/enterprise-contracts-workspace-v2.tsx", "enterprise-contracts-workspace"],
  ["components/enterprise/professional/enterprise-assets-maintenance-workspace-v2.tsx", "enterprise-assets-maintenance-workspace"],
  ["components/enterprise/enterprise-ai-workspace-v2.tsx", "enterprise-ai-workspace"],
  ["components/enterprise/professional/enterprise-finance-accounting-workspace-v3.tsx", "enterprise-finance-accounting-workspace"],
  ["components/enterprise/professional/enterprise-finance-advanced-workspace-hotfix.tsx", "enterprise-finance-advanced-workspace"],
  ["components/enterprise/professional/enterprise-finance-invoices-workspace-hotfix.tsx", "enterprise-finance-invoices-workspace"],
  ["components/enterprise/professional/enterprise-finance-payments-workspace-hotfix.tsx", "enterprise-finance-payments-workspace"],
  ["components/enterprise/professional/enterprise-finance-treasury-workspace-hotfix.tsx", "enterprise-finance-treasury-workspace"],
  ["components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace-hotfix.tsx", "enterprise-finance-cash-bank-reconciliation-workspace"],
  ["components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace-hotfix-legacy.tsx", "enterprise-finance-cash-bank-reconciliation-base"],
  ["components/enterprise/professional/finance-professional-workspace-shared-legacy.tsx", "finance-professional-workspace-core"],
  ["components/enterprise/enterprise-admin-hotfix-panels.tsx", "enterprise-administration-panels"],
  ["components/enterprise/enterprise-admin-hotfix-panels-legacy.tsx", "enterprise-administration-panels-base"],
];

for (const [file] of retiredCompatibilityBridges) {
  check(!exists(file), `Retired compatibility bridge must be deleted: ${file}`);
}

const canonicalImplementations = [
  ["components/enterprise/professional/enterprise-customers-workspace.tsx", ["export function EnterpriseCustomersWorkspace", "useProfessionalErpLocale", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-catalog-workspace.tsx", ["export function EnterpriseCatalogWorkspace", "useProfessionalErpLocale", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-crm-workspace.tsx", ["export function EnterpriseCrmWorkspace", "useProfessionalErpLocale", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-contracts-workspace.tsx", ["export function EnterpriseContractsWorkspace", "useProfessionalErpLocale", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-assets-maintenance-workspace.tsx", ["export function EnterpriseAssetsMaintenanceWorkspace", "useProfessionalErpLocale", 'presentation="editor"']],
  ["components/enterprise/enterprise-ai-workspace.tsx", ["export function EnterpriseAiWorkspace", "useCallback", "ContextualUserGuide"]],
  ["components/enterprise/professional/enterprise-finance-accounting-workspace.tsx", ["export function EnterpriseFinanceAccountingWorkspace", "AccountingCompactTable", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-finance-advanced-workspace.tsx", ["export function EnterpriseFinanceAdvancedWorkspace", "FinanceAccountingReferenceSelect", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-finance-invoices-workspace.tsx", ["export function EnterpriseFinanceInvoicesWorkspace", "financeStatusLabel", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-finance-payments-workspace.tsx", ["export function EnterpriseFinancePaymentsWorkspace", "financeStatusLabel", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-finance-treasury-workspace.tsx", ["export function EnterpriseFinanceTreasuryWorkspace", "financeStatusLabel", 'presentation="editor"']],
  ["components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx", ["export function EnterpriseFinanceCashBankReconciliationWorkspace", "enterprise-finance-cash-bank-reconciliation-base", "sessionStorage"]],
  ["components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-base.tsx", ["export function EnterpriseFinanceCashBankReconciliationBase", "FinanceReferenceSelect", 'presentation="editor"']],
  ["components/enterprise/professional/finance-professional-workspace-core.tsx", ["export type FinanceRecord", "FinanceRecordList", "FinanceCollaboration"]],
  ["components/enterprise/enterprise-administration-panels-base.tsx", ["EnterpriseConfigurationChecklistPanel", "EnterpriseAdministrationModulesPanel", "useFormSubmissionGuard"]],
];

for (const [file, tokens] of canonicalImplementations) {
  check(exists(file), `Canonical implementation missing: ${file}`);
  if (exists(file)) hasAll(read(file), tokens, file);
}

const route = read("app/enterprise-modules/[moduleCode]/page.tsx");
hasAll(route, [
  'from "@/components/enterprise/enterprise-ai-workspace"',
  'from "@/components/enterprise/professional/enterprise-assets-maintenance-workspace"',
  'from "@/components/enterprise/professional/enterprise-catalog-workspace"',
  'from "@/components/enterprise/professional/enterprise-contracts-workspace"',
  'from "@/components/enterprise/professional/enterprise-crm-workspace"',
  'from "@/components/enterprise/professional/enterprise-customers-workspace"',
], "ERP module router");
check(!/from ["'][^"']*(?:-v2|-v3|-hotfix|-legacy)["']/.test(route), "ERP module router must not import a suffixed compatibility workspace.");

const financeRouter = read("components/enterprise/enterprise-finance-module-page.tsx");
hasAll(financeRouter, [
  "EnterpriseFinanceAccountingWorkspace",
  "EnterpriseFinanceAdvancedWorkspace",
  "EnterpriseOperationalFinanceWorkspace",
  "DOWNSTREAM_FINANCE_MODULES",
  't("periodicAccountingTitle")',
  't("closingOperationsTitle")',
  't("assetDisposalsTitle")',
], "Finance module router");
check(!/from ["'][^"']*(?:-v3|-hotfix|-legacy)["']/.test(financeRouter), "Finance module router must not import a suffixed compatibility workspace.");
check(!/locale === "en" \? ["'](?:Periodic accounting|Closing operations|Asset disposals)/.test(financeRouter), "Finance module entry copy must come from the canonical catalogue.");

const operationalFinance = read("components/enterprise/professional/enterprise-operational-finance-workspace.tsx");
for (const name of [
  "EnterpriseFinanceInvoicesWorkspace",
  "EnterpriseFinancePaymentsWorkspace",
  "EnterpriseFinanceTreasuryWorkspace",
  "EnterpriseFinanceCashBankReconciliationWorkspace",
]) check(operationalFinance.includes(name), `Operational Finance must route through ${name}`);
check(!/WorkspaceHotfix/.test(operationalFinance), "Operational Finance must not route through Hotfix component names.");

const administration = read("components/enterprise/enterprise-administration-module.tsx");
check(administration.includes('from "@/components/enterprise/enterprise-administration-panels"'), "Enterprise administration must import canonical panels.");
check(!administration.includes("enterprise-admin-hotfix-panels"), "Enterprise administration runtime must not import the hotfix bridge.");
const durableAudit = read("components/enterprise/enterprise-admin-audit-panel-durable.tsx");
check(durableAudit.includes("enterprise-administration-panels-base"), "Durable audit must use the canonical administration base.");
check(!durableAudit.includes("enterprise-admin-hotfix-panels-legacy"), "Durable audit must not import the legacy bridge.");

const sharedFinance = read("components/enterprise/professional/finance-professional-workspace-shared.tsx");
check(sharedFinance.includes("finance-professional-workspace-core"), "Finance shared public API must use the canonical core.");
check(!sharedFinance.includes("finance-professional-workspace-shared-legacy"), "Finance shared public API must not import the legacy bridge.");

const commonWorkspace = read("components/enterprise/enterprise-module-workspace.tsx");
hasAll(commonWorkspace, [
  "translateWorkspaceGeneralization",
  'tw("commonFoundation")',
  'tw("companyIndicators")',
  'tw("accessResponsibilities")',
  "getControlledStatusLabel",
  'locale === "en" ? "en-US" : "fr-FR"',
], "Common ERP workspace i18n");
check(!commonWorkspace.includes('toLocaleDateString("fr-FR")'), "Common ERP workspace must not hardcode fr-FR date rendering.");
check(!commonWorkspace.includes('toLocaleString("fr-FR")'), "Common ERP workspace must not hardcode fr-FR date-time rendering.");
for (const forbidden of ["Workflow actif", "Workflow inactif", "Poste actif", "Département actif", "Mis à jour le"]) {
  check(!commonWorkspace.includes(`"${forbidden}"`), `Common ERP workspace still embeds local copy: ${forbidden}`);
}

const fr = JSON.parse(read("locales/enterprise-finance.fr.json"));
const en = JSON.parse(read("locales/enterprise-finance.en.json"));
check(JSON.stringify(Object.keys(fr).sort()) === JSON.stringify(Object.keys(en).sort()), "Enterprise Finance FR/EN catalogues must keep exact key parity.");
for (const key of [
  "periodicAccountingTitle",
  "periodicAccountingDescription",
  "closingOperationsTitle",
  "closingOperationsDescription",
  "assetDisposalsTitle",
  "assetDisposalsDescription",
]) {
  check(typeof fr[key] === "string" && fr[key].trim().length > 0, `Finance FR missing ${key}`);
  check(typeof en[key] === "string" && en[key].trim().length > 0, `Finance EN missing ${key}`);
}

for (const file of [
  "components/enterprise/professional/enterprise-customers-workspace.tsx",
  "components/enterprise/professional/enterprise-catalog-workspace.tsx",
  "components/enterprise/professional/enterprise-crm-workspace.tsx",
  "components/enterprise/professional/enterprise-contracts-workspace.tsx",
  "components/enterprise/professional/enterprise-assets-maintenance-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-accounting-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-payments-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-treasury-workspace.tsx",
]) {
  const source = read(file);
  check(!source.includes("w-screen"), `${file} must not force viewport width.`);
  check(
    source.includes('presentation="editor"') || source.includes("data-responsive-actions") || source.includes("ModuleWorkspace"),
    `${file} must preserve the responsive professional workspace contract.`,
  );
}

for (const [file, marker] of [
  ["components/enterprise/professional/enterprise-customers-workspace.tsx", 'professionalErpEnumLabel(locale, "role"'],
  ["components/enterprise/professional/enterprise-crm-workspace.tsx", 'professionalErpEnumLabel(locale, "opportunityStage"'],
  ["components/enterprise/professional/enterprise-contracts-workspace.tsx", 'professionalErpEnumLabel(locale, "approvalStatus"'],
  ["components/enterprise/professional/enterprise-catalog-workspace.tsx", 'professionalErpEnumLabel(locale, "itemType"'],
  ["components/enterprise/professional/enterprise-finance-invoices-workspace.tsx", "financeStatusLabel"],
  ["components/enterprise/professional/enterprise-finance-payments-workspace.tsx", "financeStatusLabel"],
]) check(read(file).includes(marker), `${file} must project technical values through business labels.`);

const pkg = JSON.parse(read("package.json"));
check(pkg.scripts?.["qa:hotfix-669"] === "node scripts/qa-hotfix-669-ui-i18n-code-convergence.mjs", "package.json must expose qa:hotfix-669.");
check(String(pkg.scripts?.["qa:regression"] || "").includes("qa-hotfix-669-ui-i18n-code-convergence.mjs"), "qa:regression must include hotfix #669.");

if (failures.length) {
  console.error(`Hotfix #669 UI/i18n & Code Convergence QA failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Hotfix #669 UI/i18n & Code Convergence QA passed with ${canonicalImplementations.length} canonical implementations and ${retiredCompatibilityBridges.length} retired bridges absent.`);
