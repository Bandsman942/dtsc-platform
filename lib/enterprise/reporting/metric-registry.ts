import type { Prisma } from "@prisma/client";
import { enterpriseMoney, enterpriseMoneyZero } from "@/lib/enterprise/finance/money";
import { ENTERPRISE_REPORT_TYPES } from "@/lib/enterprise/finance/constants";

export type EnterpriseMetricDefinition = {
  code: string;
  labelKey: string;
  descriptionKey: string;
  sourceCode: string;
  measureType: "SUM" | "RATIO" | "COUNT" | "BALANCE";
  unitType: "CURRENCY" | "PERCENT" | "COUNT";
  calculationPolicyCode: string;
  supportedDimensions: string[];
  supportedFilters: string[];
  requiredPermissions: string[];
  minimumPlan?: string | null;
  freshnessPolicyCode: string;
  deepLinkPolicyCode?: string | null;
};

export const ENTERPRISE_METRIC_DEFINITIONS: readonly EnterpriseMetricDefinition[] = [
  { code: "BUDGET_PLANNED", labelKey: "metrics.budgetPlanned.label", descriptionKey: "metrics.budgetPlanned.description", sourceCode: "ENTERPRISE_BUDGET_LINES", measureType: "SUM", unitType: "CURRENCY", calculationPolicyCode: "SUM_PLANNED_AMOUNT_V1", supportedDimensions: ["currency", "department", "category", "project", "period"], supportedFilters: ["budgetId", "currency", "departmentId", "category", "period"], requiredPermissions: ["enterprise.finance.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "BUDGET_LINE" },
  { code: "BUDGET_COMMITTED", labelKey: "metrics.budgetCommitted.label", descriptionKey: "metrics.budgetCommitted.description", sourceCode: "ENTERPRISE_BUDGET_COMMITMENTS", measureType: "BALANCE", unitType: "CURRENCY", calculationPolicyCode: "COMMITTED_MINUS_REALIZED_MINUS_RELEASED_V1", supportedDimensions: ["currency", "department", "category", "project", "period"], supportedFilters: ["budgetId", "currency", "departmentId", "category", "period"], requiredPermissions: ["enterprise.finance.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "BUDGET_COMMITMENT" },
  { code: "BUDGET_ACTUAL", labelKey: "metrics.budgetActual.label", descriptionKey: "metrics.budgetActual.description", sourceCode: "ENTERPRISE_APPROVED_EXPENSES", measureType: "SUM", unitType: "CURRENCY", calculationPolicyCode: "SUM_APPROVED_EXPENSES_V1", supportedDimensions: ["currency", "department", "category", "project", "period"], supportedFilters: ["budgetId", "currency", "departmentId", "category", "period"], requiredPermissions: ["enterprise.finance.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "EXPENSE" },
  { code: "BUDGET_AVAILABLE", labelKey: "metrics.budgetAvailable.label", descriptionKey: "metrics.budgetAvailable.description", sourceCode: "ENTERPRISE_BUDGET_POSITION", measureType: "BALANCE", unitType: "CURRENCY", calculationPolicyCode: "PLANNED_MINUS_COMMITTED_MINUS_ACTUAL_V1", supportedDimensions: ["currency", "department", "category", "project", "period"], supportedFilters: ["budgetId", "currency", "departmentId", "category", "period"], requiredPermissions: ["enterprise.finance.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "BUDGET_LINE" },
  { code: "BUDGET_VARIANCE", labelKey: "metrics.budgetVariance.label", descriptionKey: "metrics.budgetVariance.description", sourceCode: "ENTERPRISE_BUDGET_POSITION", measureType: "BALANCE", unitType: "CURRENCY", calculationPolicyCode: "PLANNED_MINUS_ACTUAL_V1", supportedDimensions: ["currency", "department", "category", "project", "period"], supportedFilters: ["budgetId", "currency", "departmentId", "category", "period"], requiredPermissions: ["enterprise.finance.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "BUDGET_LINE" },
  { code: "BUDGET_CONSUMPTION_RATE", labelKey: "metrics.budgetConsumptionRate.label", descriptionKey: "metrics.budgetConsumptionRate.description", sourceCode: "ENTERPRISE_BUDGET_POSITION", measureType: "RATIO", unitType: "PERCENT", calculationPolicyCode: "ACTUAL_DIVIDED_BY_PLANNED_V1", supportedDimensions: ["currency", "department", "category", "project", "period"], supportedFilters: ["budgetId", "currency", "departmentId", "category", "period"], requiredPermissions: ["enterprise.finance.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "BUDGET_LINE" },
  { code: "EXPENSE_TOTAL", labelKey: "metrics.expenseTotal.label", descriptionKey: "metrics.expenseTotal.description", sourceCode: "ENTERPRISE_APPROVED_EXPENSES", measureType: "SUM", unitType: "CURRENCY", calculationPolicyCode: "SUM_APPROVED_EXPENSES_V1", supportedDimensions: ["currency", "department", "category", "supplier", "period"], supportedFilters: ["currency", "departmentId", "category", "supplierId", "period"], requiredPermissions: ["enterprise.finance.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "EXPENSE" },
  { code: "PURCHASE_TOTAL", labelKey: "metrics.purchaseTotal.label", descriptionKey: "metrics.purchaseTotal.description", sourceCode: "ENTERPRISE_PURCHASES", measureType: "SUM", unitType: "CURRENCY", calculationPolicyCode: "SUM_PURCHASE_TOTAL_V1", supportedDimensions: ["currency", "department", "supplier", "status", "period"], supportedFilters: ["currency", "departmentId", "supplierId", "period"], requiredPermissions: ["enterprise.procurement.read"], freshnessPolicyCode: "REQUEST_TIME", deepLinkPolicyCode: "PURCHASE" },
] as const;

const REPORT_METRICS: Record<(typeof ENTERPRISE_REPORT_TYPES)[number], readonly string[]> = {
  BUDGET_VS_ACTUAL: ["BUDGET_PLANNED", "BUDGET_COMMITTED", "BUDGET_ACTUAL", "BUDGET_AVAILABLE", "BUDGET_VARIANCE", "BUDGET_CONSUMPTION_RATE"],
  EXPENSE_SUMMARY: ["EXPENSE_TOTAL"],
  PROCUREMENT_SUMMARY: ["PURCHASE_TOTAL"],
  FINANCE_OVERVIEW: ["BUDGET_PLANNED", "BUDGET_COMMITTED", "BUDGET_ACTUAL", "BUDGET_AVAILABLE", "EXPENSE_TOTAL", "PURCHASE_TOTAL"],
};

export const ENTERPRISE_REPORT_CATALOG = [
  { code: "BUDGET_VS_ACTUAL", titleKey: "reports.catalog.budgetVsActual.title", descriptionKey: "reports.catalog.budgetVsActual.description", family: "BUDGETS", domain: "FINANCE", sourcePolicyCode: "CANONICAL_BUDGET_AND_APPROVED_EXPENSES", supportedDimensions: ["currency", "department", "category", "project", "period"], supportedFilters: ["budgetId", "currency", "departmentId", "category", "period"], requiredPermissions: ["enterprise.finance.read"], minimumPlan: null, freshnessPolicyCode: "REQUEST_TIME", formatCodes: ["JSON", "CSV", "XLSX", "PDF"] },
  { code: "EXPENSE_SUMMARY", titleKey: "reports.catalog.expenseSummary.title", descriptionKey: "reports.catalog.expenseSummary.description", family: "FINANCE", domain: "FINANCE", sourcePolicyCode: "APPROVED_EXPENSES_ONLY", supportedDimensions: ["currency", "department", "category", "supplier", "period"], supportedFilters: ["currency", "departmentId", "category", "supplierId", "period"], requiredPermissions: ["enterprise.finance.read"], minimumPlan: null, freshnessPolicyCode: "REQUEST_TIME", formatCodes: ["JSON", "CSV", "XLSX", "PDF"] },
  { code: "PROCUREMENT_SUMMARY", titleKey: "reports.catalog.procurementSummary.title", descriptionKey: "reports.catalog.procurementSummary.description", family: "PURCHASES", domain: "PROCUREMENT", sourcePolicyCode: "CANONICAL_PURCHASES", supportedDimensions: ["currency", "department", "supplier", "status", "period"], supportedFilters: ["currency", "departmentId", "supplierId", "period"], requiredPermissions: ["enterprise.procurement.read"], minimumPlan: null, freshnessPolicyCode: "REQUEST_TIME", formatCodes: ["JSON", "CSV", "XLSX", "PDF"] },
  { code: "FINANCE_OVERVIEW", titleKey: "reports.catalog.financeOverview.title", descriptionKey: "reports.catalog.financeOverview.description", family: "DIRECTION", domain: "FINANCE", sourcePolicyCode: "CANONICAL_FINANCE_AGGREGATION", supportedDimensions: ["currency", "department", "period"], supportedFilters: ["currency", "departmentId", "period"], requiredPermissions: ["enterprise.reports.read"], minimumPlan: null, freshnessPolicyCode: "REQUEST_TIME", formatCodes: ["JSON", "CSV", "XLSX", "PDF"] },
] as const;

export function getMetricDefinition(code: string) {
  return ENTERPRISE_METRIC_DEFINITIONS.find((definition) => definition.code === code) || null;
}

export function getReportMetricCodes(reportType: (typeof ENTERPRISE_REPORT_TYPES)[number]) {
  return [...REPORT_METRICS[reportType]];
}

export function getReportCatalogEntry(reportType: (typeof ENTERPRISE_REPORT_TYPES)[number]) {
  return ENTERPRISE_REPORT_CATALOG.find((entry) => entry.code === reportType) || null;
}

export function calculateBudgetMetrics({ planned, committed, actual }: { planned: Prisma.Decimal.Value; committed: Prisma.Decimal.Value; actual: Prisma.Decimal.Value }) {
  const plannedValue = enterpriseMoney(planned);
  const committedValue = enterpriseMoney(committed);
  const actualValue = enterpriseMoney(actual);
  const available = plannedValue.sub(committedValue).sub(actualValue).toDecimalPlaces(2);
  const variance = plannedValue.sub(actualValue).toDecimalPlaces(2);
  const consumptionRate = plannedValue.gt(0) ? actualValue.div(plannedValue).mul(100).toDecimalPlaces(2) : enterpriseMoneyZero();
  return { planned: plannedValue, committed: committedValue, actual: actualValue, available, variance, consumptionRate };
}
