export const ENTERPRISE_APPROVAL_MODULE_BY_TARGET: Readonly<Record<string, string>> = {
  EnterpriseAccountTransfer: "FINANCE_TREASURY",
  EnterpriseRequest: "INTERNAL_REQUESTS",
  EnterpriseTask: "TASKS_OPERATIONS",
  EnterpriseMeeting: "MEETINGS",
  EnterprisePurchase: "SUPPLIERS_PURCHASES",
  EnterpriseBudget: "FINANCE_BUDGETS",
  EnterpriseExpense: "FINANCE_BUDGETS",
  PharmacyQualityIncident: "QUALITY_PHARMACOVIGILANCE",
  EnterpriseLeaveRequest: "TIME_ATTENDANCE",
  EnterpriseEmploymentContract: "HUMAN_RESOURCES",
  EnterpriseTimesheet: "TIME_ATTENDANCE",
  EnterprisePayrollRun: "PAYROLL_OPERATIONS",
};

export function enterpriseApprovalModuleForTarget(targetEntityType: string) {
  return ENTERPRISE_APPROVAL_MODULE_BY_TARGET[targetEntityType] || null;
}

export function enterpriseApprovalTargetDeepLink(targetEntityType: string, targetEntityId: string, approvalId?: string | null) {
  const id = encodeURIComponent(targetEntityId);
  if (targetEntityType === "EnterpriseAccountTransfer") return `/enterprise-modules/FINANCE_TREASURY?transfer=${id}`;
  if (targetEntityType === "EnterpriseRequest") return `/enterprise-modules/INTERNAL_REQUESTS?request=${id}`;
  if (targetEntityType === "EnterpriseTask") return `/enterprise-modules/TASKS_OPERATIONS?task=${id}`;
  if (targetEntityType === "EnterpriseMeeting") return `/enterprise-modules/MEETINGS?meeting=${id}`;
  if (targetEntityType === "EnterprisePurchase") return `/enterprise-modules/SUPPLIERS_PURCHASES?purchase=${id}`;
  if (targetEntityType === "EnterpriseBudget") return `/enterprise-modules/FINANCE_BUDGETS?budget=${id}`;
  if (targetEntityType === "EnterpriseExpense") return `/enterprise-modules/FINANCE_BUDGETS?expense=${id}`;
  if (targetEntityType === "PharmacyQualityIncident") return `/enterprise-modules/QUALITY_PHARMACOVIGILANCE?incident=${id}`;
  if (targetEntityType === "EnterpriseLeaveRequest") return `/enterprise-modules/TIME_ATTENDANCE?leave=${id}`;
  if (targetEntityType === "EnterpriseEmploymentContract") return `/enterprise-modules/HUMAN_RESOURCES?contract=${id}`;
  if (targetEntityType === "EnterpriseTimesheet") return `/enterprise-modules/TIME_ATTENDANCE?timesheet=${id}`;
  if (targetEntityType === "EnterprisePayrollRun") return `/enterprise-modules/PAYROLL_OPERATIONS?payroll=${id}`;
  return `/enterprise-modules/VALIDATIONS${approvalId ? `?approval=${encodeURIComponent(approvalId)}` : ""}`;
}
