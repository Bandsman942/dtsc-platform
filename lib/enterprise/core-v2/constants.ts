export const ENTERPRISE_CORE_V2_MODULES = {
  TASK: "TASKS_OPERATIONS",
  REQUEST: "INTERNAL_REQUESTS",
  APPROVAL: "VALIDATIONS",
  MEETING: "MEETINGS",
  DOCUMENT: "DOCUMENTS",
  PROCUREMENT: "SUPPLIERS_PURCHASES",
  FINANCE: "FINANCE_BUDGETS",
  REPORTS: "REPORTS",
} as const;

export const ENTERPRISE_CORE_V2_ENTITY_TYPES = {
  TASK: "EnterpriseTask",
  REQUEST: "EnterpriseRequest",
  APPROVAL: "EnterpriseApproval",
  MEETING: "EnterpriseMeeting",
  MEETING_DECISION: "EnterpriseMeetingDecision",
  DOCUMENT: "EnterpriseDocument",
  SUPPLIER: "EnterpriseSupplier",
  PURCHASE: "EnterprisePurchase",
  BUDGET: "EnterpriseBudget",
  BUDGET_LINE: "EnterpriseBudgetLine",
  EXPENSE: "EnterpriseExpense",
  REPORT: "EnterpriseReport",
} as const;

export const DEDICATED_CORE_RECORD_TYPES = new Set<string>(["TASK", "OPERATION", "MEETING", "MINUTES", "INTERNAL_REQUEST", "VALIDATION", "DOCUMENT", "SUPPLIER", "PURCHASE", "BUDGET", "EXPENSE", "REPORT"]);
export const DEDICATED_CORE_MODULE_CODES = new Set<string>(Object.values(ENTERPRISE_CORE_V2_MODULES));

export const TASK_TYPES = ["TASK", "OPERATION", "ACTION"] as const;
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] as const;
export const TASK_ACTIONS = ["START", "BLOCK", "RESUME", "COMPLETE", "CANCEL", "ARCHIVE"] as const;
export const TASK_TRANSITIONS: Record<(typeof TASK_ACTIONS)[number], { from: readonly (typeof TASK_STATUSES)[number][]; to?: (typeof TASK_STATUSES)[number] }> = {
  START: { from: ["TODO"], to: "IN_PROGRESS" },
  BLOCK: { from: ["IN_PROGRESS"], to: "BLOCKED" },
  RESUME: { from: ["BLOCKED"], to: "IN_PROGRESS" },
  COMPLETE: { from: ["IN_PROGRESS"], to: "DONE" },
  CANCEL: { from: ["TODO", "IN_PROGRESS", "BLOCKED"], to: "CANCELLED" },
  ARCHIVE: { from: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] },
};

export const REQUEST_STATUSES = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "FULFILLED", "CANCELLED"] as const;
export const REQUEST_ACTIONS = ["SUBMIT", "TAKE", "FULFILL", "CANCEL", "ARCHIVE"] as const;
export const REQUEST_TRANSITIONS: Record<(typeof REQUEST_ACTIONS)[number], { from: readonly (typeof REQUEST_STATUSES)[number][]; to?: (typeof REQUEST_STATUSES)[number] }> = {
  SUBMIT: { from: ["DRAFT"], to: "SUBMITTED" },
  TAKE: { from: ["SUBMITTED"], to: "IN_REVIEW" },
  FULFILL: { from: ["IN_REVIEW", "APPROVED"], to: "FULFILLED" },
  CANCEL: { from: ["DRAFT", "SUBMITTED", "IN_REVIEW"], to: "CANCELLED" },
  ARCHIVE: { from: ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "FULFILLED", "CANCELLED"] },
};

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const APPROVAL_ACTIONS = ["APPROVE", "REJECT", "CANCEL"] as const;
export const APPROVAL_TARGET_TYPES = ["EnterpriseRequest", "EnterpriseTask", "EnterpriseMeeting", "EnterprisePurchase", "EnterpriseBudget", "EnterpriseExpense", "PharmacyQualityIncident"] as const;

export const MEETING_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const MEETING_ACTIONS = ["START", "COMPLETE", "CANCEL", "ARCHIVE"] as const;
export const MEETING_TRANSITIONS: Record<(typeof MEETING_ACTIONS)[number], { from: readonly (typeof MEETING_STATUSES)[number][]; to?: (typeof MEETING_STATUSES)[number] }> = {
  START: { from: ["SCHEDULED"], to: "IN_PROGRESS" },
  COMPLETE: { from: ["IN_PROGRESS"], to: "COMPLETED" },
  CANCEL: { from: ["SCHEDULED", "IN_PROGRESS"], to: "CANCELLED" },
  ARCHIVE: { from: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] },
};

export const MEETING_LOCATION_MODES = ["ONLINE", "PHYSICAL", "HYBRID"] as const;
export const MEETING_PARTICIPANT_ROLES = ["PARTICIPANT", "OPTIONAL", "OBSERVER"] as const;
export const MEETING_RESPONSE_STATUSES = ["INVITED", "ACCEPTED", "DECLINED", "TENTATIVE"] as const;

export const SUPPORTED_SOURCE_ENTITY_TYPES = new Set<string>([
  "EnterpriseTask",
  "EnterpriseRequest",
  "EnterpriseMeeting",
  "EnterpriseMeetingDecision",
  "EnterpriseDocument",
  "EnterpriseSupplier",
  "EnterprisePurchase",
  "EnterpriseBudget",
  "EnterpriseBudgetLine",
  "EnterpriseExpense",
  "EnterpriseReport",
  "EnterpriseActivityRequest",
  "PharmacyActivityItem",
  "PharmacySupplier",
  "PharmacyPurchaseOrder",
  "PharmacyReceipt",
  "PharmacyQualityIncident",
  "HealthPatient",
  "HealthAppointment",
  "HealthConsultation",
  "HealthDocument",
  "HealthQualityIncident",
]);

export function isDedicatedCoreDomain(moduleCode: string, recordType?: string) {
  return DEDICATED_CORE_MODULE_CODES.has(moduleCode) || Boolean(recordType && DEDICATED_CORE_RECORD_TYPES.has(recordType));
}
