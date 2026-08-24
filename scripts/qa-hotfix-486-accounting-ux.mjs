import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`[qa-hotfix-486] ${message}`);
}

const modulePage = read("components/enterprise/enterprise-finance-module-page.tsx");
const workspace = read("components/enterprise/professional/enterprise-accounting-workspace.tsx");
const onboarding = read("components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx");
const professionalUi = read("components/enterprise/professional/professional-erp-ui.tsx");
const overviewRoute = read("app/api/enterprise/[organizationId]/accounting-professional/route.ts");
const accountRoute = read("app/api/enterprise/[organizationId]/ledger-accounts/route.ts");
const chartDetailRoute = read("app/api/enterprise/[organizationId]/charts-of-accounts/[chartId]/route.ts");
const fiscalYearRoute = read("app/api/enterprise/[organizationId]/fiscal-years/[fiscalYearId]/route.ts");
const fiscalPeriodRoute = read("app/api/enterprise/[organizationId]/fiscal-periods/[fiscalPeriodId]/route.ts");
const journalRoute = read("app/api/enterprise/[organizationId]/journals/[journalId]/route.ts");
const formContract = read("docs/ENTERPRISE_FORM_UX_CONTRACT.md");

assert(modulePage.includes("EnterpriseAccountingWorkspace"), "FINANCE_ACCOUNTING must use its dedicated workspace.");
assert(!modulePage.includes("EnterpriseAccountingOnboardingPanel"), "Accounting onboarding must not be rendered before the accounting workspace.");
assert(workspace.includes('"setup", "overview", "charts"'), "Accounting setup must be the first accounting sub-block.");
assert(workspace.includes("<ProfessionalTabs"), "Accounting must use the shared professional tab rail.");
assert(professionalUi.includes('scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })'), "The shared professional rail must recenter the active tab.");
assert(professionalUi.includes("data-horizontal-rail"), "The shared professional rail must expose the horizontal rail contract.");
assert(workspace.includes("ForegroundToast"), "Accounting forms must surface foreground status toasts.");
assert(onboarding.includes("diagnostic.actionHref"), "Readiness diagnostics must use canonical deep links.");
assert(onboarding.includes("FINANCE_OVERVIEW?configure=finance"), "Configuration diagnostics must link to the real Finance configuration surface.");
assert(workspace.includes("h-[92dvh]") && workspace.includes("h-[94dvh]"), "Long accounting forms/details must use tall full-screen-capable dialogs.");
assert(workspace.includes("actions.backToList"), "Accounting details must expose an explicit return-to-list action.");
assert(workspace.includes("<table") && workspace.includes("compactTableHint"), "Entries, ledger and trial balance must use compact accounting tables.");
assert(workspace.includes("SelectedChart") && workspace.includes("copy.currentChart"), "Charts of accounts must identify the currently active chart.");
assert(workspace.includes("actions.editItem") && workspace.includes("actions.deleteItem"), "Fiscal years, periods and journals must expose contextual CRUD actions.");
assert(workspace.includes("actions.deactivateJournal") && workspace.includes("actions.activateJournal"), "Journal lifecycle must expose real activate/deactivate actions.");
assert(overviewRoute.includes("OVERVIEW_RANGES") && overviewRoute.includes("journalActivity"), "Financial overview must expose range-filtered real accounting series.");
assert(overviewRoute.includes('by: ["journalId", "functionalCurrencyCode"]'), "Overview monetary activity must stay separated by currency.");
assert(accountRoute.includes('url.searchParams.get("chartId")'), "Ledger accounts must support tenant-scoped chart filtering.");
assert(chartDetailRoute.includes("accounts:") && chartDetailRoute.includes("organizationId"), "Chart detail must return its complete tenant-scoped account structure.");
assert(fiscalYearRoute.includes("export async function PATCH") && fiscalYearRoute.includes("export async function DELETE"), "Fiscal year contextual CRUD must be real server actions.");
assert(fiscalPeriodRoute.includes("export async function PATCH") && fiscalPeriodRoute.includes("export async function DELETE"), "Fiscal period contextual CRUD must be real server actions.");
assert(journalRoute.includes("export async function PATCH") && journalRoute.includes("export async function DELETE"), "Journal contextual CRUD must be real server actions.");
assert(fiscalYearRoute.includes("FISCAL_YEAR_NOT_EDITABLE"), "Fiscal year mutations must explain immutable lifecycle states.");
assert(fiscalPeriodRoute.includes("FISCAL_PERIOD_DELETE_BLOCKED"), "Fiscal period deletion must preserve accounting history.");
assert(journalRoute.includes("JOURNAL_DELETE_BLOCKED"), "Journal deletion must preserve entries and recommend deactivation.");
assert(formContract.includes("formulaire plein écran") && formContract.includes("combobox"), "The canonical DTSC form contract must remain present.");

console.log("[qa-hotfix-486] accounting UX contract checks passed");