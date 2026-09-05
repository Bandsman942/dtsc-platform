import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const ok = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, tokens, scope) => { for (const token of tokens) ok(source.includes(token), `${scope}: missing ${token}`); };

const modulePage = read("components/enterprise/enterprise-finance-module-page.tsx");
const accountingUi = read("components/enterprise/professional/enterprise-finance-accounting-workspace-hotfix.tsx");
const advancedUi = read("components/enterprise/professional/enterprise-finance-advanced-workspace-hotfix.tsx");
const referenceUi = read("components/enterprise/core-v2/finance-accounting-reference-select.tsx");
const referenceRoute = read("app/api/enterprise/[organizationId]/accounting-reference-options/route.ts");
const journalRoute = read("app/api/enterprise/[organizationId]/journal-entries/route.ts");
const closeRoute = read("app/api/enterprise/[organizationId]/financial-close/route.ts");
const taxRoute = read("app/api/enterprise/[organizationId]/taxes/route.ts");
const statementsRoute = read("app/api/enterprise/[organizationId]/financial-statements/route.ts");
const assetsRoute = read("app/api/enterprise/[organizationId]/asset-accounting/route.ts");
const financeContract = read("lib/ai/tools/finance-contract.ts");
const docs = read("docs/HOTFIX_582_FINANCE_ACCOUNTING_TAX_CLOSE_STATEMENTS_ASSETS.md");

hasAll(modulePage, [
  "EnterpriseFinanceAccountingWorkspaceHotfix",
  "EnterpriseFinanceAdvancedWorkspaceHotfix",
  "canCreate: capabilities.canCreate",
  "canSubmit: capabilities.canSubmit",
  "canWrite: capabilities.canWrite",
  "canApprove: capabilities.canApprove",
  "canManage: capabilities.canManage",
  '"FINANCE_TAX", "FINANCE_CLOSE", "FINANCE_STATEMENTS", "FINANCE_ASSETS"',
], "finance module routing");

for (const [name, source] of [["accounting hotfix", accountingUi], ["downstream hotfix", advancedUi]]) {
  hasAll(source, ['presentation="editor"', "useToastMessage", "disabled={busy}", "FinanceAccountingReferenceSelect"], name);
  ok(!source.includes("pageSize=500"), `${name}: fixed 500-record lookup is forbidden`);
  ok(!source.includes("pageSize=250"), `${name}: fixed 250-record lookup is forbidden`);
  ok(!source.includes("MANAGER_ROLES"), `${name}: local role grants are forbidden`);
}

hasAll(accountingUi, [
  "EnterpriseAccountingOnboardingPanel",
  "AssignedApprovalSubmitPanel",
  "capabilities?.canSubmit",
  "capabilities?.canApprove",
  "capabilities?.canReject",
  "capabilities?.canPost",
  "capabilities?.canReverse",
  "recordId",
  'kind="ledger-account"',
  'kind="fiscal-period"',
  'kind="journal"',
], "accounting workflow UI");

hasAll(advancedUi, [
  '"FINANCE_TAX"', '"FINANCE_CLOSE"', '"FINANCE_STATEMENTS"', '"FINANCE_ASSETS"',
  "capabilities?.canSubmit", "capabilities?.canApprove", "capabilities?.canClose", "capabilities?.canReopen",
  "fetchOperationalFinanceRecord",
  'kind="asset"', 'kind="ledger-account"', 'kind="fiscal-period"',
], "downstream workflow UI");

hasAll(referenceRoute, [
  "const take = 30",
  "authorizeFinanceRequest",
  "organizationId",
  'kind === "ledger-account"',
  'kind === "asset"',
  "enterpriseAssetAccountingProfile.findMany",
  "id: { notIn: existingProfiles.map",
], "accounting reference endpoint");
hasAll(referenceUi, ["setTimeout", "220", "accounting-reference-options", "parentId", "directPosting"], "accounting reference selector");

hasAll(journalRoute, [
  "recordId",
  'targetEntityType: "EnterpriseJournalEntry"',
  'status: "PENDING"',
  "approverUserId === auth.session.userId",
  "canSubmit", "canApprove", "canReject", "canPost", "canReverse",
], "journal item capabilities");
hasAll(closeRoute, [
  "recordId", "search",
  'targetEntityType: "EnterpriseFinancialClose"',
  "approverUserId === auth.session.userId",
  "canSubmit", "canApprove", "canClose", "canReopen",
], "financial close item capabilities");
hasAll(taxRoute, ["financeListParams(req)", "recordId", "search", '"FINANCE_TAX", "create"'], "tax authoritative list/create permission");
hasAll(statementsRoute, ["recordId", "search", 'parsed.data.publish ? "manage" : "create"'], "statement mutation authorization");
hasAll(assetsRoute, ["recordId", "canRunDepreciation", "canDispose", '"FINANCE_ASSETS", "manage"'], "asset accounting sensitive capabilities");

for (const [tool, moduleCode] of [
  ["FINANCE_ACCOUNTING_READ", "FINANCE_ACCOUNTING"],
  ["FINANCE_TAX_READ", "FINANCE_TAX"],
  ["FINANCE_CLOSE_READ", "FINANCE_CLOSE"],
  ["FINANCE_STATEMENTS_READ", "FINANCE_STATEMENTS"],
  ["FINANCE_ASSETS_READ", "FINANCE_ASSETS"],
]) {
  ok(financeContract.includes(`code: "${tool}", moduleCode: "${moduleCode}"`), `AI contract: ${tool} must map to ${moduleCode}`);
}
ok(financeContract.includes("requiredModuleCodes: [spec.moduleCode]"), "AI definitions must project requiredModuleCodes from the canonical spec");

hasAll(docs, ["#521", "#515", "#516", "OWNER_E2E", "f18c9964ab4c1175ac8456425f0812158b3a6edc"], "hotfix documentation");

if (failures.length) {
  console.error(`Hotfix #582 QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Hotfix #582 Finance Accounting/Tax/Close/Statements/Assets QA: OK");
