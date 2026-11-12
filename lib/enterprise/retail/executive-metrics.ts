/** Browser-safe reporting contract. Values are exact decimal strings from
 * canonical ERP sources; currency is always a separate report dimension. */
export const RETAIL_EXECUTIVE_METRICS = ["posSales", "posCollections", "financeCollections", "invoices", "invoiceAllocated", "outstanding", "overdue", "expenses", "postedRevenue", "postedCogs", "postedGrossMargin", "postedOperatingResult", "mobileMoneyDeposits", "mobileMoneyWithdrawals", "mobileMoneyCommission", "mobileMoneyFees", "telcoSales", "telcoCost", "telcoMargin", "treasuryBalance", "treasuryReconciled", "treasuryAvailable"] as const;
export type RetailExecutiveMetric = typeof RETAIL_EXECUTIVE_METRICS[number];
/** Unknown means not safely measurable; never silently convert missing account availability into a numeric zero. */
export type RetailExecutiveSummary = {
  currencyCode: string;
  values: Record<RetailExecutiveMetric, string>;
  unavailableMetrics?: RetailExecutiveMetric[];
};
