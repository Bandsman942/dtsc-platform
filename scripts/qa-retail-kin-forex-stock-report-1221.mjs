import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function loadModule(source, modules) {
  const output = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports: output.exports, URL, Intl, Date, Number, String, Math, Set, Array, Promise,
    require(name) { if (name in modules) return modules[name]; throw Error("Unexpected module " + name); },
  });
  return output.exports;
}
const dates = loadModule(read("lib/enterprise/retail/civil-date.ts"), {});
assert.equal(dates.isCivilDate("2026-11-23"), true);
assert.equal(dates.isCivilDate("2026-02-31"), false);
assert.equal(dates.civilMidnightUtc("2026-11-23", "Africa/Kinshasa").toISOString(), "2026-11-22T23:00:00.000Z");
assert.equal(dates.civilMidnightUtc("2026-11-24", "Africa/Kinshasa").toISOString(), "2026-11-23T23:00:00.000Z");

class Decimal {
  constructor(v) { this.n = Number(v || 0); }
  plus(v) { return new Decimal(this.n + Number(v instanceof Decimal ? v.n : v)); }
  minus(v) { return new Decimal(this.n - Number(v instanceof Decimal ? v.n : v)); }
  times(v) { return new Decimal(this.n * Number(v instanceof Decimal ? v.n : v)); }
  toFixed(n) { return this.n.toFixed(n); }
}
class NextResponse {
  constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.headers = init.headers || {}; }
  static json(body, init) { return new NextResponse(body, init); }
}
let authorized = ["store-a"];
let enabled = true;
let captured = [];
let logs = 0;
const products = [
  { id: "product-a", catalogItem: { code: "A-001", name: "Article A" } },
  { id: "product-b", catalogItem: { code: "B-001", name: "=SUM(1,1)" } },
];
const movementsBefore = [
  { inventoryItemId: "product-a", direction: "IN", _sum: { quantity: 20 } },
  { inventoryItemId: "product-b", direction: "IN", _sum: { quantity: 15 } },
];
const today = [
  { inventoryItemId: "product-a", direction: "IN", movementType: "RECEIPT", _sum: { quantity: 10 } },
  { inventoryItemId: "product-a", direction: "OUT", movementType: "SALE_FULFILLMENT", _sum: { quantity: 7 } },
  { inventoryItemId: "product-a", direction: "OUT", movementType: "ADJUSTMENT_OUT", _sum: { quantity: 2 } },
  { inventoryItemId: "product-b", direction: "IN", movementType: "RECEIPT", _sum: { quantity: 5 } },
  { inventoryItemId: "product-b", direction: "OUT", movementType: "SALE_FULFILLMENT", _sum: { quantity: 8 } },
];
const prisma = {
  enterpriseSite: { findFirst: async ({ where }) => where.organizationId === "tenant" && where.id === "store-a"
    ? { id: "store-a", code: "A", name: "Boutique A", timezone: "Africa/Kinshasa" } : null },
  organization: { findFirst: async () => ({ name: "KIN FOREX", timezone: "Africa/Kinshasa" }) },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: {} }) },
  enterpriseWarehouse: { findMany: async () => [{ id: "wh-a" }] },
  enterpriseInventoryItem: {
    count: async ({ where }) => { captured.push(where); return products.length; },
    findMany: async ({ where, skip, take }) => { captured.push(where); return products.slice(skip, skip + take); },
  },
  enterpriseStockMovement: { groupBy: async ({ where }) => {
    captured.push(where);
    return "lt" in where.occurredAt ? movementsBefore : today;
  } },
  enterpriseInventoryBalance: { findMany: async () => [{ inventoryItemId: "product-a", quantityReserved: 3 }] },
  enterpriseStockLot: { findMany: async () => [] },
};
class RetailError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
const api = loadModule(read("app/api/enterprise/[organizationId]/retail/daily-close/stock-report/route.ts"), {
  "@prisma/client": { Prisma: { Decimal } },
  exceljs: { default: class Workbook {} },
  "next/server": { NextResponse },
  "@/lib/audit": { writeApiLog: async () => { logs++; } },
  "@/lib/enterprise/retail/civil-date": dates,
  "@/lib/enterprise/retail/http": {
    authorizeRetailRequest: async () => ({ ok: true, session: { userId: "cashier" } }),
    retailErrorResponse: (error) => NextResponse.json({ error: error.code || "FAILED" }, { status: error.status || 500 }),
  },
  "@/lib/enterprise/retail/errors": { EnterpriseRetailError: RetailError },
  "@/lib/enterprise/organization-logo-storage": { resolveOrganizationLogoStoragePath: () => null },
  "@/lib/enterprise/retail/operating-settings": {
    readRetailLegalIdentity: () => ({ legalName: "KIN FOREX SARL", tradeName: "KIN FOREX",
      rccm: "RCCM-TEST", idNat: "IDNAT-TEST", nif: "NIF-TEST", address: "", phone: "", email: "", website: "" }),
    readRetailOperatingSettings: () => ({
    stockReportEnabled: enabled, stockReportIncludeZeroMovement: true,
    stockReportIncludeReserved: false, stockReportIncludeLots: false, stockReportIncludeExpiry: false,
  }) },
  "@/lib/enterprise/retail/site-access": {
    retailInventoryVisibleSites: async () => ({ isolationEnabled: true, isOwner: false, siteIds: authorized }),
  },
  "@/lib/prisma": { prisma },
});
const invoke = (params) => api.GET(
  { url: "https://app.dtsc-platform.com/api/enterprise/tenant/retail/daily-close/stock-report?" + params },
  { params: Promise.resolve({ organizationId: "tenant" }) },
);
let response = await invoke("siteId=store-a&date=2026-11-23");
assert.equal(response.status, 200);
const [a, b] = response.body.rows;
assert.equal(response.body.timezone, "Africa/Kinshasa");
assert.deepEqual([a.opening, a.entries, a.sold, a.otherOut, a.closing], ["20.000", "10.000", "7.000", "2.000", "21.000"]);
assert.deepEqual([b.opening, b.entries, b.sold, b.otherOut, b.closing], ["15.000", "5.000", "8.000", "0.000", "12.000"]);
assert.equal(a.reserved, null, "No fabricated reservations for historical dates");
assert.ok(captured.some((w) => w.occurredAt?.gte?.toISOString() === "2026-11-22T23:00:00.000Z"));
assert.ok(captured.some((w) => w.occurredAt?.lt?.toISOString() === "2026-11-23T23:00:00.000Z"));
assert.equal(logs, 1);
assert.ok(captured.some((w) => w.createdAt?.lt instanceof Date), "Archived items still require an as-of creation bound");
response = await invoke("siteId=store-a&date=2026-11-23&format=csv");
assert.equal(response.status, 200);
assert.match(response.body, /Stock initial/);
assert.match(response.body, /21.000/);
assert.match(response.body, /12.000/);
assert.match(response.body, /'=SUM\(1,1\)/, "CSV formula injection must be neutralized");
response = await invoke("siteId=store-a&date=2026-11-23&format=print");
assert.equal(response.status, 200);
assert.match(response.body, /window.print/);
assert.match(response.body, /<table>/);
assert.match(response.body, /RCCM-TEST/);
assert.match(response.body, /IDNAT-TEST/);
response = await invoke("siteId=store-a&date=2026-02-31");
assert.equal(response.status, 400);
authorized = ["store-b"];
response = await invoke("siteId=store-a&date=2026-11-23");
assert.equal(response.status, 403, "Staff from B must never read A");
authorized = ["store-a"]; enabled = false;
response = await invoke("siteId=store-a&date=2026-11-23");
assert.equal(response.status, 403, "Disabled reports are not accessible");
console.log("PASS #1221: date boundaries, full stock reconciliation, CSV/print, site isolation and disable switch (mock API).");
