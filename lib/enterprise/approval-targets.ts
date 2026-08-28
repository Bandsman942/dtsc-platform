export const ENTERPRISE_APPROVAL_MODULE_BY_TARGET: Readonly<Record<string, string>> = {
  EnterpriseAccountTransfer: "FINANCE_TREASURY",
  EnterpriseJournalEntry: "FINANCE_ACCOUNTING",
  EnterprisePayment: "FINANCE_PAYMENTS",
  EnterpriseSalesInvoice: "FINANCE_RECEIVABLES",
  EnterpriseSupplierInvoiceReview: "FINANCE_PAYABLES",
  EnterpriseSupplierInvoiceApproval: "FINANCE_PAYABLES",
  EnterpriseFinancialClose: "FINANCE_CLOSE",
  EnterpriseCashSession: "FINANCE_CASH",
  EnterpriseReconciliationSession: "FINANCE_RECONCILIATION",
  EnterpriseOpeningBalanceApproval: "FINANCE_ACCOUNTING",
  EnterpriseSalesCreditNoteApproval: "FINANCE_RECEIVABLES",
  EnterpriseSupplierCreditNoteApproval: "FINANCE_PAYABLES",
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
  if (targetEntityType === "EnterpriseJournalEntry") return `/enterprise-modules/FINANCE_ACCOUNTING?tab=entries&entry=${id}`;
  if (targetEntityType === "EnterprisePayment") return `/enterprise-modules/FINANCE_PAYMENTS?payment=${id}`;
  if (targetEntityType === "EnterpriseSalesInvoice") return `/enterprise-modules/FINANCE_RECEIVABLES?invoice=${id}`;
  if (targetEntityType === "EnterpriseSupplierInvoiceReview" || targetEntityType === "EnterpriseSupplierInvoiceApproval") return `/enterprise-modules/FINANCE_PAYABLES?invoice=${id}`;
  if (targetEntityType === "EnterpriseFinancialClose") return `/enterprise-modules/FINANCE_CLOSE?close=${id}`;
  if (targetEntityType === "EnterpriseCashSession") return `/enterprise-modules/FINANCE_CASH?session=${id}`;
  if (targetEntityType === "EnterpriseReconciliationSession") return `/enterprise-modules/FINANCE_RECONCILIATION?session=${id}`;
  if (targetEntityType === "EnterpriseOpeningBalanceApproval") return `/enterprise-modules/FINANCE_ACCOUNTING?tab=setup&openingBalance=${id}`;
  if (targetEntityType === "EnterpriseSalesCreditNoteApproval") return `/enterprise-modules/FINANCE_RECEIVABLES?creditNote=${id}`;
  if (targetEntityType === "EnterpriseSupplierCreditNoteApproval") return `/enterprise-modules/FINANCE_PAYABLES?creditNote=${id}`;
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