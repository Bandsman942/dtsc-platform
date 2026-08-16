import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-hr-payroll.prisma",
  "lib/enterprise/hr-payroll/contracts.ts",
  "lib/enterprise/hr-payroll/leave.ts",
  "lib/enterprise/hr-payroll/timesheets.ts",
  "lib/enterprise/hr-payroll/payroll.ts",
  "app/api/enterprise/[organizationId]/employment-contracts/[contractId]/route.ts",
  "app/api/enterprise/[organizationId]/approval-eligibility/route.ts",
  "app/api/enterprise/[organizationId]/payroll-runs/route.ts",
  "app/api/enterprise/[organizationId]/payroll-runs/[payrollRunId]/decision/route.ts",
]);
requireTokens("lib/enterprise/hr-payroll/payroll.ts", [
  "ACTIVE_EMPLOYMENT_CONTRACT_REQUIRED",
  "SELF_APPROVAL_FORBIDDEN",
  "enterprisePayslip",
  "paymentCreated: false",
  "PAYROLL_RUN_ALREADY_EXISTS",
  "CANCELLED",
  '"PAYROLL_OPERATIONS"',
]);
requireTokens("lib/enterprise/hr-payroll/leave.ts", ["LEAVE_OVERLAP", "decidedAt", '"TIME_ATTENDANCE"']);
requireTokens("lib/enterprise/hr-payroll/timesheets.ts", ["TIMESHEET_PERIOD_OVERLAP", "totalApprovedMinutes", '"TIME_ATTENDANCE"']);
requireTokens("lib/enterprise/hr-payroll/helpers.ts", [
  "SELF_APPROVAL_FORBIDDEN",
  "APPROVER_NOT_MEMBER",
  "APPROVER_PERMISSION_DENIED",
  'action: "approve"',
]);
requireTokens("lib/enterprise/hr-payroll/contracts.ts", [
  "EMPLOYMENT_CONTRACT_EDIT_FORBIDDEN",
  "EMPLOYMENT_CONTRACT_NOT_EDITABLE",
  "EMPLOYMENT_CONTRACT_UPDATED_RESUBMITTED",
  'status: "SUPERSEDED"',
  '"HUMAN_RESOURCES"',
]);
requireTokens("app/api/enterprise/[organizationId]/employment-contracts/[contractId]/route.ts", [
  "employmentContractUpdateSchema",
  'action: "write"',
  "isSameOriginRequest",
  "rateLimit",
  "writeAuditLog",
]);
requireTokens("app/api/enterprise/[organizationId]/approval-eligibility/route.ts", [
  "SELF_APPROVAL_FORBIDDEN",
  "APPROVER_PERMISSION_DENIED",
  'action: "approve"',
]);
for (const path of [
  "app/api/enterprise/[organizationId]/employment-contracts/[contractId]/decision/route.ts",
  "app/api/enterprise/[organizationId]/leave-requests/[requestId]/decision/route.ts",
  "app/api/enterprise/[organizationId]/timesheets/[timesheetId]/decision/route.ts",
  "app/api/enterprise/[organizationId]/payroll-runs/[payrollRunId]/decision/route.ts",
]) {
  requireTokens(path, ['action: "approve"']);
}
forbidTokens("app/api/enterprise/[organizationId]/employment-contracts/[contractId]/decision/route.ts", [
  'moduleCode: "HUMAN_RESOURCES", action: "manage"',
]);
forbidTokens("app/api/enterprise/[organizationId]/payroll-runs/[payrollRunId]/decision/route.ts", [
  'moduleCode: "PAYROLL_OPERATIONS", action: "manage"',
]);
forbidTokens("lib/enterprise/hr-payroll/payroll.ts", ["status: \"PAID\"", "financialTransaction.create", "ledger", "bankAccount"]);
success("enterprise HR and operational payroll boundaries");
