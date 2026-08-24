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
assert(workspace.includes("<table") && workspace.includes("compactTableHint"), "Entries, ledger and trial balance must use compact accounting tables.");
assert(overviewRoute.includes("OVERVIEW_RANGES") && overviewRoute.includes("journalActivity"), "Financial overview must expose range-filtered real accounting series.");
assert(accountRoute.includes('url.searchParams.get("chartId")'), "Ledger accounts must support tenant-scoped chart filtering.");
assert(formContract.includes("formulaire plein écran") && formContract.includes("combobox"), "The canonical DTSC form contract must remain present.");

console.log("[qa-hotfix-486] accounting UX contract checks passed");
