export const ENTERPRISE_BUDGET_STATUSES = ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "REJECTED", "CLOSED", "CANCELLED"] as const;
export const ENTERPRISE_BUDGET_ACTIONS = ["SUBMIT", "REOPEN", "CLOSE", "CANCEL", "ARCHIVE"] as const;
export const ENTERPRISE_BUDGET_TRANSITIONS: Record<
  (typeof ENTERPRISE_BUDGET_ACTIONS)[number],
  { from: readonly (typeof ENTERPRISE_BUDGET_STATUSES)[number][]; to?: (typeof ENTERPRISE_BUDGET_STATUSES)[number] }
> = {
  SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL" },
  REOPEN: { from: ["REJECTED"], to: "DRAFT" },
  CLOSE: { from: ["ACTIVE"], to: "CLOSED" },
  CANCEL: { from: ["DRAFT"], to: "CANCELLED" },
  ARCHIVE: { from: ["DRAFT", "REJECTED", "CLOSED", "CANCELLED"] },
};

export const ENTERPRISE_EXPENSE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const ENTERPRISE_EXPENSE_ACTIONS = ["SUBMIT", "REOPEN", "CANCEL", "ARCHIVE"] as const;
export const ENTERPRISE_EXPENSE_TRANSITIONS: Record<
  (typeof ENTERPRISE_EXPENSE_ACTIONS)[number],
  { from: readonly (typeof ENTERPRISE_EXPENSE_STATUSES)[number][]; to?: (typeof ENTERPRISE_EXPENSE_STATUSES)[number] }
> = {
  SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL" },
  REOPEN: { from: ["REJECTED"], to: "DRAFT" },
  CANCEL: { from: ["DRAFT"], to: "CANCELLED" },
  ARCHIVE: { from: ["DRAFT", "REJECTED", "CANCELLED"] },
};

export const ENTERPRISE_COMMITMENT_STATUSES = ["ACTIVE", "REALIZED", "RELEASED"] as const;
export const ENTERPRISE_REPORT_TYPES = ["BUDGET_VS_ACTUAL", "EXPENSE_SUMMARY", "PROCUREMENT_SUMMARY", "FINANCE_OVERVIEW"] as const;
export const ENTERPRISE_REPORT_STATUSES = ["GENERATED", "PUBLISHED", "ARCHIVED"] as const;
export const ENTERPRISE_REPORT_ACTIONS = ["PUBLISH", "ARCHIVE"] as const;

export const SPRINT8_OPERATIONAL_ENTITY_TYPES = ["EnterpriseBudget", "EnterpriseExpense", "EnterpriseReport"] as const;
export const FINANCE_MODULE_CODE = "FINANCE_BUDGETS" as const;
export const REPORTS_MODULE_CODE = "REPORTS" as const;
