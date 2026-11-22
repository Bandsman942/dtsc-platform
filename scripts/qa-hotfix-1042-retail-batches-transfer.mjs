import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const { Prisma } = require("@prisma/client");
const source = fs.readFileSync("lib/enterprise/retail/inventory-policy.ts", "utf8");
class EnterpriseRetailError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const cjs = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const plannerModule = { exports: {} };
vm.runInNewContext(typescript.transpileModule(fs.readFileSync("lib/enterprise/inventory/lot-allocation.ts", "utf8"), { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 } }).outputText, { module: plannerModule, exports: plannerModule.exports, require, Date, Set, Map });
let holds = [];
const cjsModule = { exports: {} };
vm.runInNewContext(cjs, {
  module: cjsModule,
  exports: cjsModule.exports,
  require: (id) => id === "@/lib/enterprise/retail/errors" ? { EnterpriseRetailError } : id === "@/lib/enterprise/inventory/lot-allocation" ? plannerModule.exports : id === "@/lib/enterprise/retail/invoice-stock-holds" ? { readActiveRetailInvoiceStockHoldsTx: async () => holds } : require(id),
  Date, Intl, Set, Map,
}, { filename: "inventory-policy.ts" });

const {
  readRetailInventoryPolicy, businessDateKey, retailLotExpiryDateKey, lotIsExpired, assertRetailLotPolicyTx,
} = cjsModule.exports;
const legacy = readRetailInventoryPolicy(null);
assert.deepEqual({ ...legacy }, { expiryMode: "ALLOW", enforceFefo: false, warningDays: 30, transferReception: "IMMEDIATE" });
const configured = readRetailInventoryPolicy({ unrelated: "keep", inventoryPolicy: { expiryMode: "BLOCK", enforceFefo: true, warningDays: 21 } });
assert.equal(configured.transferReception, "IMMEDIATE", "Saved policies from the earlier schema must still work");
assert.equal(readRetailInventoryPolicy({ inventoryPolicy: { ...configured, transferReception: "CONFIRMED" } }).transferReception, "CONFIRMED");
assert.throws(() => readRetailInventoryPolicy({ inventoryPolicy: { ...configured, warningDays: -1 } }), { code: "RETAIL_INVENTORY_POLICY_INVALID" });
assert.equal(businessDateKey(new Date("2026-11-06T23:30:00.000Z"), "Africa/Kinshasa"), "2026-11-07");
assert.equal(retailLotExpiryDateKey(new Date("2026-11-06T00:00:00.000Z")), "2026-11-06", "StockLot expiry is a stored calendar date, not the current UTC business day");
assert.equal(businessDateKey(new Date("2026-11-06T23:30:00.000Z"), "America/New_York"), "2026-11-06", "Different stores can still be on the previous business day");
assert.equal(lotIsExpired(new Date("2026-11-06T00:00:00.000Z"), "2026-11-06"), false, "Expiry is a whole calendar date");
assert.equal(lotIsExpired(new Date("2026-11-05T00:00:00.000Z"), "2026-11-06"), true);

const yesterday = new Date(Date.now() - 86_400_000 * 2);
const upcoming = new Date(Date.now() + 86_400_000 * 5);
const later = new Date(Date.now() + 86_400_000 * 20);
const lots = [
  { id: "expired", inventoryItemId: "item", lotNumber: "BATCH-EXPIRED", status: "AVAILABLE", expiryDate: yesterday },
  { id: "early", inventoryItemId: "item", lotNumber: "BATCH-EARLY", status: "AVAILABLE", expiryDate: upcoming },
  { id: "late", inventoryItemId: "item", lotNumber: "BATCH-LATE", status: "AVAILABLE", expiryDate: later },
];
const balances = lots.map((lot) => ({ inventoryItemId: "item", stockLotId: lot.id, quantityOnHand: new Prisma.Decimal(5), quantityReserved: new Prisma.Decimal(0) }));
let sisterRecall = null;
const tx = {
  enterpriseStockLot: {
    findMany: async () => lots,
    findFirst: async ({ where, select }) => {
      assert.equal(where.organizationId, "org");
      assert.equal(where.recallReference.not, null);
      assert.equal(select.id, true);
      assert.ok(where.OR.every(pair => pair.inventoryItemId === "item" && pair.lotNumber.startsWith("BATCH-")));
      return sisterRecall && where.OR.some(pair => pair.inventoryItemId === sisterRecall.inventoryItemId &&
        pair.lotNumber === sisterRecall.lotNumber) ? { id: "sister-recall" } : null;
    },
  },
  enterpriseInventoryBalance: { findMany: async () => balances },
  enterpriseInventoryReservation: { findMany: async () => [] },
};
const input = (policy, stockLotId) => ({
  organizationId: "org", warehouseId: "wh", timezone: "UTC", settings: { inventoryPolicy: policy },
  lines: [{ inventoryItemId: "item", stockLotId }],
});
const policy = { expiryMode: "BLOCK", enforceFefo: true, warningDays: 30, transferReception: "CONFIRMED" };
await assert.rejects(assertRetailLotPolicyTx(tx, input(policy, null)), { code: "RETAIL_STOCK_LOT_REQUIRED" });
await assert.rejects(assertRetailLotPolicyTx(tx, input(policy, "expired")), { code: "RETAIL_STOCK_LOT_EXPIRED" });
await assert.rejects(assertRetailLotPolicyTx(tx, input(policy, "late")), { code: "RETAIL_FEFO_LOT_REQUIRED" });
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input(policy, "early")));
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input({ ...policy, expiryMode: "WARN", enforceFefo: false }, "expired")));
// Safety is independent from optional expiry policy / FEFO. In particular,
// a recalled batch MUST remain unsellable to #1217's direct CASH checkout.
const permissive = { ...policy, expiryMode: "ALLOW", enforceFefo: false };
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input(permissive, "early")));
const earlyLot = lots.find(lot => lot.id === "early");
earlyLot.status = "QUARANTINED";
await assert.rejects(assertRetailLotPolicyTx(tx, input(permissive, "early")), { code: "RETAIL_STOCK_LOT_INVALID" });
earlyLot.status = "AVAILABLE";
earlyLot.recallReference = "RECALL-COMMON-STOCK-1215";
await assert.rejects(assertRetailLotPolicyTx(tx, input(permissive, "early")), { code: "RETAIL_STOCK_LOT_INVALID" });
earlyLot.recallReference = null;
await assert.rejects(assertRetailLotPolicyTx(tx, { ...input(permissive, "early"),
  lines: [{ inventoryItemId: "alien-item", stockLotId: "early" }] }), { code: "RETAIL_STOCK_LOT_INVALID" });
await assert.rejects(assertRetailLotPolicyTx(tx, input(permissive, "missing-lot")), { code: "RETAIL_STOCK_LOT_INVALID" });
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input(permissive, null)));
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input(permissive, "early")));
// An AVAILABLE copy in this depot cannot override a recalled sister batch
// of the same SKU/lot-number in another depot. Other SKUs do not collide.
sisterRecall = { inventoryItemId: "item", lotNumber: "BATCH-EARLY" };
await assert.rejects(assertRetailLotPolicyTx(tx, input(permissive, "early")), { code: "RETAIL_STOCK_LOT_INVALID" });
sisterRecall = { inventoryItemId: "different-item", lotNumber: "BATCH-EARLY" };
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input(permissive, "early")));
sisterRecall = null;
// A multi-line physical selection must exhaust the earliest free lot first.
await assert.doesNotReject(assertRetailLotPolicyTx(tx, { ...input(policy, "early"), lines: [{ inventoryItemId: "item", stockLotId: "late", quantity: 2 }, { inventoryItemId: "item", stockLotId: "early", quantity: 5 }] }));
await assert.rejects(assertRetailLotPolicyTx(tx, { ...input(policy, "late"), lines: [{ inventoryItemId: "item", stockLotId: "early", quantity: 4 }, { inventoryItemId: "item", stockLotId: "late", quantity: 3 }] }), { code: "RETAIL_FEFO_LOT_REQUIRED" });
holds = [{ inventoryItemId: "item", stockLotId: "early", quantity: new Prisma.Decimal(5) }];
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input(policy, "late")));
holds = [];

const inventory = fs.readFileSync("lib/enterprise/inventory/service.ts", "utf8");
const transferBlock = inventory.slice(inventory.indexOf("export async function decideEnterpriseStockTransfer"), inventory.indexOf("export async function receiveEnterpriseStockTransfer"));
assert.match(transferBlock, /confirmedReceipt \? "IN_TRANSIT" : "COMPLETED"/);
assert.match(transferBlock, /if \(!confirmedReceipt\) await receiveTransferLinesTx/);
assert.match(inventory, /stockLotId: destinationLotId/);
assert.match(inventory, /const sourceLot = await tx.enterpriseStockLot.findFirst/);
assert.match(inventory, /expiryDate: sourceLot.expiryDate/);
assert.match(inventory, /status: "IN_TRANSIT", revision/);
const migration = fs.readFileSync("prisma/migrations/20261106130000_retail_transfer_lots_per_warehouse/migration.sql", "utf8");
assert.match(migration, /"warehouseId", "lotNumber"/);
const receiveRoute = fs.readFileSync("app/api/enterprise/[organizationId]/stock-transfers/[transferId]/receive/route.ts", "utf8");
assert.match(receiveRoute, /isSameOriginRequest\(req\)/);
assert.match(receiveRoute, /getEnterpriseCommonDomainAccess/);
assert.match(receiveRoute, /writeAuditLog/);
// Multi-boutique cutover must protect old ERP routes as well as new Retail
// invoices: staff with common module rights cannot read or mutate another
// store's site, depot, storage location, movement or transfer.
for (const path of ["sites", "warehouses", "storage-locations", "stock-movements", "stock-transfers"]) {
  const route = fs.readFileSync(`app/api/enterprise/[organizationId]/${path}/route.ts`, "utf8");
  assert.match(route, /retailInventoryVisibleSites|retailStockTransferVisibleSites/, `${path}: store read scope`);
  assert.match(route, /scope\.isolationEnabled/, `${path}: cutover-aware restrictions`);
  assert.match(route, /RETAIL_SITE_ACCESS_DENIED/, `${path}: fail-closed mutation error`);
}
const siteRegistry = fs.readFileSync("app/api/enterprise/[organizationId]/sites/route.ts", "utf8");
assert.match(siteRegistry, /id: \{ in: scope\.siteIds \}/, "site list and counts must stay local");
assert.match(siteRegistry, /access\.canManage && !scope\.isolationEnabled/, "site staff cannot administer all stores");
for (const path of [
  "stock-transfers/[transferId]/decision",
  "stock-transfers/[transferId]/receive",
]) {
  const route = fs.readFileSync(`app/api/enterprise/[organizationId]/${path}/route.ts`, "utf8");
  assert.match(route, /requireRetailSiteCapability/, `${path}: explicit site capability`);
  assert.match(route, /RETAIL_SITE_ACCESS_DENIED/, `${path}: denied store access`);
}
const warehouseCapability = fs.readFileSync("lib/enterprise/retail/site-access.ts", "utf8");
assert.match(warehouseCapability, /export async function requireRetailWarehouseCapability/);
assert.match(warehouseCapability, /await requireRetailSiteCapability\(organizationId, userId, warehouse\?\.siteId, capability\)/);
for (const path of [
  "inventory-counts", "stock-adjustments",
  "inventory-counts/[countId]/decision", "stock-adjustments/[adjustmentId]/decision",
]) {
  const route = fs.readFileSync(`app/api/enterprise/[organizationId]/${path}/route.ts`, "utf8");
  assert.match(route, /requireRetailWarehouseCapability/, `${path}: stock authorization by depot`);
  assert.match(route, /RETAIL_SITE_ACCESS_DENIED/, `${path}: site isolation must fail closed`);
}
const pos = fs.readFileSync("components/enterprise/professional/retail-pos-dtsc-workspace.tsx", "utf8");
assert.match(pos, /stockLotId: line.stockLotId/);
assert.match(pos, /retail\/stock-lots/);
assert.match(pos, /availableSiteAccounts/);
assert.match(fs.readFileSync("lib/enterprise/retail/service.ts", "utf8"), /RETAIL_FINANCIAL_ACCOUNT_SITE_MISMATCH/);
const expenseSchema = fs.readFileSync("prisma/enterprise-finance-reporting.prisma", "utf8");
assert.match(expenseSchema, /siteId\s+String\?/);
assert.match(expenseSchema, /site\s+EnterpriseSite\?/);
assert.match(fs.readFileSync("lib/enterprise/finance/expense-service.ts", "utf8"), /requireExpenseSite\(tx, organizationId, input.siteId\)/);
const ownerOverview = fs.readFileSync("app/api/enterprise/[organizationId]/retail/site-overview/route.ts", "utf8");
assert.match(ownerOverview, /role: \{ in: ADMIN_ROLES \}/);
assert.match(ownerOverview, /enterpriseExpense.groupBy/);
assert.match(fs.readFileSync("components/enterprise/professional/enterprise-inventory-operations-workspace.tsx", "utf8"), /retail|receiveTransfer/);
for (const lang of ["fr", "en"]) {
  const translations = JSON.parse(fs.readFileSync(`locales/retail-transaction-forms.${lang}.json`, "utf8")).inventoryPolicy;
  for (const key of ["title", "expiryMode", "fefo", "transferReception", "transferImmediate", "transferConfirmed", "transferHelp"]) {
    assert.ok(translations[key], `Missing ${lang} translation: ${key}`);
  }
}
console.log("HOTFIX #1042 tranche stock/lot/transfer: policy, expiry/FEFO, two-step receipt, audit and FR/EN contracts passed; OWNER_E2E pending.");
