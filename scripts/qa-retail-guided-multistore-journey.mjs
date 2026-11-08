import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const projection = read("lib/enterprise/retail/multi-store-onboarding.ts");
const activation = read("lib/enterprise/retail/feature-activation.ts");
const setup = read("components/enterprise/professional/retail-guided-store-setup.tsx");
const stores = read("components/enterprise/professional/retail-multi-store-onboarding.tsx");
const closeUI = read("components/enterprise/professional/retail-daily-close-workspace.tsx");
const closeRoute = read("app/api/enterprise/[organizationId]/retail/daily-close/route.ts");
const summaryRoute = read("app/api/enterprise/[organizationId]/retail/daily-close/summary/route.ts");
const retailPage = read("app/enterprise-modules/retail-page.tsx");

for (const endpoint of ['"sites"', '"warehouses"', '"financial-accounts"']) {
  assert.ok(setup.includes(endpoint), `Guided onboarding must call canonical ${endpoint} API`);
}
assert.match(setup, /router\.refresh\(\)/, "Server-projected progress must refresh after a mutation");
assert.match(setup, /FinanceReferenceSelect/, "Cash ledger account must come from authorized finance lookups");
assert.match(setup, /section=activation/, "Activation must remain on MFA-protected route");
assert.match(setup, /section=staff/, "Staff assignment must use canonical Retail ACL UI");
assert.match(projection, /getRetailAccountingReadiness/, "Operational readiness must reuse finance posting checks");
assert.match(activation, /siteType: "STORE"/, "Headquarters must not block store activation when stores exist");
assert.match(activation, /configuredStores\.length \? configuredStores/, "Legacy BRANCH-only tenants must keep their activation preflight");
assert.match(projection, /enterpriseInventoryBalance\.groupBy/, "Stock checks must reflect inventory balances");
assert.match(projection, /organizationId, userId, isActive: true/, "Employee stores must use active user-scoped assignments");
assert.match(stores, /data-retail-my-stores/, "Employee landing screen must be present");
assert.match(stores, /data-retail-store-operational-readiness/, "Per-store readiness must be present");
assert.match(closeUI, /data-retail-daily-close-store-summary/, "Daily close must expose a store-level view");
assert.match(closeUI, /siteId: effectiveSiteId/, "Every new close must identify one store");
assert.match(closeUI, /multipleStoreAccounts/, "The form must reject mixed-store close submissions");
assert.match(closeRoute, /retailFinanceReadSiteScope/, "Close history must enforce cashier site scope");
assert.match(closeRoute, /siteId.*closeScope/, "Close history filter must not broaden access");
assert.match(summaryRoute, /RETAIL_OWNER_ROLES/, "Full organization close summary must be owner/admin only");
assert.match(summaryRoute, /"organizationId" = \$\{organizationId\}/, "Close summary query must be tenant scoped");
assert.match(summaryRoute, /"dailyCloseId" = c\."id"/, "Variance counts must join canonical close lines");
assert.match(summaryRoute, /GROUP BY c\."siteId", c\."status"/, "Summary must group by store and approval status");
assert.match(summaryRoute, /enterpriseBusinessCalendarWindows\(anchor, timezone\)/, "Summary must use organization-local calendar-day boundaries, including DST");
assert.match(summaryRoute, /formatEnterpriseBusinessDate\(new Date\(\), timezone\)/, "Default close reporting day must honor organization timezone");
assert.match(retailPage, /defaultBusinessDate=\{formatEnterpriseBusinessDate\(new Date\(\), organization\.timezone/, "Close form must receive organization-local date from server");
assert.match(closeUI, /useState\(defaultBusinessDate\)/, "Client must not default to UTC instead of store business date");
assert.doesNotMatch(summaryRoute, /toISOString\(\)\.slice\(0, 10\)/, "No naive UTC date conversion in close summary");
assert.doesNotMatch(summaryRoute, /\b(POST|PATCH|PUT|DELETE)\b/, "Close summary should be read-only");
assert.match(retailPage, /adminStores=\{adminStores\}/, "Only admin-validated page provides organization store names");

console.log("PASS Retail guided multi-store journey: canonical creation, finance, employee ACL, store close, tenant isolation");
