import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-hr-payroll.prisma",
  "lib/enterprise/hr-payroll/contracts.ts",
  "lib/enterprise/hr-payroll/leave.ts",
  "lib/enterprise/hr-payroll/timesheets.ts",
  "lib/enterprise/hr-payroll/payroll.ts",
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
]);
requireTokens("lib/enterprise/hr-payroll/leave.ts", ["LEAVE_OVERLAP", "decidedAt"]);
requireTokens("lib/enterprise/hr-payroll/timesheets.ts", ["TIMESHEET_PERIOD_OVERLAP", "totalApprovedMinutes"]);
forbidTokens("lib/enterprise/hr-payroll/payroll.ts", ["status: \"PAID\"", "financialTransaction.create", "ledger", "bankAccount"]);
success("enterprise HR and operational payroll boundaries");
