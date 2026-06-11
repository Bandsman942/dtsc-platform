export const ENTERPRISE_CORE_PERMISSIONS = {
  TASKS_OPERATIONS: ["enterprise.tasks.view", "enterprise.tasks.create", "enterprise.tasks.update", "enterprise.tasks.validate"],
  MEETINGS: ["enterprise.meetings.view", "enterprise.meetings.create", "enterprise.meetings.update", "enterprise.meetings.validate"],
  INTERNAL_REQUESTS: ["enterprise.requests.view", "enterprise.requests.create", "enterprise.requests.update", "enterprise.requests.validate"],
  VALIDATIONS: ["enterprise.validations.view", "enterprise.validations.decide"],
  DOCUMENTS: ["enterprise.documents.view", "enterprise.documents.create", "enterprise.documents.download"],
  REPORTS: ["enterprise.reports.view", "enterprise.reports.create", "enterprise.reports.export"],
  FINANCE_BUDGETS: ["enterprise.finance.view", "enterprise.finance.manage"],
  SUPPLIERS_PURCHASES: ["enterprise.suppliers.view", "enterprise.suppliers.manage", "enterprise.purchases.manage"],
  NOTIFICATIONS: ["enterprise.notifications.view", "enterprise.notifications.manage"],
} as const;

export function canEnterpriseRoleUseCoreAction(role: string, action: "read" | "submit" | "write" | "manage") {
  if (role === "OWNER" || role === "ADMIN_ENTREPRISE" || role === "ADMIN_ENTERPRISE") return true;
  if (role === "MANAGER") return action !== "manage";
  if (role === "GUEST") return action === "read";
  return action === "read" || action === "submit";
}
