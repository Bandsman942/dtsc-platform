import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const consolePage = read("app/admin/console-page.tsx");
const shell = read("components/admin/internal-department-workspace.tsx");
const navigation = read("components/admin/internal-department-workspace-client.tsx");
const fullscreen = read("components/admin/internal-full-screen-surface.tsx");
const registers = read("components/admin/operations-admin-panel.tsx");
const fr = JSON.parse(read("locales/fr.json")).console.internalSections;
const en = JSON.parse(read("locales/en.json")).console.internalSections;

assert.match(consolePage, /<InternalDepartmentWorkspace/);
assert.equal((consolePage.match(/<InternalDepartmentWorkspace/g) || []).length, 7, "Each internal department has one workspace");
for (const section of ["hr-cfo", "sco", "coo", "ceo", "mpo", "cto"]) {
  assert.match(consolePage, new RegExp(`section === "${section}"`));
}
for (const component of ["OperationsAdminPanel", "PayrollWorkflowPanel", "PayrollApprovalPanel", "WorkSubmissionReviewPanel", "CeoExecutiveSummary", "LegalDashboardSummary"]) {
  const path = {
    OperationsAdminPanel: "operations-admin-panel",
    PayrollWorkflowPanel: "payroll-workflow-panel",
    PayrollApprovalPanel: "payroll-approval-panel",
    WorkSubmissionReviewPanel: "work-submission-review-panel",
    CeoExecutiveSummary: "ceo-executive-summary",
    LegalDashboardSummary: "legal-dashboard-summary",
  }[component];
  const source = read(`components/admin/${path}.tsx`);
  assert.match(source, /embedded\s*=\s*false/);
  assert.match(source, /!embedded\s*\?/);
  assert.match(consolePage, new RegExp(`<${component}\\b[^>]* embedded(?:\\s|\\/|>)`), `missing embedded mode for ${component}`);
}
assert.match(consolePage, /getConsoleAccessDecision/);
assert.match(consolePage, /canAccessAdminSection/);
assert.match(consolePage, /canReadHrcfoInvoices/);
assert.match(consolePage, /approverRole="COO"/);
assert.match(consolePage, /approverRole="CEO"/);
assert.match(consolePage, /reviewerRole="COO"/);
assert.match(consolePage, /reviewerRole="CEO"/);
assert.match(shell, /InternalDepartmentWorkspaceClient/);
assert.match(shell, /translate\(locale/);
assert.match(navigation, /data-console-internal-workspace/);
assert.match(navigation, /data-console-department-section/);
assert.match(navigation, /aria-labelledby/);
assert.match(navigation, /min-h-11/);
assert.match(navigation, /useSmartList/);
assert.match(navigation, /InternalFullScreenSurface/);
assert.match(fullscreen, /aria-modal="true"/);
assert.match(fullscreen, /containModalTab/);
assert.match(fullscreen, /safe-area-inset-bottom/);
for (const layer of [970, 980, 990]) assert.ok(fullscreen.includes(`z-[${layer}]`), `full-screen layer ${layer} must outrank global floating actions while staying below dialogs`);
assert.match(registers, /data-dtsc-register-fullscreen/);
assert.match(registers, /data-dtsc-record-detail/);
assert.match(registers, /setStatus/);
assert.match(registers, /type="date"/);
assert.match(registers, /pageSize: 12/);
for (const [file, requirements] of [
  ["components/admin/payroll-workflow-panel.tsx", ["InternalFullScreenSurface", "ListControls", "type=\"date\"", "aria-pressed"]],
  ["components/admin/payroll-approval-panel.tsx", ["InternalFullScreenSurface", "ListControls", "type=\"date\"", "aria-pressed"]],
  ["components/admin/work-submission-review-panel.tsx", ["InternalFullScreenSurface", "ListControls", "type=\"date\"", "aria-pressed"]],
  ["components/admin/hrcfo-invoice-list.tsx", ["data-dtsc-invoice-detail", "ContextActions", "ListControls", "type=\"date\""]],
  ["components/admin/internal-finance-controls-client.tsx", ["data-dtsc-treasury-detail", "ContextActions", "ListControls", "type=\"date\""]],
  ["components/admin/ceo-executive-summary.tsx", ["InternalFullScreenSurface", "ContextActions", "ListControls", "type=\"date\""]],
]) {
  const source = read(file);
  for (const requirement of requirements) assert.ok(source.includes(requirement), `${file} missing Design 2.0 contract: ${requirement}`);
}
assert.match(read("components/admin/admin-floating-nav.tsx"), /data-dtsc-internal-compact-header/);
for (const [lang, dict] of [["fr", fr], ["en", en]]) {
  for (const key of ["navigation","payroll","invoices","operations","supplyChain","payrollApprovals","workApprovals","executive","projects","technology","legalOverview","legalOperations"]) {
    assert.ok(typeof dict[key] === "string" && dict[key], `${lang} missing ${key}`);
  }
}
console.log("DTSC internal department workspace contract: PASS");
