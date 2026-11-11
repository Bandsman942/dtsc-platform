import { Prisma } from "@prisma/client";
import { RETAIL_EXECUTIVE_METRICS, type RetailExecutiveMetric, type RetailExecutiveSummary } from "@/lib/enterprise/retail/executive-metrics";
type Amount = { currencyCode: string; total: string };
type OverviewSite = {
  id?: string;
  sales: Amount[]; collections: Amount[]; financeCollections: Amount[];
  financeInvoices: Array<{ currencyCode: string; issuedTotal: string; allocatedToDate: string }>;
  receivables: Array<{ currencyCode: string; total: string; overdue: string }>;
  approvedExpenses: Amount[];
  postedLedger: Array<{ currencyCode: string; revenue: string; costOfSales: string; grossMargin: string; operatingResult: string }>;
  mobileMoney: Array<{ currencyCode: string; transactionType: string; principal: string; commission: string; fees: string }>;
  telco: Array<{ currencyCode: string; total: string; operatorCost: string; margin: string }>;
  treasury: Array<{ currencyCode: string; total: string; reconciled: string; available: string | null }>;
};
type Unallocated = { mobileMoney: OverviewSite["mobileMoney"]; telco: OverviewSite["telco"]; treasury: OverviewSite["treasury"]; postedLedger?: OverviewSite["postedLedger"] };

function monetaryMap() {
  return Object.fromEntries(RETAIL_EXECUTIVE_METRICS.map((metric) => [metric, new Prisma.Decimal(0)])) as Record<RetailExecutiveMetric, Prisma.Decimal>;
}

/** Decimal summation at source precision, always partitioned by currency.
 * Operational payment channels and accrual P&L are deliberately NOT netted. */
export function summarizeRetailExecutive(sites: OverviewSite[], unallocated?: Unallocated): RetailExecutiveSummary[] {
  const totals = new Map<string, Record<RetailExecutiveMetric, Prisma.Decimal>>();
  const unavailable = new Map<string, Set<RetailExecutiveMetric>>();
  const markUnavailable = (currency: string, metric: RetailExecutiveMetric) => {
    const values = unavailable.get(currency) || new Set<RetailExecutiveMetric>();
    values.add(metric);
    unavailable.set(currency, values);
  };
  const add = (currency: string, metric: RetailExecutiveMetric, value: string) => {
    const row = totals.get(currency) || monetaryMap();
    row[metric] = row[metric].plus(value);
    totals.set(currency, row);
  };
  for (const site of sites) {
    for (const row of site.sales) add(row.currencyCode, "posSales", row.total);
    for (const row of site.collections) add(row.currencyCode, "posCollections", row.total);
    for (const row of site.financeCollections) add(row.currencyCode, "financeCollections", row.total);
    for (const row of site.financeInvoices) { add(row.currencyCode, "invoices", row.issuedTotal); add(row.currencyCode, "invoiceAllocated", row.allocatedToDate); }
    for (const row of site.receivables) { add(row.currencyCode, "outstanding", row.total); add(row.currencyCode, "overdue", row.overdue); }
    for (const row of site.approvedExpenses) add(row.currencyCode, "expenses", row.total);
    for (const row of site.postedLedger) { add(row.currencyCode, "postedRevenue", row.revenue); add(row.currencyCode, "postedCogs", row.costOfSales); add(row.currencyCode, "postedGrossMargin", row.grossMargin); add(row.currencyCode, "postedOperatingResult", row.operatingResult); }
    for (const row of site.mobileMoney) {
      if (row.transactionType === "DEPOSIT") add(row.currencyCode, "mobileMoneyDeposits", row.principal);
      if (row.transactionType === "WITHDRAWAL") add(row.currencyCode, "mobileMoneyWithdrawals", row.principal);
      add(row.currencyCode, "mobileMoneyCommission", row.commission);
      add(row.currencyCode, "mobileMoneyFees", row.fees);
    }
    for (const row of site.telco) { add(row.currencyCode, "telcoSales", row.total); add(row.currencyCode, "telcoCost", row.operatorCost); add(row.currencyCode, "telcoMargin", row.margin); }
    for (const row of site.treasury) {
      add(row.currencyCode, "treasuryBalance", row.total);
      add(row.currencyCode, "treasuryReconciled", row.reconciled);
      if (row.available === null) markUnavailable(row.currencyCode, "treasuryAvailable");
      else add(row.currencyCode, "treasuryAvailable", row.available);
    }
  }
  if (unallocated) {
    summarizeRetailExecutive([{ sales: [], collections: [], financeCollections: [], financeInvoices: [], receivables: [], approvedExpenses: [], postedLedger: [], ...unallocated }]).forEach((row) => {
      for (const metric of RETAIL_EXECUTIVE_METRICS) add(row.currencyCode, metric, row.values[metric]);
      for (const metric of row.unavailableMetrics || []) markUnavailable(row.currencyCode, metric);
    });
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, values]) => ({
    currencyCode,
    values: Object.fromEntries(RETAIL_EXECUTIVE_METRICS.map((metric) => [metric, values[metric].toFixed(6)])) as Record<RetailExecutiveMetric, string>,
    unavailableMetrics: [...(unavailable.get(currencyCode) || new Set<RetailExecutiveMetric>())].sort(),
  }));
}
