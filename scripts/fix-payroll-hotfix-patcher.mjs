import fs from "node:fs";

const path = "scripts/apply-payroll-hotfix-once.mjs";
let source = fs.readFileSync(path, "utf8");

const startMarker = 'write("scripts/qa-payroll-hotfix-checks.mjs", `';
const endMarker = '\n\nappendOnce("docs/DTSC_PAYROLL_WORKFLOW.md"';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("QA generator block anchors not found");

const qaLines = [
  'import fs from "node:fs";',
  '',
  'const read = (path) => fs.readFileSync(path, "utf8");',
  'const schema = read("prisma/schema.prisma");',
  'const migration = read("prisma/migrations/20260729054500_payroll_active_period_retry/migration.sql");',
  'const workflow = read("lib/payroll-workflow.ts");',
  'const panel = read("components/admin/payroll-workflow-panel.tsx");',
  'const types = read("components/admin/payroll-workflow-types.ts");',
  'const packageJson = read("package.json");',
  'const docs = read("docs/DTSC_PAYROLL_WORKFLOW.md");',
  '',
  'const checks = [];',
  'const expect = (label, condition) => checks.push({ label, ok: Boolean(condition) });',
  '',
  'expect("Payroll period is no longer globally unique in Prisma", !schema.includes("@@unique([employeeId, periodStart, periodEnd])") && schema.includes("@@index([employeeId, periodStart, periodEnd])"));',
  'expect("DB keeps a partial unique active-period guard", migration.includes("HrcfoPayroll_active_period_key") && migration.includes("NOT IN (\\\'CANCELLED\\\', \\\'CANCELED\\\', \\\'REJECTED\\\')"));',
  'expect("Migration creates partial guard before dropping legacy unique index", migration.indexOf("CREATE UNIQUE INDEX") < migration.indexOf("DROP INDEX"));',
  'expect("Cancelled and rejected payrolls do not block a retry", workflow.includes(\'status: { notIn: ["CANCELLED", "CANCELED", "REJECTED"] }\'));',
  'expect("Race duplicate maps to an explicit payroll error", workflow.includes("isPrismaUniqueConstraintError") && workflow.includes("PAYROLL_PERIOD_EXISTS"));',
  'expect("Cancellation still releases active work evidence", workflow.includes(\'status: "CANCELLED"\') && workflow.includes("releasedAt: new Date()"));',
  'expect("Submission readiness exposes financial blockers", workflow.includes("buildPayrollSubmissionReadiness") && workflow.includes("COVERAGE_REASON_REQUIRED") && workflow.includes("BUDGET_ACCOUNT_CHANGED"));',
  'expect("Submission readiness exposes missing approver", workflow.includes("NO_APPROVER") && workflow.includes("approverName"));',
  'expect("Live submit uses the same readiness guard", workflow.includes("assertPayrollReadyForSubmission(existing, approvers.length > 0)"));',
  'expect("HR CFO UI has an explicit submission readiness model", types.includes("submissionReadiness") && panel.includes("submissionReadiness.blockers.map"));',
  'expect("Blocked submission button is disabled", panel.includes("submissionReadiness?.ready === false"));',
  'expect("Action failures use an explicit error tone", panel.includes(\'setMessageTone("error")\') && panel.includes("setActionError(errorMessage)") && panel.includes(\'role="alert"\'));',
  'expect("Hotfix QA is wired into regression", packageJson.includes("qa-payroll-hotfix-checks.mjs"));',
  'expect("Workflow documentation records period retry semantics", docs.includes("PAYROLL_PERIOD_RETRY_HOTFIX"));',
  '',
  'let failed = 0;',
  'for (const check of checks) {',
  '  console.log((check.ok ? "✓" : "✗") + " " + check.label);',
  '  if (!check.ok) failed += 1;',
  '}',
  'console.log("\\nPayroll hotfix QA: " + (checks.length - failed) + "/" + checks.length + " checks passed.");',
  'if (failed) process.exit(1);',
];

const replacement = [
  'write("scripts/qa-payroll-hotfix-checks.mjs", [',
  ...qaLines.map((line) => `  ${JSON.stringify(line)},`),
  '].join("\\n") + "\\n");',
].join("\n");

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source, "utf8");
console.log("Payroll hotfix QA generator replaced safely.");
