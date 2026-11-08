import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const compile = (path, imports) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports };
  vm.runInNewContext(code, {
    module, exports, require: (id) => imports[id] || require(id),
    Promise, Set, Map, Date,
  }, { filename: path });
  return module.exports;
};

const access = {
  member: { role: "MEMBER" },
  settings: { siteStaffIsolationEnabled: true },
  rows: [
    { siteId: "shopA", roleCode: "CASHIER", permissionsJson: null },
    { siteId: "shopB", roleCode: "INVOICER", permissionsJson: null },
  ],
};
const db = {
  organizationMember: { findFirst: async () => access.member },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: access.settings }) },
  enterpriseRetailSiteAssignment: { findMany: async () => access.rows },
};
class EnterpriseRetailError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
const policy = compile("lib/enterprise/retail/site-access.ts", {
  "@/lib/prisma": { prisma: db },
  "@/lib/enterprise/retail/errors": { EnterpriseRetailError },
});
const scope = await policy.retailPosDashboardSiteScope("tenant", "cashier");
assert.equal(scope.isolationEnabled, true);
assert.deepEqual([...scope.visibleSiteIds].sort(), ["shopA", "shopB"]);
assert.deepEqual([...scope.salesSiteIds].sort(), ["shopA", "shopB"]);
assert.deepEqual([...scope.collectionSiteIds], ["shopA"]);

const sale = (siteId, id) => ({ id, siteId });
const account = (siteId, id) => ({ id, siteId, operationalBalance: "999" });
const projections = {
  organization: {
    configuration: { status: "ACTIVE" }, providers: [],
    accounts: [account("shopA", "cashA"), account("shopB", "cashB"), account(null, "companyCash")],
    warehouses: [{ siteId: "shopA", id: "stockA" }, { siteId: "shopB", id: "stockB" }, { siteId: "shopC", id: "stockC" }],
    catalogItems: [], inventoryItems: [],
    canonicalReadiness: { items: [], completed: 0, total: 0, ready: true },
    mobileMoneyConfiguration: null, telcoConfiguration: null,
  },
  period: {
    sales: [sale("shopA", "saleA"), sale("shopB", "saleB"), sale("shopC", "saleC")],
    mobileMoney: [], topups: [], closes: [],
    metricsByCurrency: { sales: [{ currencyCode: "CDF", count: 30, amount: "3000" }] },
    fxReadiness: { complete: true }, accountingReadiness: { ready: true },
    range: { from: "2026-11-08T00:00:00.000Z", to: "2026-11-08T23:00:00.000Z" },
  },
  user: {
    cashSession: { id: "sessionB", status: "OPEN", financialAccount: { siteId: "shopB" } },
    cashSessions: [
      { id: "sessionA", status: "OPEN", financialAccount: { siteId: "shopA" } },
      { id: "sessionB", status: "OPEN", financialAccount: { siteId: "shopB" } },
    ],
  },
};
const metricCalls = [];
const service = compile("lib/enterprise/retail/commercial-dashboard.ts", {
  "@/lib/enterprise/retail/commercial-dashboard-projections": {
    getRetailDashboardOrganizationProjection: async () => ({ value: projections.organization, source: "CACHE" }),
    getRetailDashboardPeriodProjection: async () => ({ value: projections.period, source: "CACHE" }),
    getRetailDashboardUserProjection: async () => projections.user,
  },
  "@/lib/enterprise/retail/commercial-guardrails": {
    getRetailMetricsByCurrency: async (_org, _from, _to, _code, sites) => {
      metricCalls.push(sites);
      return { sales: [{ currencyCode: "CDF", count: sites.length, amount: "10" }] };
    },
  },
  "@/lib/enterprise/retail/site-access": { retailPosDashboardSiteScope: policy.retailPosDashboardSiteScope },
});

const staffDashboard = (await service.getCommercialRetailDashboardRead("tenant", "cashier", undefined, undefined, "RETAIL_POS")).dashboard;
assert.deepEqual(staffDashboard.warehouses.map((row) => row.id), ["stockA", "stockB"]);
assert.deepEqual(staffDashboard.accounts.map((row) => row.id), ["cashA"]);
assert.deepEqual(staffDashboard.recent.sales.map((row) => row.id), ["saleA", "saleB"]);
assert.deepEqual(staffDashboard.cashSessions.map((row) => row.id), ["sessionA"]);
assert.equal(staffDashboard.cashSession.id, "sessionA");
assert.equal(staffDashboard.metricsByCurrency.sales[0].amount, "10", "Must not expose the cached company-wide amount");
assert.deepEqual([...metricCalls[0]].sort(), ["shopA", "shopB"]);

// A revoked operator must see no cross-store data, including historic sessions.
access.rows = [];
const revoked = (await service.getCommercialRetailDashboardRead("tenant", "cashier", undefined, undefined, "RETAIL_POS")).dashboard;
assert.equal(revoked.warehouses.length, 0);
assert.equal(revoked.accounts.length, 0);
assert.equal(revoked.recent.sales.length, 0);
assert.equal(revoked.cashSessions.length, 0);
assert.equal(revoked.cashSession, null);
assert.deepEqual([...metricCalls[1]], []);

// Owners and legacy tenants keep their original company-wide dashboard.
access.member = { role: "OWNER" };
const owner = (await service.getCommercialRetailDashboardRead("tenant", "owner", undefined, undefined, "RETAIL_POS")).dashboard;
assert.equal(owner.warehouses.length, 3);
assert.equal(owner.accounts.length, 3);
assert.equal(owner.recent.sales.length, 3);
assert.equal(owner.metricsByCurrency.sales[0].amount, "3000");
access.member = { role: "MEMBER" };
access.settings = {};
const legacy = (await service.getCommercialRetailDashboardRead("tenant", "legacy", undefined, undefined, "RETAIL_POS")).dashboard;
assert.equal(legacy.recent.sales.length, 3);
assert.equal(legacy.accounts.length, 3);

// The server must not accidentally reintroduce an unscoped projection later.
const source = fs.readFileSync("lib/enterprise/retail/commercial-dashboard-projections.ts", "utf8");
assert.match(source, /siteId: true,[\s\S]*?movements:/);
console.log("PASS — isolated POS dashboard, revoked sessions, company cache, owner and legacy control");
