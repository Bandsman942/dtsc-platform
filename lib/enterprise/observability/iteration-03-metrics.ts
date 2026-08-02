export const ERP_ITERATION_03_METRICS = [
  "sales_quote_creation_failures",
  "sales_order_conversion_failures",
  "purchase_receipt_posting_failures",
  "inventory_negative_stock_attempts",
  "inventory_duplicate_movement_attempts",
  "leave_overlap_attempts",
  "timesheet_overlap_attempts",
  "payroll_duplicate_period_attempts",
  "payroll_approval_failures",
  "project_deliverable_transition_failures",
  "asset_assignment_conflicts",
  "company_relationship_navigation_hits",
  "company_relationship_pending_actions",
] as const;

export type ErpIteration03MetricName = (typeof ERP_ITERATION_03_METRICS)[number];

export type ErpIteration03MetricDimensions = {
  moduleCode?: string;
  operation?: string;
  outcome?: "SUCCESS" | "REJECTED" | "CONFLICT" | "FAILURE";
};

/**
 * Keep metric cardinality bounded. Never include user ids, organization ids,
 * document ids, free text, salaries, bank data, tokens, or raw error messages.
 */
export function buildErpIteration03MetricMetadata(
  metric: ErpIteration03MetricName,
  dimensions: ErpIteration03MetricDimensions = {},
) {
  return {
    metric,
    moduleCode: dimensions.moduleCode || null,
    operation: dimensions.operation || null,
    outcome: dimensions.outcome || null,
  } as const;
}
