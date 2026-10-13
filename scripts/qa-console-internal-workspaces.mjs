import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const consolePage = read("app/admin/console-page.tsx");
const shell = read("components/admin/internal-department-workspace.tsx");
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
assert.match(shell, /min-h-11/);
assert.match(shell, /aria-labelledby/);
assert.match(shell, /sections.length > 1/);
assert.match(shell, /translate\(locale/);
for (const [lang, dict] of [["fr", fr], ["en", en]]) {
  for (const key of ["navigation","payroll","invoices","operations","supplyChain","payrollApprovals","workApprovals","executive","projects","technology","legalOverview","legalOperations"]) {
    assert.ok(typeof dict[key] === "string" && dict[key], `${lang} missing ${key}`);
  }
}
console.log("DTSC internal department workspace contract: PASS");
