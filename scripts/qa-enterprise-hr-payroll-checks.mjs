import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-hr-payroll.prisma",
  "lib/enterprise/hr-payroll/contracts.ts",
  "lib/enterprise/hr-payroll/leave.ts",
  "lib/enterprise/hr-payroll/timesheets.ts",
  "lib/enterprise/hr-payroll/time-attendance.ts",
  "lib/enterprise/hr-payroll/time-schemas.ts",
  "lib/enterprise/hr-payroll/payroll.ts",
  "lib/forms/reference-catalog.ts",
  "components/enterprise/core-v2/erp-v2-ui.tsx",
  "components/ui/toast-provider.tsx",
  "app/api/enterprise/[organizationId]/employment-contracts/[contractId]/route.ts",
  "app/api/enterprise/[organizationId]/approval-eligibility/route.ts",
  "app/api/enterprise/[organizationId]/hr-payroll-lookups/route.ts",
  "app/api/enterprise/[organizationId]/work-schedules/route.ts",
  "app/api/enterprise/[organizationId]/work-schedules/[scheduleId]/end/route.ts",
  "app/api/enterprise/[organizationId]/attendance/route.ts",
  "app/api/enterprise/[organizationId]/leave-requests/[requestId]/cancel/route.ts",
  "app/api/enterprise/[organizationId]/payroll-runs/route.ts",
  "app/api/enterprise/[organizationId]/payroll-runs/[payrollRunId]/decision/route.ts",
]);

requireTokens("lib/enterprise/hr-payroll/helpers.ts", [
  "STRICT_INDEPENDENT_APPROVAL_MODULES",
  '"HUMAN_RESOURCES"',
  '"TIME_ATTENDANCE"',
  '"PAYROLL_OPERATIONS"',
  "SELF_APPROVAL_FORBIDDEN",
  "APPROVER_PERMISSION_DENIED",
  "assertEnterpriseApprovalCandidate",
  "assertEnterpriseApprovalDecision",
]);

requireTokens("lib/enterprise/hr-payroll/schemas.ts", [
  "EMPLOYMENT_CONTRACT_TYPES",
  '"EMPLOYMENT"',
  '"INDEFINITE"',
  '"FIXED_TERM"',
  '"CONSULTING"',
  '"INTERNSHIP"',
  "contractType: z.enum(EMPLOYMENT_CONTRACT_TYPES)",
  "LEAVE_TYPES",
  "leaveType: z.enum(LEAVE_TYPES)",
  "entry.workDate < value.periodStart",
  "La fin de période de paie ne peut pas précéder son début.",
]);

requireTokens("lib/enterprise/hr-payroll/contracts.ts", [
  "EMPLOYMENT_CONTRACT_EDIT_FORBIDDEN",
  "EMPLOYMENT_CONTRACT_NOT_EDITABLE",
  "EMPLOYMENT_CONTRACT_UPDATED_RESUBMITTED",
  'status: "SUPERSEDED"',
  "resolveContractReferences",
  "enterprisePosition.findFirst",
  "EMPLOYMENT_CONTRACT_POSITION_DEPARTMENT_MISMATCH",
  "positionId: position?.id || null",
  "positionCode: position?.positionCode || null",
]);

requireTokens("lib/enterprise/hr-payroll/timesheets.ts", [
  "TIMESHEET_PERIOD_OVERLAP",
  "totalApprovedMinutes",
  '"TIME_ATTENDANCE"',
  "TIMESHEET_ENTRY_DURATION_INVALID",
  "enterpriseTask.findMany",
  "enterpriseProjectMilestone.findMany",
  "enterpriseProjectDeliverable.findMany",
  "enterpriseContract.findMany",
  "enterpriseBusinessParty.findMany",
  "enterpriseCatalogItem.findMany",
]);

requireTokens("lib/enterprise/hr-payroll/leave.ts", [
  "LEAVE_OVERLAP",
  "decidedAt",
  '"TIME_ATTENDANCE"',
  "cancelEnterpriseLeaveRequest",
  "LEAVE_REQUEST_NOT_CANCELLABLE",
]);

requireTokens("lib/enterprise/hr-payroll/time-attendance.ts", [
  "createEnterpriseWorkSchedule",
  "WORK_SCHEDULE_OVERLAP",
  "endEnterpriseWorkSchedule",
  "WORK_SCHEDULE_ENDED",
  'status: "ENDED"',
  "createEnterpriseAttendance",
  "ATTENDANCE_ALREADY_RECORDED",
  "ATTENDANCE_APPROVED_LEAVE_CONFLICT",
  "ATTENDANCE_ABSENT_WITH_OBSERVED_TIME",
  "ATTENDANCE_SITE_TIMEZONE_REQUIRED",
  "ATTENDANCE_SITE_TIMEZONE_INVALID",
  "zonedMinuteToUtc",
  "site?.timezone",
]);

requireTokens("lib/enterprise/hr-payroll/time-schemas.ts", [
  "workScheduleEndSchema",
  "observedStartMinute",
  "observedEndMinute",
  "Utilisez soit des instants absolus, soit des heures locales du site, pas les deux.",
]);

for (const path of [
  "app/api/enterprise/[organizationId]/work-schedules/route.ts",
  "app/api/enterprise/[organizationId]/work-schedules/[scheduleId]/end/route.ts",
  "app/api/enterprise/[organizationId]/attendance/route.ts",
  "app/api/enterprise/[organizationId]/leave-requests/[requestId]/cancel/route.ts",
]) requireTokens(path, ["isSameOriginRequest", "rateLimit", "writeAuditLog", 'moduleCode: "TIME_ATTENDANCE"']);

requireTokens("app/api/enterprise/[organizationId]/hr-payroll-lookups/route.ts", [
  "listEnterpriseApprovalCandidates",
  "candidate.userId !== session.userId",
  "enterpriseEmployee.findMany",
  'employmentStatus: "ACTIVE"',
  "enterprisePosition.findMany",
  "enterpriseSite.findMany",
  "timezone: true",
  "enterpriseTask.findMany",
  "enterprisePayrollPeriod.findMany",
]);

requireTokens("app/api/enterprise/[organizationId]/leave-requests/route.ts", ["canDecide", "canCancel", "item.approverUserId === session.userId", "item.requestedByUserId === session.userId"]);
requireTokens("app/api/enterprise/[organizationId]/timesheets/route.ts", ["canDecide", "item.approverUserId === session.userId"]);
requireTokens("app/api/enterprise/[organizationId]/employment-contracts/route.ts", ["canDecide", "approverByContract.get(item.id) === session.userId"]);
requireTokens("app/api/enterprise/[organizationId]/payroll-runs/route.ts", ["canDecide"]);

requireTokens("lib/enterprise/hr-payroll/payroll.ts", [
  "ACTIVE_EMPLOYMENT_CONTRACT_REQUIRED",
  "assertOrganizationApprovalDecision",
  "enterprisePayslip",
  "paymentCreated: false",
  "PAYROLL_RUN_ALREADY_EXISTS",
  "CANCELLED",
  '"PAYROLL_OPERATIONS"',
  "enterpriseTimesheetEntry.findMany",
  "approvedTimeMinutes",
  "PAYROLL_BONUS_REASON_REQUIRED",
  "PAYROLL_DEDUCTION_REASON_REQUIRED",
  "PAYROLL_ADJUSTMENT_EMPLOYEE_OUTSIDE_POPULATION",
]);

requireTokens("lib/enterprise/accounting/payments-service.ts", [
  'input.paymentType === "PAYROLL_PAYMENT"',
  "PAYROLL_RUN_REQUIRED",
  "PAYROLL_PAYMENT_TYPE_REQUIRED",
  "PAYROLL_PAYMENT_DIRECTION_INVALID",
  "PAYROLL_PAYMENT_CURRENCY_MISMATCH",
  "PAYROLL_PAYMENT_EXCEEDS_REMAINING",
  'status: { notIn: ["CANCELLED", "REVERSED"] }',
  'input.paymentType === "PAYROLL_PAYMENT" ? new Prisma.Decimal(0) : amount',
]);

requireTokens("components/enterprise/core-v2/erp-v2-ui.tsx", [
  "effectiveRequired",
  "childProps?.required === true",
  "hasExplicitEmptyChoice",
  'items.some((item) => item.id === "")',
]);
requireTokens("lib/forms/reference-catalog.ts", [
  "PROFESSIONAL_FIELD_HELP",
  "employeeId:",
  "approverUserId:",
  "contractType:",
  "payrollPeriodId:",
  "/^(bonusReason_|deductionReason_)/",
]);
requireTokens("components/ui/toast-provider.tsx", ["z-[1600]", "env(safe-area-inset-top)"]);

for (const path of [
  "components/enterprise/professional/enterprise-human-resources-workspace.tsx",
  "components/enterprise/professional/enterprise-time-attendance-workspace.tsx",
  "components/enterprise/professional/enterprise-payroll-operations-workspace.tsx",
]) {
  requireTokens(path, ['presentation="editor"', "useToastMessage", "ProfessionalError"]);
  forbidTokens(path, ["window.prompt"]);
}

requireTokens("components/enterprise/professional/enterprise-human-resources-workspace.tsx", [
  "disabled={saving}",
  "contract.canDecide",
  't("hr.newContractDialog")',
  't("hr.orgSection")',
  "CONTRACT_TYPES",
  "applyEmployeeAssignment",
  "selectedPositionCode",
  "selectedDepartmentId",
  "selectedSiteId",
  "membersWithoutHrRecord",
  "Aucun dossier collaborateur RH actif",
  "Aucun validateur indépendant",
]);
forbidTokens("components/enterprise/professional/enterprise-human-resources-workspace.tsx", [
  'contractType: String(data.get("contractType") || "EMPLOYEE")',
]);

requireTokens("components/enterprise/professional/enterprise-time-attendance-workspace.tsx", [
  "disabled={Boolean(busyAction)}",
  '"SCHEDULES"',
  '"ATTENDANCE"',
  "/work-schedules",
  "/work-schedules/${scheduleEndTarget.id}/end",
  "/attendance",
  "observedStartMinute",
  "observedEndMinute",
  "formatObservedTime",
  "site?.timezone",
  "item.canDecide",
  "item.canCancel",
  "/leave-requests/${cancelTarget.id}/cancel",
  "DEFAULT_REJECTION_AUDIT_COMMENT",
  "selectScheduleEmployee",
  "scheduleTimezone",
  "selectAttendanceEmployee",
  "attendanceSiteId",
  'useToastMessage(notice, "success")',
  "Aucun dossier collaborateur RH actif",
  "Aucun validateur indépendant",
]);
forbidTokens("components/enterprise/professional/enterprise-time-attendance-workspace.tsx", ["useToastMessage(message)"]);

requireTokens("components/enterprise/professional/enterprise-payroll-operations-workspace.tsx", [
  "disabled={Boolean(busyAction)}",
  "bonusReason_",
  "deductionReason_",
  "run.canDecide",
  "DEFAULT_PAYROLL_REJECTION_AUDIT_COMMENT",
  "DEFAULT_PAYROLL_APPROVAL_AUDIT_COMMENT",
  "FINANCE_PAYMENTS?payrollRunId=",
  'useToastMessage(notice, "success")',
  "Aucun dossier collaborateur RH actif",
  "Aucun validateur indépendant",
  "Aucune période de paie ouverte",
  "Chaque variable de paie non nulle exige un motif précis.",
]);
forbidTokens("components/enterprise/professional/enterprise-payroll-operations-workspace.tsx", ["useToastMessage(message)", 'value="Variable de paie"']);

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
]) requireTokens(path, ['action: "approve"']);

forbidTokens("app/api/enterprise/[organizationId]/employment-contracts/[contractId]/decision/route.ts", ['moduleCode: "HUMAN_RESOURCES", action: "manage"']);
forbidTokens("app/api/enterprise/[organizationId]/payroll-runs/[payrollRunId]/decision/route.ts", ['moduleCode: "PAYROLL_OPERATIONS", action: "manage"']);
forbidTokens("lib/enterprise/hr-payroll/payroll.ts", ["status: \"PAID\"", "financialTransaction.create", "ledger", "bankAccount"]);

success("enterprise HR, time/attendance and operational payroll boundaries #562/#564");