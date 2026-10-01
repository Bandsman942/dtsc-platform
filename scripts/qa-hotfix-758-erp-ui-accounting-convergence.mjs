import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const has = (file, token) => read(file).includes(token);
const check = (condition, message) => { if (!condition) failures.push(message); };
const requireTokens = (file, tokens) => {
  const content = read(file);
  for (const token of tokens) check(content.includes(token), `${file} missing ${token}`);
  return content;
};

// 1. Funding mobile layout: text must keep the full row on small screens and CTA stacks below.
const fundingPanel = requireTokens("components/enterprise/professional/enterprise-finance-funding-panel.tsx", [
  'grid-cols-[minmax(0,1fr)]',
  'sm:grid-cols-[minmax(0,1fr)_auto]',
  'break-words text-sm leading-6',
  'w-full whitespace-normal text-center sm:w-auto',
]);
check(!fundingPanel.includes('flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl'), "Funding notice must not regress to the narrow flex layout.");

// 2. Generic presentation must never fabricate a category for an absent enum.
const financeUi = requireTokens("components/enterprise/professional/finance-professional-ui.ts", [
  'const normalized = value.trim();',
  'if (!normalized) return "";',
]);
const accountingWorkspace = read("components/enterprise/professional/enterprise-finance-accounting-workspace.tsx");
check(!accountingWorkspace.includes('rowText(row, "accountType") || rowText(row, "journalType") || rowText(row, "templateCode")'), "Accounting compact cards must not derive one fake Type field from unrelated properties.");
check(accountingWorkspace.includes('configureView === "charts" ? ['), "Accounting lists must have per-entity columns.");
check(accountingWorkspace.includes('configureView === "years" ? ['), "Fiscal years need their own compact field contract.");
check(accountingWorkspace.includes('configureView === "periods" ? ['), "Fiscal periods need their own compact field contract.");
check(accountingWorkspace.includes('configureView === "rules" ? "account-mappings"'), "Rules must use the canonical account-mappings endpoint.");

// 3. Fiscal labels are real persisted data; no artificial fiscal type is introduced.
const schema = requireTokens("prisma/enterprise-accounting.prisma", [
  "model EnterpriseFiscalYear",
  "model EnterpriseFiscalPeriod",
  "label           String?",
  "model EnterpriseAccountMapping",
  "chartId             String",
  "@@unique([organizationId, chartId, mappingKey, effectiveFrom])",
]);
const migration = requireTokens("prisma/migrations/20261001230000_erp_ui_accounting_convergence/migration.sql", [
  'ALTER TABLE "EnterpriseFiscalYear" ADD COLUMN "label" TEXT;',
  'ALTER TABLE "EnterpriseFiscalPeriod" ADD COLUMN "label" TEXT;',
  'ALTER TABLE "EnterpriseAccountMapping" ADD COLUMN "chartId" TEXT;',
  'UPDATE "EnterpriseAccountMapping" AS mapping',
  'ALTER COLUMN "chartId" SET NOT NULL',
  'DROP INDEX "EnterpriseAccountMapping_organizationId_mappingKey_effectiv_key";',
]);
check(!schema.includes('model EnterpriseFiscalYear {\n  id') || !/model EnterpriseFiscalYear[\s\S]*?\n  type\s+String/.test(schema), "Fiscal year must not gain an artificial type field.");
check(!/model EnterpriseFiscalPeriod[\s\S]*?\n  type\s+String/.test(schema), "Fiscal period must not gain an artificial type field.");

requireTokens("lib/enterprise/accounting/schemas.ts", [
  "fiscalYearCreateSchema",
  'label: z.string().trim().min(2).max(160).optional()',
  "fiscalPeriodCreateSchema",
  "accountMappingCreateSchema",
  "accountMappingUpdateSchema",
]);
requireTokens("lib/enterprise/accounting/master-service.ts", [
  "label: input.label || null",
  'status: { in: ["DRAFT", "READY", "ACTIVE"] }',
]);

// 4. Custom rules are chart-scoped; published template rules stay immutable.
const mappingService = requireTokens("lib/enterprise/accounting/account-mapping-service.ts", [
  "chartId: account.chartId",
  "ACCOUNT_MAPPING_TEMPLATE_MANAGED",
  "ACCOUNT_MAPPING_ACCOUNT_TYPE_INCOMPATIBLE",
  "ACCOUNT_MAPPING_ACTIVE_EXISTS",
  "current.chartId",
]);
const resolver = requireTokens("lib/enterprise/accounting/semantic-account-resolver.ts", [
  'chart: { status: "ACTIVE" }',
]);
requireTokens("lib/enterprise/accounting/chart-template-application-service.ts", [
  "applyTemplateMappings(",
  "chartId: string",
  "where: { organizationId, chartId, mappingKey: mapping.mappingKey, effectiveFrom }",
]);
requireTokens("app/api/enterprise/[organizationId]/account-mappings/route.ts", [
  "getSemanticAccountDefinition",
  "templateManaged",
  "canEdit",
  "canDeactivate",
]);
requireTokens("app/api/enterprise/[organizationId]/account-mappings/[mappingId]/route.ts", [
  "updateManualAccountMapping",
  "deactivateManualAccountMapping",
  'authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage"',
]);
requireTokens("app/api/enterprise/[organizationId]/accounting-reference-options/route.ts", [
  '"semantic-account"',
  "SEMANTIC_ACCOUNT_REGISTRY",
  "customOnly",
  "configurableOnly",
]);
requireTokens("components/enterprise/professional/enterprise-finance-accounting-workspace.tsx", [
  'kind="semantic-account"',
  "customOnly configurableOnly",
  'kind="ledger-account"',
  "selectedRuleChartId",
  "New rule",
  "Nouvelle règle",
  "FormReadonlyFact",
  "onEdit={(kind, record)",
  "onDelete={(kind, record)",
]);
check(!accountingWorkspace.includes('<input type="hidden" name="accountType" value="ASSET"'), "Template-backed child accounts must inherit type from the parent, never send a fake ASSET type.");

const ohada = JSON.parse(read("lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json"));
const mappings = ohada.semanticMappings || [];
check(mappings.length >= 50, "SYSCOHADA published template must expose the full semantic mapping coverage.");
for (const key of ["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "SALES_REVENUE", "TAX_PAYABLE", "INVENTORY", "COST_OF_SALES", "CASH", "BANK", "BORROWINGS", "EQUITY_CAPITAL"]) {
  check(mappings.some((mapping) => mapping.mappingKey === key), `SYSCOHADA mapping missing ${key}`);
}

// 5. Contextual CRUD: server capabilities drive the … menu; lifecycle/history guards stay on the server.
requireTokens("components/enterprise/professional/accounting-record-detail.tsx", [
  "capabilities.canEdit",
  "capabilities.canDelete",
  "capabilities.canDeactivate",
  'id: "edit"',
  'id: "delete"',
  'actionLabel={en ? "Accounting actions" : "Actions comptables"}',
]);
for (const file of [
  "app/api/enterprise/[organizationId]/charts-of-accounts/[chartId]/route.ts",
  "app/api/enterprise/[organizationId]/ledger-accounts/[accountId]/route.ts",
  "app/api/enterprise/[organizationId]/fiscal-years/[fiscalYearId]/route.ts",
  "app/api/enterprise/[organizationId]/fiscal-periods/[fiscalPeriodId]/route.ts",
  "app/api/enterprise/[organizationId]/journals/[journalId]/route.ts",
]) {
  requireTokens(file, ["capabilities", "canEdit"]);
}
requireTokens("lib/enterprise/accounting/chart-lifecycle-service.ts", [
  "updateAccountingChartMetadata",
  "deleteEmptyDraftAccountingChart",
  "updateCustomLedgerAccount",
  "TEMPLATE_LEDGER_ACCOUNT_IMMUTABLE",
  "LEDGER_ACCOUNT_STRUCTURE_IN_USE",
]);

const mutableFullscreen = [
  "components/enterprise/professional/accounting-record-detail.tsx",
  "components/enterprise/gaming/enterprise-gaming-stations-workspace.tsx",
  "components/enterprise/gaming/enterprise-gaming-pricing-workspace.tsx",
  "components/enterprise/gaming/enterprise-gaming-checkout-workspace.tsx",
  "components/enterprise/gaming/enterprise-gaming-sessions-workspace.tsx",
  "components/enterprise/gaming/enterprise-gaming-bookings-workspace.tsx",
  "components/enterprise/gaming/enterprise-gaming-daily-close-workspace.tsx",
  "components/enterprise/gaming/enterprise-gaming-tournaments-workspace.tsx",
];
for (const file of mutableFullscreen) {
  const content = read(file);
  check(content.includes("<FullscreenEntityDetail"), `${file} must keep a full-screen entity detail.`);
  check(content.includes("actions={"), `${file} mutable full-screen detail must expose entity actions through the … menu.`);
  check(content.includes("actionLabel="), `${file} contextual menu must have an accessible action label.`);
}

// 6. Decorative access/responsibility shell block is forbidden.
const shell = read("components/enterprise/enterprise-module-workspace.tsx");
check(!shell.includes('tw("accessResponsibilities")'), "Decorative Access and responsibilities block must stay removed from the common ERP shell.");

// Existing UI contract remains applicable.
requireTokens("docs/FORM_UX_CONTRACT.md", ["backend", "permission"]);
requireTokens("docs/RESPONSIVE_UI_CONTRACT.md", ["320"]);

if (failures.length) {
  console.error("Hotfix #758 ERP UI/accounting convergence QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Hotfix #758 ERP UI/accounting convergence QA passed.");
