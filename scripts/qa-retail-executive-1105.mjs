import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const load = (path, aliases = {}) => {
  const compiled = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, { module, exports: module.exports, require: (id) => aliases[id] || require(id), Date });
  return module.exports;
};
const read = (path) => fs.readFileSync(path, "utf8");
const metrics = load("lib/enterprise/retail/executive-metrics.ts");
const prefs = load("lib/enterprise/retail/dashboard-preferences.ts");
const previousPrefs = prefs.readRetailDashboardPreferences({ executiveDashboard: { defaultDays: 7, defaultMetric: "financeCollections", warnOutstandingAbove: 100000, warnStockDays: 30, showLegacyPos: true } });
assert.deepEqual(Object.keys(previousPrefs.warnOutstandingByCurrency), [], "Saved preferences from before currency-specific thresholds must remain readable");
assert.equal(prefs.retailDashboardPreferencesSchema.safeParse({ ...previousPrefs, warnOutstandingByCurrency: { CDF: 250000, USD: 100 } }).success, true, "Administrator can set independent currency-native debt thresholds");
assert.equal(prefs.retailDashboardPreferencesSchema.safeParse({ ...previousPrefs, warnOutstandingByCurrency: { CDF: -10 } }).success, false, "Negative debt warning thresholds must be rejected");
const execSummary = load("lib/enterprise/retail/executive-summary.ts", { "@/lib/enterprise/retail/executive-metrics": metrics });
const exporter = load("lib/enterprise/retail/site-financial-export.ts", { "@/lib/enterprise/retail/executive-metrics": metrics });
const base = () => ({ sales: [], collections: [], financeCollections: [], financeInvoices: [], receivables: [], approvedExpenses: [], postedLedger: [], mobileMoney: [], telco: [], treasury: [] });
const gombe = {
  ...base(), id: "GOMBE",
  sales: [{ currencyCode: "CDF", total: "10.000000" }],
  collections: [{ currencyCode: "CDF", total: "10.000000" }],
  financeCollections: [{ currencyCode: "CDF", total: "139000.123456" }],
  financeInvoices: [{ currencyCode: "CDF", issuedTotal: "234000.000001", allocatedToDate: "139000.123456" }],
  receivables: [{ currencyCode: "CDF", total: "94999.876545", overdue: "500.000000" }],
  approvedExpenses: [{ currencyCode: "CDF", total: "27000.456789" }],
  postedLedger: [{ currencyCode: "CDF", revenue: "200.100000", costOfSales: "120.010000", grossMargin: "80.090000", operatingResult: "52.080000" }],
  mobileMoney: [{ currencyCode: "CDF", transactionType: "DEPOSIT", principal: "700000.123456", commission: "250.000001", fees: "10.050000" }],
  telco: [{ currencyCode: "CDF", total: "24000.000000", operatorCost: "23000.000000", margin: "1000.000000" }],
  treasury: [{ currencyCode: "CDF", total: "95000.000000", reconciled: "90000.000000", available: "94000.000000" }],
};
const limete = {
  ...base(), id: "LIMETE",
  financeCollections: [{ currencyCode: "CDF", total: "0.000001" }],
  mobileMoney: [{ currencyCode: "USD", transactionType: "WITHDRAWAL", principal: "40.000000", commission: "0.400000", fees: "0.010000" }],
  treasury: [{ currencyCode: "USD", total: "70.000000", reconciled: "50.000000", available: "65.000000" }],
};
const unallocated = {
  mobileMoney: [{ currencyCode: "CDF", transactionType: "DEPOSIT", principal: "1000.000000", commission: "5.000000", fees: "0.000000" }],
  telco: [], treasury: [],
  postedLedger: [{ currencyCode: "CDF", revenue: "7.000000", costOfSales: "2.000000", grossMargin: "5.000000", operatingResult: "4.000000" }],
};
const company = execSummary.summarizeRetailExecutive([gombe, limete], unallocated);
const cdf = company.find((entry) => entry.currencyCode === "CDF")?.values;
const usd = company.find((entry) => entry.currencyCode === "USD")?.values;
assert.equal(company.length, 2, "Each currency must be a separate company subtotal");
assert.equal(cdf.financeCollections, "139000.123457", "Decimal precision and both site receipts are retained");
assert.equal(cdf.invoices, "234000.000001", "Legacy POS tickets must not be added to Finance invoice issuance");
assert.equal(cdf.postedRevenue, "207.100000", "Unallocated posted GL must remain in company-level total");
assert.equal(cdf.postedGrossMargin, "85.090000");
assert.equal(cdf.mobileMoneyDeposits, "701000.123456", "Client principal is an agency throughput metric");
assert.equal(cdf.mobileMoneyCommission, "255.000001", "Provider commissions exclude customer fees");
assert.equal(cdf.mobileMoneyFees, "10.050000");
assert.equal(cdf.posSales, "10.000000", "Historical POS is a separate channel");
assert.equal(cdf.telcoMargin, "1000.000000", "Telco operator costs must not be treated as company profit");
assert.equal(cdf.treasuryAvailable, "94000.000000");
assert.equal(usd.mobileMoneyWithdrawals, "40.000000");
assert.equal(usd.financeCollections, "0.000000", "USD and CDF must never be netted");
const onlyStore = execSummary.summarizeRetailExecutive([gombe]);
assert.equal(onlyStore.find((entry) => entry.currencyCode === "CDF")?.values.postedRevenue, "200.100000", "Store scope must exclude company unallocated GL");
assert.equal(onlyStore.some((row) => row.currencyCode === "USD"), false, "Cross-store foreign currency must not appear");

const model = exporter.buildRetailExecutiveExport({
  locale: "fr", organizationName: "SHOP BCN MULTI TEST", from: "2026-11-01", to: "2026-11-10", siteFilter: "", currency: "",
  summaries: [{ site: "BCN-GOMBE", currencies: onlyStore }, { site: "BCN-LIMETE", currencies: execSummary.summarizeRetailExecutive([limete]) }],
  consolidated: company,
  unallocatedLedger: unallocated.postedLedger,
});
assert.match(model.title, /RETAIL/);
assert(model.insights.some((insight) => /ni d'un bénéfice certifié/.test(insight.body)), "Export must explicitly disclaim provisional accounting");
assert.equal(model.organizationName, "SHOP BCN MULTI TEST");
assert(model.columns.length <= 5, "Twenty-two indicators must render as readable PDF rows, not narrow adjacent columns");
assert.equal(model.rows.length, (company.length + onlyStore.length + execSummary.summarizeRetailExecutive([limete]).length) * metrics.RETAIL_EXECUTIVE_METRICS.length, "All indicators must be exported for company and every store/currency");
assert(model.rows.some((row) => String(row.currency) === "USD"), "Native USD rows must survive export");
assert(model.rows.some((row) => String(row.currency) === "CDF"), "Native CDF rows must survive export");
assert(model.rows.some((row) => String(row.scope).includes("GOMBE")), "Store report drilldown must survive export");
assert(model.rows.some((row) => String(row.scope).includes("LIMETE")), "All stores must survive export");

const dashboardRoute = read("app/api/enterprise/[organizationId]/retail/site-overview/route.ts");
assert.match(dashboardRoute, /retailPostedSiteLedger\(organizationId, from, to, ids, !siteId\)/, "Full posted ledger is only included at company level");
assert.match(dashboardRoute, /mobileMoney: siteId \? \[\] :/, "Filtered store must exclude unallocated agency movements");
assert.match(dashboardRoute, /sourceAvailability/, "Unsubscribed ERP data cannot be exposed silently");
assert.match(dashboardRoute, /outstandingAmount.*> 0/s, "Receivables must come from the Finance open-balance source");
assert.match(dashboardRoute, /\$\{today\}::date \+ \$\{preferences\.warnStockDays\}::integer/, "PostgreSQL date arithmetic must cast Prisma parameter to integer; bigint yields a runtime 500");
const sources = read("lib/enterprise/retail/executive-sources.ts");
assert.match(sources, /'mobileMoneyCommission'::text AS metric, SUM\(mm\."providerCommissionAmount"\)/, "Commission trend cannot include customer fees");
assert.match(sources, /'mobileMoneyFees'::text AS metric/, "Customer fees require their own trend");
assert.match(sources, /WHERE mm\."organizationId" = \$\{organizationId\} AND mm.status = 'CONFIRMED'/, "Only confirmed agency operations are included");
const catalogue = read("components/enterprise/professional/enterprise-catalog-workspace.tsx");
assert.doesNotMatch(catalogue, /Stock, lots et péremptions/, "The stock governance form must no longer live in product catalog");
assert.match(catalogue, /trackInventory/, "Catalog must keep only product stockability metadata");
const stock = read("components/enterprise/professional/inventory-stock-governance.tsx");
assert.match(stock, /itemPages/, "Stock rules must paginate beyond the first 50 items");
assert.match(stock, /inventory\/lots/, "The ERP stock module owns batch creation and expiry");
const lots = read("app/api/enterprise/[organizationId]/inventory/lots/route.ts");
assert.match(lots, /warehouse: \{ siteId: \{ in: scope\.siteIds \} \}/, "Store isolation must combine with warehouse filtering");
assert.match(lots, /INVENTORY_LOT_TRACKING_REQUIRED/, "No batch may be created when tracking is disabled");
assert.match(lots, /Lot enregistré sans quantité/, "Batch master data must never fabricate on-hand quantity");
const policy = read("app/api/enterprise/[organizationId]/inventory/item-policy/route.ts");
assert.match(policy, /HAS_LOTS/, "Existing batch traceability cannot be switched off by a policy edit");
const report = read("app/api/enterprise/[organizationId]/retail/site-overview/report/route.ts");
assert.match(report, /snapshotJson/);
assert.match(report, /getEnterpriseFinanceAccess.*REPORTS/, "Saving a shared report requires independent Reports entitlement");
assert.match(report, /resolveEnterpriseBusinessDate\(tx, organizationId\)/, "Report reference must follow the enterprise business calendar, not naive UTC");
assert.match(read("lib/reporting/enterprise-professional-report.ts"), /retail-executive\/v1/, "Reports module must reuse the executive export model");
console.log("RETAIL #1105 dashboard monetary precision, multi-store isolation, reports integration, batch governance, tenant and RBAC contracts: OK");
