import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function expect(path, tokens) {
  const source = file(path);
  for (const token of tokens) assert.ok(source.includes(token), `${path} must include ${token}`);
}
expect("prisma/enterprise-hr-payroll.prisma", [
  "model EnterpriseWorkClockSession", "workClockSessions", "@@unique([organizationId, id]",
]);
expect("prisma/migrations/20261105210000_employee_work_clock_sessions/migration.sql", [
  "CREATE TABLE", "EWCS_one_open_per_employee", '"stoppedAt" IS NULL', "ON DELETE RESTRICT",
]);
expect("lib/enterprise/hr-payroll/self-service.ts", [
  'status: "ACTIVE"', "removedAt: null", "organizationMemberId: member.id",
  "archivedAt: null", "employmentStatus: \"ACTIVE\"", "hasEnterpriseSelfHrModule",
  "getOrganizationEntitlements", "getActiveEnterpriseModuleRestriction",
]);
expect("app/api/enterprise/[organizationId]/my-hr/route.ts", [
  'hasEnterpriseSelfHrModule(session, organizationId, "PAYROLL_OPERATIONS")', 'hasEnterpriseSelfHrModule(session, organizationId, "TIME_ATTENDANCE")',
  "employeeId: employee.id", 'status: "APPROVED"', 'status: "GENERATED"',
  '"Cache-Control": "private, no-store, max-age=0"',
]);
expect("app/api/enterprise/[organizationId]/my-hr/clock/route.ts", [
  "isSameOriginRequest", "rateLimit", "hasEnterpriseSelfHrModule", "employeeId: employee.id",
  "new Date()", "TransactionIsolationLevel.Serializable", "revision: open.revision",
]);
expect("app/api/enterprise/[organizationId]/my-hr/reports/route.ts", [
  "isSameOriginRequest", "timesheetCreateSchema", "employeeId: employee.id",
  "{ selfService: true }",
  "createEnterpriseTimesheet", "ENTERPRISE_SELF_WORK_REPORT_SUBMITTED",
]);
expect("app/api/enterprise/[organizationId]/my-hr/payslips/[payslipId]/pdf/route.ts", [
  "getActiveEnterpriseSelfEmployee", "hasEnterpriseSelfHrModule", 'status: "APPROVED"', 'status: "GENERATED"',
  '"Content-Type": "application/pdf"', '"Cache-Control": "private, no-store, max-age=0"',
  "ENTERPRISE_SELF_PAYSLIP_DOWNLOADED",
]);
expect("app/api/enterprise/[organizationId]/my-hr/approvers/route.ts", [
  "hasEnterpriseSelfHrModule", 'action: "approve"', "getActiveEnterpriseSelfEmployee",
]);
expect("lib/enterprise/hr-payroll/timesheets.ts", [
  "options?.selfService", 'action: "approve"', "SELF_APPROVAL_FORBIDDEN",
]);
expect("app/enterprise-modules/page.tsx", [
  "hasEnterpriseSelfHrModule", "?tab=SELF_SERVICE", '"/enterprise-modules/my-hr"',
]);
expect("app/enterprise-modules/my-hr/page.tsx", [
  "hasEnterpriseSelfHrModule", "getEnterpriseNavigationModules", "<EnterpriseMyHrSelfService",
]);
expect("app/api/enterprise/[organizationId]/payroll-runs/route.ts", [
  "actorScope", "manageAccess", "approverUserId: session.userId",
  "preparedByUserId: session.userId", "payroll-runs-self-only",
]);
expect("app/api/enterprise/[organizationId]/timesheets/route.ts", [
  "getActiveEnterpriseSelfEmployee", "EMPLOYEE_TIMESHEET_NOT_OWNED", "metricScope",
]);
expect("app/api/enterprise/[organizationId]/attendance/route.ts", [
  "getActiveEnterpriseSelfEmployee", "...actorScope",
]);
expect("app/api/enterprise/[organizationId]/hr-payroll-lookups/route.ts", [
  "A personal read permission never exposes", "members: [], employees: []",
]);
expect("components/enterprise/professional/enterprise-my-hr-self-service.tsx", [
  "My HR space", "Mon espace RH", "clockSessions", "payslips",
  "canSubmitReport", "dark:", "pdf?lang=", "setRefresh",
]);
assert.ok(!file("app/api/enterprise/[organizationId]/my-hr/clock/route.ts").includes("enterpriseTimesheet.create"),
  "A clock session must not automatically create an approved timesheet");
assert.ok(!file("app/api/enterprise/[organizationId]/my-hr/payslips/[payslipId]/pdf/route.ts").includes("enterprisePayment.create"),
  "PDF payslips must never trigger payments");
assert.ok(!file("components/enterprise/professional/enterprise-my-hr-self-service.tsx").includes("new Date().toISOString().slice(0, 10)"),
  "Business date input must use the browser local calendar date");
console.info("Hotfix #1029 HR personal payroll/time security QA: OK");
