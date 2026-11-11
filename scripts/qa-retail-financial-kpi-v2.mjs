import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

/**
 * Static contract test for the first tranche of Retail KPI traceability v2.
 * Later lots must add database-level reconciliation and authenticated E2E.
 */
const metricsFile = readFileSync("lib/enterprise/retail/executive-metrics.ts", "utf8");
const definitions = readFileSync("lib/enterprise/retail/financial-metric-definitions.ts", "utf8");
const dashboard = readFileSync("components/enterprise/professional/retail-site-overview.tsx", "utf8");

const list = metricsFile.match(/RETAIL_EXECUTIVE_METRICS\s*=\s*\[([^\]]+)\]\s*as const/s);
assert.ok(list, "The canonical Retail executive metrics list must exist");
const keys = [...list[1].matchAll(/"([a-zA-Z]+)"/g)].map((match) => match[1]);
assert.equal(keys.length, 22, "Existing canonical metrics must remain represented");
assert.equal(new Set(keys).size, keys.length, "Metric identifiers must remain unique");

for (const key of keys) {
  const block = definitions.match(new RegExp(`\\b${key}: \\{([\\s\\S]*?)\\n  \\},`));
  assert.ok(block, `Interpretation missing for ${key}`);
  assert.match(block[1], /timeBasis: "(PERIOD_FLOW|CURRENT_BALANCE|ISSUANCE_PERIOD_CURRENT_ALLOCATION)"/);
  assert.match(block[1], /evidence: "[A-Z_]+"/);
  assert.match(block[1], /interpretation: \{ fr: ".+", en: ".+" \}/);
}
for (const current of ["outstanding", "overdue", "treasuryBalance", "treasuryReconciled", "treasuryAvailable"]) {
  assert.match(definitions, new RegExp(`\\b${current}: \\{\\s*timeBasis: "CURRENT_BALANCE"`));
}
assert.match(definitions, /invoiceAllocated:\s*\{\s*timeBasis: "ISSUANCE_PERIOD_CURRENT_ALLOCATION"/);
for (const period of ["financeCollections", "invoices", "postedRevenue", "postedCogs", "mobileMoneyCommission", "telcoMargin"]) {
  assert.match(definitions, new RegExp(`\\b${period}: \\{\\s*timeBasis: "PERIOD_FLOW"`));
}
assert.match(dashboard, /import \{ retailMetricTimeCaption \} from "@\/lib\/enterprise\/retail\/financial-metric-definitions"/);
assert.match(dashboard, /retailMetricTimeCaption\(metric, locale\)/);
assert.match(definitions, /Missing availability must not be inferred from operational balance/);

const sources = readFileSync("lib/enterprise/retail/executive-sources.ts", "utf8");
const summarySource = readFileSync("lib/enterprise/retail/executive-summary.ts", "utf8");
const exportSource = readFileSync("lib/enterprise/retail/site-financial-export.ts", "utf8");
assert.doesNotMatch(sources, /COALESCE\("availableBalance", "operationalBalance"\)/, "Never infer available cash from operational balance");
assert.match(sources, /COUNT\(\*\) FILTER \(WHERE "availableBalance" IS NULL\)/, "Every missing account availability must be detected");
assert.match(dashboard, /Non déterminé/, "Current balance without reliable evidence must not display as zero");
assert.match(exportSource, /NON DÉTERMINÉ/, "Exports must share the same unknown status as the dashboard");

const require = createRequire(import.meta.url);
const ts = require("typescript");
const loadTs = (source, aliases = {}) => {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: loaded, exports: loaded.exports, require: (id) => aliases[id] || require(id), Date,
  });
  return loaded.exports;
};
const metrics = loadTs(metricsFile);
const summary = loadTs(summarySource, { "@/lib/enterprise/retail/executive-metrics": metrics });
const base = () => ({ sales: [], collections: [], financeCollections: [], financeInvoices: [], receivables: [], approvedExpenses: [], postedLedger: [], mobileMoney: [], telco: [], treasury: [] });
const store = { ...base(), treasury: [
  { currencyCode: "CDF", total: "100", reconciled: "80", available: "60" },
  { currencyCode: "CDF", total: "20", reconciled: "10", available: null },
] };
const cdf = summary.summarizeRetailExecutive([store])[0];
assert.equal(cdf.values.treasuryBalance, "120.000000");
assert.ok(cdf.unavailableMetrics.includes("treasuryAvailable"), "Any missing financial account balance marks the currency unavailable");
assert.equal(cdf.values.treasuryAvailable, "60.000000", "Known partial amount is retained as evidence, not presented as an available total");
const known = summary.summarizeRetailExecutive([{ ...base(), treasury: [{ currencyCode: "CDF", total: "100", reconciled: "80", available: "60" }] }])[0];
assert.equal(known.unavailableMetrics.length, 0);
assert.equal(known.values.treasuryAvailable, "60.000000");
const company = summary.summarizeRetailExecutive([{ ...base(), treasury: [{ currencyCode: "CDF", total: "1", reconciled: "1", available: "1" }] }],
  { mobileMoney: [], telco: [], postedLedger: [], treasury: [{ currencyCode: "CDF", total: "20", reconciled: "10", available: null }] });
assert.ok(company[0].unavailableMetrics.includes("treasuryAvailable"), "Unallocated accounts must influence the company-wide availability status");


const traceService = readFileSync("lib/enterprise/retail/financial-drilldown.ts", "utf8");
const traceRoute = readFileSync("app/api/enterprise/[organizationId]/retail/financial-drilldown/route.ts", "utf8");
const traceView = readFileSync("components/enterprise/professional/retail-financial-drilldown.tsx", "utf8");
const overviewRoute = readFileSync("app/api/enterprise/[organizationId]/retail/site-overview/route.ts", "utf8");
const expectedTraces = [
  "financeCollections", "invoices", "outstanding", "overdue", "postedRevenue", "postedGrossMargin",
  "postedOperatingResult", "treasuryAvailable", "expenses", "mobileMoneyCommission", "telcoMargin", "posSales",
];
const traceList = traceService.match(/RETAIL_FINANCIAL_TRACES\s*=\s*\[([^\]]+)\] as const/s);
assert.ok(traceList, "All drill-down targets must be in an allow-list");
const traced = [...traceList[1].matchAll(/"([a-zA-Z]+)"/g)].map((match) => match[1]);
assert.deepEqual(traced, expectedTraces, "All 12 remaining highlighted KPI sources must be supported");
assert.match(traceRoute, /getEnterpriseCommonDomainAccess/, "Tenant RETAIL access must be checked");
assert.match(traceRoute, /organizationMember\.findFirst/, "Only active enterprise owner/admin can inspect finance traces");
assert.match(traceRoute, /requiredModules\(filter\.metric\)/, "Module entitlement must be rechecked for each KPI");
assert.match(traceRoute, /FINANCE_ACCOUNTING/, "GL traces need accounting permission");
assert.match(traceRoute, /FINANCE_RECEIVABLES/, "Invoices/receivables need Finance permission");
assert.match(traceRoute, /FINANCE_PAYMENTS/, "Confirmed collections need payment permission");
assert.match(traceRoute, /FINANCE_TREASURY/, "Account availability needs treasury permission");
assert.match(traceRoute, /FINANCE_BUDGETS/, "Expenses need budget permission");
assert.match(traceRoute, /id: filter\.siteId, organizationId/, "Archived site identifiers must be scoped to the tenant");
assert.match(traceService, /COUNT\(\*\) FILTER \(WHERE amount IS NULL\)/, "Uncertain balances must not be silently zeroed");
assert.match(traceService, /LIMIT \$\{pageSize\} OFFSET \$\{\(page - 1\) \* pageSize\}/, "Source rows must be paginated on the server");
assert.match(traceService, /"organizationId" = \$\{organizationId\}/, "Every source must be tenant-scoped");
assert.match(traceService, /allocation\."reversedAt" IS NULL/, "Reversed allocations are not receipts");
assert.match(traceService, /e\.status IN \('POSTED','REVERSED'\)/, "The P&L must use canonical posted and reversed entries");
assert.match(traceService, /"accountSubtype" = 'COST_OF_SALES'/, "Gross margin must exclude non-COGS expenses");
assert.match(traceService, /"availableBalance" AS amount/, "Treasury available is never approximated by operational balance");
assert.match(traceView, /buildEnterpriseObjectDeepLink/, "Source evidence must have permission-checked deep links");
assert.match(traceView, /data-testid="retail-financial-drilldown"/, "Responsive trace workspace must be mounted");
assert.match(dashboard, /<RetailFinancialDrilldown/, "The executive dashboard must open the detailed view");
assert.match(overviewRoute, /financeReceivablesAccess\.allowed/, "The client may not display an unauthorized Finance drilldown");
for (const file of [
  "lib/enterprise/retail/financial-drilldown.ts",
  "app/api/enterprise/[organizationId]/retail/financial-drilldown/route.ts",
  "components/enterprise/professional/retail-financial-drilldown.tsx",
  "components/enterprise/professional/retail-site-overview.tsx",
  "lib/enterprise/retail/financial-metric-definitions.ts",
]) {
  const sourceFile = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.equal(sourceFile.parseDiagnostics.length, 0,
    `TypeScript syntax errors in ${file}: ${sourceFile.parseDiagnostics.map((diag) => diag.messageText).join("; ")}`);
}

console.log(`Retail KPI definitions v2: ${keys.length} metrics, temporal badges and source interpretations validated.`);
