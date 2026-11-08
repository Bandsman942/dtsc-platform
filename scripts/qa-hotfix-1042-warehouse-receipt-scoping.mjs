import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
class DomainError extends Error { constructor(code, status = 409) { super(code); this.code = code; this.status = status; } }
class RetailError extends Error { constructor(code, status = 403) { super(code); this.code = code; this.status = status; } }

let authorizedSite = "shopA";
const requestedSites = [];
async function requireRetailSiteCapability(organizationId, actorUserId, siteId, capability) {
  assert.equal(organizationId, "tenantA");
  assert.equal(actorUserId, "employeeA");
  assert.equal(capability, "MANAGE_STOCK");
  requestedSites.push(siteId);
  if (siteId !== authorizedSite) throw new RetailError("RETAIL_SITE_ACCESS_DENIED", 403);
}
function loadModule(path, replacements) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, Promise,
    require: (name) => replacements[name] || {},
  }, { filename: path });
  return mod.exports;
}

let writes = 0;
const tx = {
  organization: { findFirst: async () => ({ id: "tenantA" }) },
  enterpriseSite: { findFirst: async ({ where }) => ({ id: where.id }) },
  organizationMember: { findFirst: async () => ({ id: "memberA" }) },
  enterpriseWarehouse: {
    findFirst: async ({ where }) => ({ id: where.id, siteId: where.id === "warehouseB" ? "shopB" : "shopA", code: "WH-1", status: "ACTIVE" }),
    create: async () => { writes++; return { id: "warehouseA", siteId: "shopA" }; },
    updateMany: async () => { writes++; return { count: 1 }; },
    findUniqueOrThrow: async () => ({ id: "warehouseA" }),
  },
  enterpriseStorageLocation: {
    findFirst: async ({ where }) => ({ id: where.id, warehouseId: where.id === "locationB" ? "warehouseB" : "warehouseA", warehouse: { siteId: where.id === "locationB" ? "shopB" : "shopA" }, code: "LOC-1" }),
    create: async () => { writes++; return { id: "locationA" }; },
    updateMany: async () => { writes++; return { count: 1 }; },
    findUniqueOrThrow: async () => ({ id: "locationA" }),
  },
  enterpriseOperationalEvent: { create: async () => {} },
};
const fakePrisma = { $transaction: async (fn) => fn(tx) };
const master = loadModule("lib/enterprise/master-data/service.ts", {
  "node:crypto": { randomUUID: () => "test-uuid" },
  "@/lib/prisma": { prisma: fakePrisma },
  "@/lib/enterprise/common/errors": { EnterpriseDomainError: DomainError },
  "@/lib/enterprise/retail/site-access": { requireRetailSiteCapability },
  "@/lib/enterprise/retail/errors": { EnterpriseRetailError: RetailError },
});
const attempt = async (fn, expectedSite, granted) => {
  const before = writes;
  const prior = requestedSites.length;
  if (granted) await assert.doesNotReject(fn());
  else await assert.rejects(fn(), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });
  assert.equal(requestedSites.at(-1), expectedSite);
  assert.equal(requestedSites.length, prior + 1);
  assert.equal(writes - before, granted ? 1 : 0, "A foreign store must never reach a database mutation");
};
await attempt(() => master.createEnterpriseWarehouse("tenantA", "employeeA", { siteId: "shopB" }), "shopB", false);
await attempt(() => master.createEnterpriseWarehouse("tenantA", "employeeA", { siteId: "shopA" }), "shopA", true);
await attempt(() => master.updateEnterpriseWarehouse("tenantA", "warehouseB", "employeeA", { revision: 1 }), "shopB", false);
await attempt(() => master.updateEnterpriseWarehouse("tenantA", "warehouseA", "employeeA", { revision: 1 }), "shopA", true);
await attempt(() => master.createEnterpriseStorageLocation("tenantA", "employeeA", { warehouseId: "warehouseB" }), "shopB", false);
await attempt(() => master.createEnterpriseStorageLocation("tenantA", "employeeA", { warehouseId: "warehouseA" }), "shopA", true);
await attempt(() => master.updateEnterpriseStorageLocation("tenantA", "locationB", "employeeA", { revision: 1 }), "shopB", false);
await attempt(() => master.updateEnterpriseStorageLocation("tenantA", "locationA", "employeeA", { revision: 1 }), "shopA", true);

const adapter = loadModule("lib/enterprise/procurement/common-domain-adapter.ts", {
  "zod": { z },
  "@/lib/enterprise/common/errors": { EnterpriseDomainError: DomainError },
  "@/lib/enterprise/retail/site-access": { requireRetailSiteCapability },
  "@/lib/enterprise/retail/errors": { EnterpriseRetailError: RetailError },
});
let receiptLookups = 0;
let replayLookups = 0;
let existingLink = null;
const receiptTx = {
  enterprisePurchaseReceipt: { findFirst: async ({ where }) => {
    receiptLookups++;
    return { id: where.id, purchaseId: "purchaseA", items: [] };
  } },
  enterprisePurchaseOperationalLink: { findFirst: async () => null },
  enterpriseWarehouse: { findFirst: async ({ where }) => ({ id: where.id, siteId: where.id === "warehouseB" ? "shopB" : "shopA" }) },
  enterprisePurchaseReceiptOperationalLink: { findFirst: async () => {
    replayLookups++;
    return existingLink;
  } },
};
const input = { warehouseId: "warehouseB", idempotencyKey: "receipt-key-A" };
await assert.rejects(adapter.postEnterprisePurchaseReceiptToInventoryTx(receiptTx, "tenantA", "receiptA", "employeeA", input), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });
assert.equal(receiptLookups, 1);
assert.equal(replayLookups, 1);
existingLink = { id: "receiptLinkA", purchaseReceiptId: "receiptA", warehouseId: "warehouseA" };
await assert.doesNotReject(adapter.postEnterprisePurchaseReceiptToInventoryTx(receiptTx, "tenantA", "receiptA", "employeeA", input));
assert.equal(requestedSites.at(-1), "shopA", "A replay must authorize its original destination rather than the supplied one");
authorizedSite = "shopB";
await assert.rejects(adapter.postEnterprisePurchaseReceiptToInventoryTx(receiptTx, "tenantA", "receiptA", "employeeA", input), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });
authorizedSite = "shopA";
await assert.rejects(adapter.postEnterprisePurchaseReceiptToInventoryTx(receiptTx, "tenantA", "receiptB", "employeeA", { ...input, warehouseId: "warehouseA" }), { code: "RECEIPT_IDEMPOTENCY_KEY_CONFLICT", status: 409 });

const warehouseRoute = read("app/api/enterprise/[organizationId]/warehouses/route.ts");
const locationRoute = read("app/api/enterprise/[organizationId]/storage-locations/route.ts");
assert.match(warehouseRoute, /retailInventoryVisibleSites\(organizationId, session\.userId\)/);
assert.match(warehouseRoute, /scope\.siteIds\.filter\(\(id\) => id === siteId\)/);
assert.match(warehouseRoute, /enterpriseStorageLocation\.count\(\{ where: \{ organizationId, archivedAt: null, status: "ACTIVE",[\s\S]*?warehouse: \{ siteId: \{ in: scope\.siteIds \} \}/);
assert.match(locationRoute, /retailInventoryVisibleSites\(organizationId, session\.userId\)/);
assert.match(locationRoute, /warehouse: \{ siteId: \{ in: scope\.siteIds \} \}/);
assert.match(locationRoute, /canManage: access\.canManage && \(!scope\.isolationEnabled \|\| scope\.manageableSiteIds\.length > 0\)/);
assert.match(read("lib/enterprise/procurement/purchase-service.ts"), /postEnterprisePurchaseReceiptToInventoryTx\(tx, organizationId, receipt\.id, actorUserId/);
assert.match(read("app/api/enterprise/[organizationId]/purchase-receipts/[receiptId]/post-to-inventory/route.ts"), /postEnterprisePurchaseReceiptToInventory\(organizationId, receiptId, session\.userId/);

// The historical POS surfaces must not leak receipts, return histories,
// refunds or company-wide sales totals after staff isolation is enabled.
const saleRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
const receiptRoute = read("app/api/enterprise/[organizationId]/retail/sales/[saleId]/receipt/route.ts");
const returnsRoute = read("app/api/enterprise/[organizationId]/retail/returns/route.ts");
const saleReturnsRoute = read("app/api/enterprise/[organizationId]/retail/sales/[saleId]/returns/route.ts");
const accountsRoute = read("app/api/enterprise/[organizationId]/retail/refund-accounts/route.ts");
const retailService = read("lib/enterprise/retail/service.ts");
const returnService = read("lib/enterprise/retail/returns.ts");
assert.match(saleRoute, /retailSitesForCapability\(organizationId, auth\.session\.userId, "VIEW_SALES"\)/);
assert.match(saleRoute, /siteId: \{ in: scope\.siteIds \}/);
assert.match(saleRoute, /getRetailMetricsByCurrency\(organizationId, metricFrom, metricTo, "RETAIL_POS", scope\.isolationEnabled \? scope\.siteIds/);
assert.match(read("lib/enterprise/retail/commercial-guardrails.ts"), /siteIds \? \{ siteId: \{ in: siteIds \} \}/);
assert.match(receiptRoute, /where: \{ id: saleId, organizationId, \.+\(scope\.isolationEnabled \? \{ siteId: \{ in: scope\.siteIds \} \}/);
assert.match(returnsRoute, /sale: \{ siteId: \{ in: scope\.siteIds \} \}/);
assert.match(saleReturnsRoute, /sale: \{ siteId: \{ in: scope\.siteIds \} \}/);
assert.match(accountsRoute, /retailSitesForCapability\(organizationId, auth\.session\.userId, "COLLECT_PAYMENT"\)/);
assert.match(accountsRoute, /siteId: \{ in: scope\.siteIds \}/);
assert.ok(retailService.indexOf("await requireRetailSiteCapability(organizationId, actorUserId, replayWarehouse.siteId, \"COLLECT_PAYMENT\", tx)") < retailService.indexOf("await finalizeRetailSaleAccountingTx(tx, organizationId, actorUserId, existing.id)"));
assert.match(retailService, /RETAIL_SALE_IDEMPOTENCY_COLLISION/);
assert.match(retailService, /await requireRetailSiteCapability\(organizationId, actorUserId, warehouse\.siteId, "MANAGE_STOCK", tx\)/);
assert.match(returnService, /await requireRetailSaleSiteAuthorityTx\(tx, organizationId, actorUserId, sale, "VIEW_SALES"\)/);
assert.match(returnService, /await requireRetailSaleSiteAuthorityTx\(tx, organizationId, actorUserId, retailReturn\.sale, "COLLECT_PAYMENT"\)/);
assert.match(returnService, /await requireRetailSiteCapability\(organizationId, actorUserId, siteScope\.siteId, "MANAGE_STOCK", tx\)/);
assert.match(returnService, /account\.siteId !== scope\.siteId/);
assert.ok(returnService.indexOf("await requireRetailSaleSiteAuthorityTx(tx, organizationId, actorUserId, sale, \"VIEW_SALES\")") < returnService.indexOf("where: { organizationId, idempotencyKey: input.idempotencyKey }"));

console.log("PASS #1042: warehouse/location CRUD, purchase receipts, legacy POS sales/returns/refunds and metrics enforce site bounds before writes and replays");
