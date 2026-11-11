import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => fs.readFileSync(path, "utf8");
const load = (path) => {
  const source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  vm.runInNewContext(source.outputText, { module: mod, exports: mod.exports, require, Date });
  return mod.exports;
};

const service = read("lib/enterprise/retail/cogs-analysis.ts");
assert.match(service, /e\.status IN \('POSTED','REVERSED'\)/, "Only posted and reversed entries affect the GL KPI");
assert.match(service, /a\."accountSubtype" = 'COST_OF_SALES'/, "Use the canonical account subtype");
assert.match(service, /mapping\."mappingKey" = 'COST_OF_SALES'/, "Account mappings align with existing dashboard");
assert.match(service, /\(l\.debit - l\.credit\) AS amount/, "Expense sign is debit minus credit, including reversals");
assert.match(service, /e\."functionalCurrencyCode" AS "currencyCode"/, "Journal functional currencies remain separate");
assert.match(service, /WITH inventoryLinks AS \([\s\S]*COUNT\(\*\)::integer AS count/, "Accounting events must aggregate BEFORE joining to avoid duplicate COGS lines");
assert.match(service, /LEFT JOIN inventoryLinks linked ON linked\."journalEntryId" = e\.id/, "Journal link uses the pre-aggregated events and does not duplicate COGS lines");
assert.match(service, /evt\."eventType" = 'ISSUE' AND evt\.status = 'POSTED'/, "Only posted stock ISSUE valuation events provide evidence");
assert.match(service, /linked\.count > 1/, "Multiple valuation events per posting are not force-matched");
assert.match(service, /costLineCount\.count = 1/, "Multiple COGS lines per posting must not be mapped to one inventory event");
assert.match(service, /warehouse\."siteId" <> l\."siteId"/, "Wrong-store stock lineage is not accepted as traceable");
assert.match(service, /l\."inventoryItemId" <> linked\."inventoryItemId"/, "Wrong-item accounting links need review");
assert.match(service, /movement\.direction = 'OUT'/, "Only outgoing stock movements may explain a cost of sale");
assert.match(service, /movement\."sourceEntityType" IN \('EnterpriseRetailSale','EnterpriseSalesInvoice'\)/, "Coverage denominator is restricted to Retail sales/invoices");
assert.match(service, /WHERE movement\."organizationId" = \$\{organizationId\}/, "Coverage query is tenant scoped");
assert.match(service, /COUNT\(\*\)::bigint AS eligible/, "Coverage denominator is computed on the server");
assert.match(service, /MIN\(evt\."totalCost"\)/, "Inventory cost is only linked evidence, not summed to posted COGS");
assert.match(service, /new Prisma\.Decimal\(bucket\.posted\)\.plus\(amount\)/, "Totals preserve 6-decimal arithmetic, not floating point");
assert.match(service, /bucket\.comparablePosted\)\.minus\(bucket\.comparableStockValuation\)/, "Comparable GL minus inventory valuation is exposed as an independent variance");
assert.match(service, /LIMIT \$\{pageSize\} OFFSET/, "Details are bounded and server-paginated");
assert.match(service, /COUNT\(\*\)::bigint AS count FROM cogs/, "Total count is independent of the page");
assert.match(service, /\$\{includeInventory \? Prisma\.sql/, "Inventory identities are not returned when inventory is not authorized");

const api = read("app/api/enterprise/[organizationId]/retail/cogs-analysis/route.ts");
assert.match(api, /getEnterpriseCommonDomainAccess[\s\S]*RETAIL_POS/, "Retail read entitlement is required");
assert.match(api, /FINANCE_ACCOUNTING/, "Accounting read entitlement is required independently");
assert.match(api, /INVENTORY_LOGISTICS/, "Inventory data is separately authorized");
assert.match(api, /role: \{ in: ADMIN_ROLES \}/, "Only active enterprise owners/admins can access executive data");
assert.match(api, /organizationId, status: "ACTIVE", archivedAt: null/, "Site filter must resolve in tenant and be active");
assert.match(api, /\.max\(100\)/, "Page size is capped");
assert.match(api, /400 \* 86_400_000/, "Business date range is bounded");

const report = read("app/api/enterprise/[organizationId]/retail/cogs-analysis/report/route.ts");
assert.match(report, /isSameOriginRequest/, "Reports POST has CSRF origin protection");
assert.match(report, /getEnterpriseFinanceAccess[\s\S]*REPORTS/, "Reports submit is a separate entitlement");
assert.match(report, /getCogsAnalysis\(sourceRequest/, "Saved snapshot must reuse the authorized accounting source");
assert.match(report, /snapshotJson: \{ schema: "retail-cogs\/v1"/, "Reports snapshot is immutable and versioned");
assert.match(report, /writeAuditLog/, "Reports creation is audited");
assert.match(report, /resolveEnterpriseBusinessDate/, "Report reference uses company business date");
assert.match(report, /INVENTORY_LOGISTICS/, "A saved report containing inventory source identity requires inventory read at generation");
for (const path of [
  "app/api/enterprise/[organizationId]/reports/[id]/route.ts",
  "app/api/enterprise/[organizationId]/reports/[id]/export/route.ts",
  "app/api/enterprise/[organizationId]/reports/[id]/actions/route.ts",
]) {
  assert.match(read(path), /reportType === "RETAIL_COGS_RECONCILIATION"/, `${path}: sensitive COGS report type must be checked`);
  assert.match(read(path), /FINANCE_ACCOUNTING/, `${path}: report access requires independent accounting permission`);
  assert.match(read(path), /INVENTORY_LOGISTICS/, `${path}: report access requires independent inventory permission`);
}
assert.match(read("app/api/enterprise/[organizationId]/reports/route.ts"), /reportType: \{ not: "RETAIL_COGS_RECONCILIATION" \}/, "Reports list also hides sensitive COGS reports from unentitled readers");

const dashboard = read("components/enterprise/professional/retail-site-overview.tsx");
const drill = read("components/enterprise/professional/retail-cogs-workspace.tsx");
assert.match(dashboard, /postedCogs", "postedGrossMargin"/, "Posted COGS is visible among the director KPIs");
assert.match(dashboard, /setCogsOpen\(true\)/, "The COGS KPI and per-store block open the drilldown");
assert.match(drill, /data-testid="retail-cogs-drilldown"/, "The drilldown renders as an expanded full workspace");
assert.match(drill, /setPage\(\(value\) => value \+ 1\)/, "Pages are interactive");
assert.match(drill, /setSelectedDay\(/, "Accounting-day chart is interactive");
assert.match(drill, /downloadProfessionalCsv/, "CSV export is enabled");
assert.match(drill, /downloadProfessionalXlsx/, "Excel export is enabled");
assert.match(drill, /downloadProfessionalPdfV2/, "Premium PDF export is enabled");
assert.match(drill, /N\/A, not 100%/, "Coverage must not falsely show 100% for empty denominator");
assert.match(drill, /inventoryAllowed/, "Stock details must honor independent inventory module permission");
assert.match(drill, /\bRetour au pilotage\b/, "French navigation is contextual");
assert.match(drill, /Back to dashboard/, "English navigation is contextual");

const exporter = load("lib/enterprise/retail/cogs-export.ts");
const fixture = {
  buckets: [{ siteId: "GOMBE", siteName: "BCN-GOMBE", currencyCode: "CDF", posted: "120.000000", traceable: "100.000000", untraced: "30.000000", ambiguous: "-10.000000", lines: 3 },
    { siteId: null, siteName: null, currencyCode: "USD", posted: "5.000000", traceable: "0.000000", untraced: "5.000000", ambiguous: "0.000000", lines: 1 }],
  lines: [{ accountingDate: "2026-11-11T10:00:00.000Z", siteName: "BCN-GOMBE", currencyCode: "CDF", amount: "-10.000000", journalNumber: "JV-010", accountCode: "COS", status: "AMBIGUOUS", reversal: true, inventoryItemName: null, sourceNumber: null, stockMovementId: null }],
  totalLines: 4, page: 2, pageSize: 1, daily: [], coverage: [], definitions: {},
};
const result = exporter.buildRetailCogsExport({ analysis: fixture, locale: "fr", organizationName: "SHOP BCN MULTI TEST", from: "2026-11-01", to: "2026-11-11" });
assert.equal(result.rows.length, 1, "No false claim to export all GL detail beyond the current page");
assert.equal(result.rows[0].amount, "-10.000000", "Signed reversals retain exact decimal strings");
assert.equal(result.rows[0].currency, "CDF", "Currency must survive to exports");
assert.equal(result.organizationName, "SHOP BCN MULTI TEST", "Company premium header is preserved");
assert.equal(result.columns.length, 5, "PDF columns remain readable");
assert(result.insights.some((item) => item.body.includes("120.000000 = 100.000000 + 30.000000 + -10.000000")), "Reconciliation is shown without altering signs");
assert(result.insights.some((item) => item.body.includes("1 des 4")), "The report must disclose page/total truncation");
assert.equal(JSON.parse(read("locales/enterprise-procurement.fr.json"))["reports.type.RETAIL_COGS_RECONCILIATION"].includes("Coût"), true);
assert.equal(JSON.parse(read("locales/enterprise-procurement.en.json"))["reports.type.RETAIL_COGS_RECONCILIATION"].includes("cost"), true);
assert.match(read("lib/reporting/enterprise-professional-report.ts"), /schema === "retail-cogs\/v1"/, "Saved reports must export using exactly the same model");

// Execute the aggregation and pagination logic with a deterministic Prisma
// read fixture. SQL joins still require the integration/E2E database phase.
const { Prisma } = require("@prisma/client");
const queries = [];
const sqlFixture = [
  [
    { siteId: "GOMBE", siteName: "BCN-GOMBE", currencyCode: "CDF", status: "TRACEABLE", amount: new Prisma.Decimal("100.100000"), count: 1n, comparedPosted: new Prisma.Decimal("100.100000"), comparedStock: new Prisma.Decimal("99.000000"), comparedCount: 1n },
    { siteId: "GOMBE", siteName: "BCN-GOMBE", currencyCode: "CDF", status: "UNMATCHED", amount: new Prisma.Decimal("-10.000000"), count: 1n, comparedPosted: new Prisma.Decimal(0), comparedStock: new Prisma.Decimal(0), comparedCount: 0n },
    { siteId: null, siteName: null, currencyCode: "USD", status: "AMBIGUOUS", amount: new Prisma.Decimal("8.000000"), count: 1n, comparedPosted: new Prisma.Decimal(0), comparedStock: new Prisma.Decimal(0), comparedCount: 0n },
  ],
  [{ day: "2026-11-11", currencyCode: "CDF", status: "TRACEABLE", amount: new Prisma.Decimal("100.100000") }],
  [{ siteId: "GOMBE", eligible: 2n, valued: 1n }],
  [{ count: 3n }],
  [{ id: "line-1", journalEntryId: "journal-1", journalNumber: "JV-1", accountingDate: new Date("2026-11-11T08:00:00Z"), siteId: "GOMBE", siteName: "BCN-GOMBE", currencyCode: "CDF", accountCode: "COS", accountName: "Coût", description: null, amount: new Prisma.Decimal("100.100000"), linkStatus: "TRACEABLE", reversal: false, inventoryItemId: "inv-1", inventoryItemName: "Chargeur 20 W", stockMovementId: "mov-1", quantity: new Prisma.Decimal("1.000000"), valuationCost: new Prisma.Decimal("99.000000"), valuationCurrency: "CDF", sourceType: "EnterpriseRetailSale", sourceId: "sale-1", sourceNumber: "POS-1" }],
];
const mock = { $queryRaw: (statement) => { queries.push(statement); return Promise.resolve(sqlFixture[queries.length - 1]); } };
const serviceModule = (() => {
  const compiled = ts.transpileModule(service, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  vm.runInNewContext(compiled.outputText, { module: mod, exports: mod.exports, require: (id) => id === "@/lib/prisma" ? { prisma: mock } : require(id), Date });
  return mod.exports;
})();
const readModel = await serviceModule.readRetailCogsAnalysis({ organizationId: "org-1", from: new Date("2026-11-01"), to: new Date("2026-11-12"), timezone: "Africa/Kinshasa", includeInventory: true, page: 1, pageSize: 1 });
assert.equal(readModel.totalLines, 3, "Page count includes all matching lines");
assert.equal(readModel.lines.length, 1, "The requested detail page stays bounded");
assert.equal(readModel.lines[0].sourceNumber, "POS-1", "The sale reference is preserved through the trace");
assert.equal(readModel.buckets.find((entry) => entry.currencyCode === "CDF").posted, "90.100000", "Signed GL balances are grouped exactly");
assert.equal(readModel.buckets.find((entry) => entry.currencyCode === "CDF").comparableVariance, "1.100000", "Independent stock valuation discrepancy is calculated only on 1:1 comparable entries");
assert.equal(readModel.buckets.find((entry) => entry.currencyCode === "USD").posted, "8.000000", "USD never contaminates CDF");
assert.equal(readModel.coverage[0].eligibleMovements, 2);
assert.equal(readModel.coverage[0].valuedMovements, 1);
assert(queries[0].sql.includes('WITH inventoryLinks AS'), "The SQL query preaggregates inventory events once for the GL scope");
assert(queries[0].values.includes("org-1"), "Every reconciliation query is parameterized by tenant");

// Browser CI must never silently drop tests when hosted runner APT is broken.
for (const path of [
  ".github/workflows/hotfix-657-erp-navigation-workspaces.yml",
  ".github/workflows/shop2-behavioral.yml",
  ".github/workflows/hotfix-659-cash-guides-business-presentation.yml",
  ".github/workflows/hotfix-662-cash-orphan-approval-recovery.yml",
]) {
  const workflow = read(path);
  assert.match(workflow, /runs-on: ubuntu-24\.04/, `${path}: browser CI uses a supported pinned Ubuntu runner`);
  assert.match(workflow, /run: pnpm exec playwright install chromium/, `${path}: browser install must not depend on APT DNS`);
  assert.match(workflow, /run: \|[\s\S]*pnpm exec playwright test/, `${path}: the actual E2E suite remains enabled`);
}

console.log("RETAIL #1109 COGS posted GL traceability, rights, 6-decimal signed reconciliation, FX separation, PDF/Excel/CSV and Reports integration: OK");
