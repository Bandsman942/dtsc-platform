import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const compile = (path, imports) => {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { module: { exports }, exports, require: (id) => imports[id] || require(id), Promise, Set }, { filename: path });
  return exports;
};

let config = { baseCurrencyCode: "CDF", settingsJson: { siteStaffIsolationEnabled: true, invoiceCheckoutEnabled: true } };
const sites = [
  { id: "shopA", name: "Boutique A", code: "A", siteType: "STORE" },
  { id: "shopB", name: "Boutique B", code: "B", siteType: "STORE" },
  { id: "shopC", name: "Boutique C", code: "C", siteType: "STORE" },
];
let assignments = [
  { siteId: "shopA", userId: "clerk", roleCode: "CASHIER", permissionsJson: null, site: sites[0] },
  { siteId: "shopA", userId: "invoiceClerk", roleCode: "INVOICER", permissionsJson: null, site: sites[0] },
  { siteId: "shopB", userId: "another", roleCode: "CASHIER", permissionsJson: null, site: sites[1] },
];
const db = {
  enterpriseSite: { findMany: async () => sites },
  enterpriseWarehouse: { findMany: async () => [{ id: "whA", siteId: "shopA" }, { id: "whB", siteId: "shopB" }] },
  enterpriseFinancialAccount: { findMany: async () => [{ id: "accA", siteId: "shopA", currencyCode: "CDF" }, { id: "accB", siteId: "shopB", currencyCode: "USD" }] },
  enterpriseInventoryBalance: { groupBy: async () => [{ warehouseId: "whA", _count: { _all: 2 } }] },
  enterpriseCashSession: { findMany: async () => [{ financialAccountId: "accA" }] },
  enterpriseCatalogItem: { count: async () => 2 },
  enterpriseRetailSiteAssignment: {
    findMany: async ({ where }) => where.userId ? assignments.filter((row) => row.userId === where.userId) : assignments,
  },
  enterpriseRetailConfiguration: { findUnique: async () => config },
};
const service = compile("lib/enterprise/retail/multi-store-onboarding.ts", {
  "@/lib/prisma": { prisma: db },
  "@/lib/enterprise/retail/accounting-readiness": { getRetailAccountingReadiness: async () => ({ ready: true, functionalCurrencyCode: "CDF" }) },
  "@/lib/enterprise/retail/site-access": {
    RETAIL_OWNER_ROLES: new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]),
    retailStaffIsolationIsEnabled: (settings) => settings?.siteStaffIsolationEnabled === true,
    siteStaffCapabilities: (role) => role === "CASHIER" ? ["VIEW_SALES", "COLLECT_PAYMENT"] : role === "INVOICER" ? ["VIEW_SALES", "PREPARE_INVOICE"] : [],
  },
});

const result = await service.getRetailMultiStoreOnboarding("tenant");
assert.equal(result.sites[0].ready, true, "Store A has stock, CDF cash, staff and isolation");
assert.equal(result.sites[0].operationalReady, true, "Operational check must include finance, catalogue, inventory and checkout");
assert.equal(result.sites[2].operationalReady, false, "An unconfigured store cannot be operational");
assert.equal(result.sites[1].ready, false, "USD cash account must not pass CDF requirement");
assert.equal(result.sites[2].ready, false, "Unconfigured store must remain incomplete");
assert.equal(result.sites[0].staffCount, 2);
const mine = await service.getRetailMyStores("tenant", "clerk", "MEMBER");
assert.deepEqual(mine.sites.map((site) => site.id), ["shopA"], "Employee must only see their shop");
assignments = assignments.filter((row) => row.userId !== "clerk");
const revoked = await service.getRetailMyStores("tenant", "clerk", "MEMBER");
assert.equal(revoked.sites.length, 0, "Revocation must remove the shop");
config = { baseCurrencyCode: "CDF", settingsJson: {} };
const legacy = await service.getRetailMyStores("tenant", "clerk", "MEMBER");
assert.equal(legacy.isolationEnabled, false, "Legacy fallback must be flagged as unisolated");
const owner = await service.getRetailMyStores("tenant", "boss", "OWNER");
assert.equal(owner.sites.length, 3, "Owner has enterprise overview");

const page = fs.readFileSync("app/enterprise-modules/retail-page.tsx", "utf8");
const navigation = fs.readFileSync("components/enterprise/professional/retail-pos-section-navigation.tsx", "utf8");
const checkout = fs.readFileSync("components/enterprise/professional/retail-pos-dtsc-workspace.tsx", "utf8");
assert.match(navigation, /"store-setup"[^\n]*adminOnly: true/);
assert.match(navigation, /"my-stores"/);
assert.match(page, /<RetailMyStores organizationId=\{organizationId\} userId=\{user.id\} role=\{membership.role\}/);
assert.match(checkout, /warehouses\.find\(\(warehouse\) => warehouse\.site\.id === preferredSiteId\)/,
  "Site switcher must choose only a warehouse from the server-scoped list");
console.log("PASS — per-store onboarding, assignment revocation, owner view and scoped POS navigation");
