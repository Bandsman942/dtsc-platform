import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const daily = read("components/enterprise/professional/retail-daily-close-workspace.tsx");
const counts = read("components/enterprise/professional/retail-daily-close-cash-count.tsx");
const canonical = read("components/enterprise/professional/cash-physical-count-fields.tsx");
const retailPage = read("app/enterprise-modules/retail-page.tsx");
const shopPanel = read("components/enterprise/professional/retail-historical-import-panel.tsx");
const guard = read("lib/enterprise/retail/shop-history-availability.ts");
const historyPaths = [
  "app/api/enterprise/[organizationId]/retail/historical-imports/route.ts",
  "app/api/enterprise/[organizationId]/retail/historical-imports/preview/route.ts",
  "app/api/enterprise/[organizationId]/retail/historical-imports/[importId]/apply/route.ts",
];

for (const marker of [
  'density="compact"', "retail-close-submit", "retail-close-history",
  "RetailDailyCloseCashCount", "RetailDailyCloseNonCashCount",
  "cashCountsFromDailyCloseForm", 'type="search"', '"search", searchQuery',
  'name="businessDate"', 'setHistoryPage', 'dateFrom', 'dateTo',
  'exportCurrentPageCsv', 'useToastMessage(notice)', 'EnterpriseApproverSelect',
  'item.capabilities?.canApprove', 'item.capabilities?.canReject',
  'setSelectedAccountIds', 'selectedAccountIds.includes(account.id)',
]) {
  assert.ok(daily.includes(marker), `Missing Retail daily close Design 2.0 contract: ${marker}`);
}
assert.doesNotMatch(daily, /placeholder="50000x2,20000x3"/, "Unstructured denomination input must be retired");
assert.match(counts, /cashDenominationsForCurrency\(currencyCode\)/, "Count UI must reuse canonical denominations");
for (const marker of [
  "custom-denomination-", "custom-quantity-", "count-", "declaredBalance",
  "reasonRequired", 'type="number"', 'step="1"', "Number.isInteger(item.quantity)",
]) assert.ok(counts.includes(marker), `Count/reconciliation must retain ${marker}`);
assert.ok(canonical.includes("CDF:") && canonical.includes("USD:"), "Two currency denomination defaults required");
assert.match(retailPage, /showShopHistoricalImports\s*\?/, "Historical panel must be protected by canonical SHOP subtype");
assert.match(retailPage, /hasShopHistoricalImportAccess\(organizationId\)/, "Shop subtype must be resolved on the server");
assert.match(retailPage, /moduleCode === "RETAIL_DAILY_CLOSE" && showShopHistoricalImports/, "General RETAIL must not render SHOP panels");
assert.ok(guard.includes('getBusinessSubtypeSelection(organizationId)') && guard.includes('businessSubtypeCode === "SHOP"'), "Canonical selection is authoritative");
for (const path of historyPaths) {
  const source = read(path);
  const authCount = (source.match(/if \(!auth\.ok\) return auth\.response/g) || []).length;
  const shopCount = (source.match(/shopHistoricalImportDenial\(organizationId\)/g) || []).length;
  assert.equal(shopCount, authCount, `Each secured route handler must reject non-SHOP organizations: ${path}`);
}
assert.ok(shopPanel.includes('id="retail-shop-history-import"') && shopPanel.includes('id="retail-shop-history-records"'), "SHOP UI retains isolated, compact sections");
const api = read("app/api/enterprise/[organizationId]/retail/daily-close/route.ts");
assert.ok(api.includes("search, status, from, to") && api.includes('mode: "insensitive"') && api.includes("endOfDay"), "History filters must apply server-side");
assert.ok(api.includes("cashApproverById") && api.includes("auth.access.canManage"), "Independent approval must remain protected");
assert.ok(read("lib/enterprise/retail/service.ts").includes("RETAIL_CASH_COUNT_TOTAL_MISMATCH"), "Server cash-count reconciliation must remain authoritative");
assert.match(read("lib/enterprise/retail/service.ts"), /accountSiteIdentities\.size > 1/, "Every daily close must reject cross-store mixes even without staff-isolation mode");
console.log("RETAIL #1205 Design 2.0, cash count, SHOP scope, Finance/RBAC regressions: PASS");
