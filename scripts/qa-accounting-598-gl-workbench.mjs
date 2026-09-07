import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const ok = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, tokens, scope) => {
  for (const token of tokens) ok(source.includes(token), `${scope}: missing ${token}`);
};

const modulePage = read("components/enterprise/enterprise-finance-module-page.tsx");
const workspace = read("components/enterprise/professional/enterprise-finance-accounting-workspace-v3.tsx");
const compactTable = read("components/enterprise/professional/accounting-compact-table.tsx");
const workbench = read("components/enterprise/professional/accounting-journal-workbench.tsx");
const referenceSelect = read("components/enterprise/core-v2/finance-accounting-reference-select.tsx");
const referenceRoute = read("app/api/enterprise/[organizationId]/accounting-reference-options/route.ts");
const queryRoute = read("app/api/enterprise/[organizationId]/accounting-query/route.ts");
const queryService = read("lib/enterprise/accounting/accounting-query-service.ts");
const dimensions = read("lib/enterprise/accounting/accounting-dimension-validation.ts");
const journalService = read("lib/enterprise/accounting/journal-service.ts");
const sourceLinks = read("lib/enterprise/accounting/accounting-source-link-registry.ts");
const aiAccounting = read("lib/ai/tools/executors/finance-accounting-query.ts");
const aiIndex = read("lib/ai/tools/executors/index.ts");
const financeContract = read("lib/ai/tools/finance-contract.ts");
const formContract = read("docs/FORM_UX_CONTRACT.md");

hasAll(modulePage, [
  "EnterpriseFinanceAccountingWorkspaceV3",
  'moduleCode === "FINANCE_ACCOUNTING"',
  "canCreate: capabilities.canCreate",
  "canSubmit: capabilities.canSubmit",
  "canWrite: capabilities.canWrite",
  "canApprove: capabilities.canApprove",
  "canManage: capabilities.canManage",
], "Accounting V3 router");

hasAll(workspace, [
  'type Space = "home" | "post" | "review" | "configure"',
  "AccountingCompactTable",
  "AccountingJournalWorkbench",
  "EnterpriseAccountingOnboardingPanel",
  "AssignedApprovalSubmitPanel",
  "FinanceAccountingReferenceSelect",
  "useToastMessage",
  "accounting-query",
  "entry-trace",
  'legacyTab === "entries"',
  'legacyTab === "ledger"',
  "pagination.pageCount",
  "capabilities?.canSubmit",
  "capabilities?.canApprove",
  "capabilities?.canPost",
  "capabilities?.canReverse",
], "Accounting V3 workspace");
ok(!workspace.includes("pageSize=500"), "Accounting V3 must not use oversized client lookups");
ok(!workspace.includes("pageSize=250"), "Accounting V3 must not use oversized client lookups");

hasAll(compactTable, [
  "data-accounting-compact-table",
  "overflow-x-auto",
  "sticky top-0",
  "tabular-nums",
  "text-[12px]",
  "whitespace-nowrap",
  "focus-visible:ring-2",
  "onKeyDown",
], "compact accounting table");

for (const kind of ["ledger-account", "business-party", "project", "department", "site", "asset", "inventory-item"]) {
  ok(workbench.includes(`kind="${kind}"`), `Journal Workbench must use canonical ${kind} reference`);
}
hasAll(workbench, [
  'presentation="editor"',
  "useToastMessage",
  "disabled={busy}",
  "totals.balanced",
  "totalDebit",
  "totalCredit",
  "addLine",
  "duplicateLine",
  "removeLine",
  "financeMutation",
  "setSuccessMessage",
  "setErrorMessage",
  "reset();",
  "onClose();",
], "Journal Workbench");
const mutationIndex = workbench.indexOf("await financeMutation");
const resetIndex = workbench.indexOf("reset();", mutationIndex);
const closeIndex = workbench.indexOf("onClose();", mutationIndex);
const catchIndex = workbench.indexOf("} catch (error)", mutationIndex);
ok(mutationIndex >= 0 && resetIndex > mutationIndex && closeIndex > mutationIndex && catchIndex > closeIndex, "Journal Workbench may reset/close only after a successful backend mutation");
ok(workbench.slice(catchIndex).includes("setErrorMessage") && !workbench.slice(catchIndex).includes("reset();"), "Journal Workbench must preserve entered values on backend failure");

hasAll(referenceSelect, [
  "AccountingReferenceKind",
  '"business-party"',
  '"project"',
  '"department"',
  '"site"',
  '"inventory-item"',
  "compact?: boolean",
  "setTimeout",
  "220",
], "canonical accounting reference selector");
hasAll(referenceRoute, [
  'moduleCode === "FINANCE_ACCOUNTING"',
  "organizationId",
  'kind === "business-party"',
  'kind === "project"',
  'kind === "department"',
  'kind === "site"',
  'kind === "inventory-item"',
  'kind === "asset"',
  'moduleCode === "FINANCE_ASSETS"',
], "tenant-scoped accounting references");

for (const field of ["businessPartyId", "projectId", "departmentId", "siteId", "assetId", "inventoryItemId"]) {
  ok(dimensions.includes(field), `dimension validator missing ${field}`);
}
for (const model of ["enterpriseBusinessParty", "enterpriseProject", "enterpriseDepartment", "enterpriseSite", "enterpriseAsset", "enterpriseInventoryItem"]) {
  ok(dimensions.includes(`${model}.findMany`), `dimension validator must resolve ${model} server-side`);
}
hasAll(dimensions, ["organizationId", "status: \"ACTIVE\"", "archivedAt: null", "assertResolved"], "dimension tenant integrity");
hasAll(journalService, [
  'import { validateAccountingDimensions }',
  "await validateAccountingDimensions(tx, organizationId, input.lines)",
  "await validateAccountingDimensions(tx, organizationId, entry.lines)",
  "assertAccountsPostable",
  "TransactionIsolationLevel.Serializable",
], "journal dimension enforcement");

hasAll(queryService, [
  "getAccountingGeneralLedger",
  "getAccountingTrialBalance",
  "getAccountingEntryTrace",
  "getAccountingAnomalies",
  'status: "POSTED"',
  "openingBalance",
  "periodDebit",
  "periodCredit",
  "closingBalance",
  "enterpriseFiscalPeriod.findFirst",
  "accountingDate: { lt: dateFrom }",
  "assetId",
  "inventoryItemId",
  "MAX_PAGE_SIZE = 100",
], "canonical accounting query service");
ok(!queryService.includes('status: filters.status || "POSTED"'), "General ledger status must not be client-overridable away from POSTED");
hasAll(queryRoute, [
  '"FINANCE_ACCOUNTING", "view"',
  "getAccountingGeneralLedger",
  "getAccountingTrialBalance",
  "getAccountingEntryTrace",
  "getAccountingAnomalies",
  "resolveAccountingSourceLink",
  "filters.dateFrom > filters.dateTo",
  "assetId",
  "inventoryItemId",
  "serializeFinanceValue",
], "accounting query endpoint");

hasAll(sourceLinks, [
  "resolveEnterpriseModuleAccess",
  "action: \"read\"",
  "if (!access.allowed) return null",
  "organizationId: input.organizationId",
], "permission-aware accounting source links");
ok(!sourceLinks.includes("prisma["), "source-link registry must not use dynamic Prisma access");

hasAll(aiAccounting, [
  "FINANCE_ACCOUNTING_READ",
  "getAccountingTrialBalance",
  "getAccountingGeneralLedger",
  "getAccountingAnomalies",
  "organizationId = context.organizationId",
  "MAX_QUERY_ROWS = 25",
  "generalLedgerLines",
  "trialBalanceAccounts",
], "shared Accounting AI executor");
hasAll(aiIndex, [
  "FINANCE_ACCOUNTING_QUERY_AI_EXECUTORS",
  "...FINANCE_AI_TOOL_EXECUTORS",
  "...FINANCE_ACCOUNTING_QUERY_AI_EXECUTORS",
], "AI executor precedence");
ok(aiIndex.indexOf("...FINANCE_ACCOUNTING_QUERY_AI_EXECUTORS") > aiIndex.indexOf("...FINANCE_AI_TOOL_EXECUTORS"), "canonical accounting AI executor must override only FINANCE_ACCOUNTING_READ after the legacy finance map");
hasAll(financeContract, [
  'code: "FINANCE_ACCOUNTING_READ", moduleCode: "FINANCE_ACCOUNTING"',
  "requiredModuleCodes: [spec.moduleCode]",
], "Accounting AI entitlement contract");
ok(!aiAccounting.includes("create(") && !aiAccounting.includes("update(") && !aiAccounting.includes("delete("), "Accounting AI executor must remain read-only");

hasAll(formContract, ["combobox", "toast global", "formulaire reste ouvert", "valeurs saisies restent présentes"], "DTSC form UX contract");

if (failures.length) {
  console.error(`Accounting #598 QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Accounting #598 QA: OK — tenant dimensions, posted GL/trial, compact workbench, permission-aware source links and shared read-only AI queries enforced");
