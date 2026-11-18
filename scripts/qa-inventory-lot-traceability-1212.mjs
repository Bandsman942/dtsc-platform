import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const params = { params: Promise.resolve({ organizationId: "org-a" }) };
const item = { id: "tracked-1", revision: 1, lotTracking: false, expiryTracking: false };
let access = { canWrite: true, canAdminister: true, canManage: true };
let isolated = false, warehouseAllowed = true, foundWarehouse = true, unmapped = false, undated = false, limited = false;
let selectedQuery, updated = 0, transactionOptions;
const db = {
  enterpriseWarehouse: { findFirst: async ({ where }) => { assert.equal(where.organizationId, "org-a"); return foundWarehouse ? { id: "wh-a" } : null; } },
  enterpriseInventoryItem: {
    findMany: async (args) => { selectedQuery = args; return [{ id: "tracked-1", expiryTracking: true, catalogItem: { name: "Milk", code: "M001" } }]; },
    count: async () => 26,
    findFirst: async () => item,
    updateMany: async () => { updated++; return { count: 1 }; },
  },
  enterpriseInventoryBalance: { findFirst: async ({ where }) => { assert.equal(where.stockLotId, null); return unmapped ? { id: "unmapped" } : null; } },
  enterpriseStockLot: { findFirst: async () => undated ? { id: "undated" } : null, count: async () => 0 },
  $transaction: async (fn, options) => { transactionOptions = options; return fn(db); },
};
const mocks = {
  "next/server": { NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) } },
  "@/lib/notifications": { notifyUser: async () => {} },
  "@/lib/enterprise/inventory/lot-reclassification": {},
  // Selector-only VM; normal stock dashboard is covered by PostgreSQL HTTP E2E.
  "@/lib/enterprise/inventory/lot-allocation": {},
  "@/lib/enterprise/retail/invoice-stock-holds": {},
  "@/lib/enterprise/retail/inventory-policy": {},
  "@/lib/auth": { getSession: async () => ({ userId: "actor" }) },
  "@/lib/audit": { writeApiLog: async () => {}, writeAuditLog: async () => {} },
  "@/lib/enterprise/common/access": { getEnterpriseCommonDomainAccess: async () => access },
  "@/lib/enterprise/retail/http": { retailErrorResponse: () => ({ status: 403 }) },
  "@/lib/enterprise/retail/site-access": {
    retailInventoryVisibleSites: async () => ({ isolationEnabled: isolated, siteIds: ["site-a"], manageableSiteIds: ["site-a"] }),
    requireRetailWarehouseCapability: async (org, actor, wh, capability) => {
      assert.equal(org, "org-a"); assert.equal(actor, "actor"); assert.equal(capability, "MANAGE_STOCK");
      if (!warehouseAllowed || wh !== "wh-a") throw Error("denied");
    },
  },
  "@/lib/request-security": { isSameOriginRequest: () => true },
  "@/lib/rate-limit": { rateLimit: async () => ({ ok: !limited }) },
  "@/lib/prisma": { prisma: db },
  "@/lib/enterprise/common/http": { enterpriseValidationErrorResponse: () => ({ status: 400 }) },
};
function load(path) {
  const mod = { exports: {} };
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: (id) => mocks[id] || require(id), URL, Date }, { filename: path });
  return mod.exports;
}
const { GET } = load("app/api/enterprise/[organizationId]/inventory/route.ts");
const { PUT } = load("app/api/enterprise/[organizationId]/inventory/item-policy/route.ts");
const get = (extra = "") => GET({ url: "https://example.test/api?view=lot-options&warehouseId=wh-a&page=2&search=milk" + extra }, params);
isolated = true;
const eligible = await get();
assert.equal(eligible.status, 200);
assert.equal(eligible.body.pagination.pageCount, 2);
assert.equal(selectedQuery.skip, 25);
assert.equal(selectedQuery.where.organizationId, "org-a");
assert.equal(selectedQuery.where.lotTracking, true);
assert.equal(selectedQuery.where.catalogItem.trackInventory, true);
assert.equal(selectedQuery.where.catalogItem.organizationId, "org-a");
assert.equal(selectedQuery.where.balances, undefined, "The first batch must not require an existing balance");
assert.equal(selectedQuery.select.balances, undefined, "Never disclose another site balance");
assert.equal(selectedQuery.where.catalogItem.OR[2].sku.contains, "milk");
warehouseAllowed = false;
assert.equal((await get()).status, 403);
warehouseAllowed = true;
foundWarehouse = false;
assert.equal((await get()).status, 404);
foundWarehouse = true;
access = { ...access, canWrite: false };
assert.equal((await get()).status, 403);
access = { ...access, canWrite: true };
const put = (extra = {}) => PUT({ json: async () => ({ inventoryItemId: item.id, revision: 1, minimumQuantity: null, reorderQuantity: null, lotTracking: true, expiryTracking: true, ...extra }) }, params);
assert.equal((await put()).status, 403, "Scoped staff cannot change policies affecting every warehouse");
isolated = false;
access = { ...access, canAdminister: false };
assert.equal((await put()).status, 403);
access = { ...access, canAdminister: true };
limited = true;
assert.equal((await put()).status, 429);
limited = false;
unmapped = true;
const blocked = await put();
assert.equal(blocked.status, 409);
assert.equal(blocked.body.error, "INVENTORY_POLICY_UNMAPPED_STOCK");
assert.equal(updated, 0);
unmapped = false;
undated = true;
assert.equal((await put()).body.error, "INVENTORY_POLICY_UNDATED_LOTS");
assert.equal(updated, 0);
undated = false;
assert.equal((await put({ revision: 2 })).status, 409);
assert.equal(updated, 0);
assert.equal((await put()).status, 200);
assert.equal(updated, 1);
assert.equal(transactionOptions.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
console.log("Inventory lot options and activation guards OK");

const { planFefoLots } = load("lib/enterprise/inventory/lot-allocation.ts");
const d = (v) => new Prisma.Decimal(v);
const candidate = (id, expiryDate, qty, held = 0, status = "AVAILABLE") => ({ id, expiryDate: expiryDate ? new Date(expiryDate + "T00:00:00Z") : null, quantityOnHand: d(qty), quantityReserved: d(0), quantityHeld: d(held), status });
const candidates = [candidate("early", "2026-11-17", 30, 10), candidate("late", "2026-12-01", 70), candidate("expired", "2026-11-16", 100), candidate("quarantine", "2026-11-17", 100, 0, "QUARANTINED")];
const plan = planFefoLots({ candidates, quantity: 40, businessDate: "2026-11-17", expiryMode: "BLOCK" });
assert.equal(plan.shortfall.toFixed(), "0");
assert.equal(plan.allocations.map((a) => a.stockLotId + ":" + a.quantity.toFixed()).join(","), "early:20,late:20");
const short = planFefoLots({ candidates, quantity: 100, businessDate: "2026-11-17", expiryMode: "BLOCK" });
assert.equal(short.shortfall.toFixed(), "10");
assert.equal(planFefoLots({ candidates, quantity: 100, businessDate: "2026-11-17", expiryMode: "WARN" }).allocations.at(-1).stockLotId, "expired");
assert.equal(planFefoLots({ candidates: [candidate("undated", null, 10)], quantity: 1, businessDate: "2026-11-17", expiryMode: "BLOCK", requireExpiry: true }).shortfall.toFixed(), "1");
assert.throws(() => planFefoLots({ candidates, quantity: 0.0001, businessDate: "2026-11-17", expiryMode: "BLOCK" }), { name: "RangeError" });
console.log("FEFO multi-lot planning, holds, quarantine and calendar dates OK");

class TestDomainError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
mocks["@/lib/enterprise/common/errors"] = { EnterpriseDomainError: TestDomainError, EnterpriseDomainConflictError: TestDomainError };
mocks["@/lib/enterprise/inventory/approval"] = {};
mocks["@/lib/enterprise/inventory/service"] = {};
mocks["@/lib/enterprise/retail/invoice-stock-holds"] = {};
mocks["@/lib/enterprise/crm-sales/helpers"] = {};
const reclass = load("lib/enterprise/inventory/lot-reclassification.ts");
const batches = [{ lotNumber: "L-A", quantity: "30", productionDate: null, expiryDate: "2027-02-01" }, { lotNumber: "L-B", quantity: "70", productionDate: null, expiryDate: "2027-03-01" }];
assert.equal(reclass.validateLotReclassificationAllocations(batches, d(100), true).toFixed(), "100");
assert.throws(() => reclass.validateLotReclassificationAllocations(batches, d(101), true), { code: "STOCK_RECLASS_QUANTITY_MISMATCH" });
assert.throws(() => reclass.validateLotReclassificationAllocations([batches[0], { ...batches[1], lotNumber: "L-A" }], d(100), true), { code: "STOCK_RECLASS_ALLOCATION_INVALID" });
assert.throws(() => reclass.validateLotReclassificationAllocations([batches[0], { ...batches[1], expiryDate: null }], d(100), true), { code: "STOCK_RECLASS_ALLOCATION_INVALID" });
await assert.rejects(reclass.submitStockLotReclassification("org", "same-user", { approverUserId: "same-user" }), { code: "SELF_APPROVAL_FORBIDDEN" });
console.log("Historical batch allocation: quantity conservation, real dates, duplicate guard and independent approver OK");

const allocationTools = load("lib/enterprise/inventory/lot-allocation.ts");
const physical = (id, stockLotId, expiry, quantity, status = "AVAILABLE", storageLocationId = null) => ({ id, stockLotId, storageLocationId, quantityOnHand: d(quantity), quantityReserved: d(0), stockLot: { status, archivedAt: null, expiryDate: new Date(expiry + "T00:00:00Z") } });
const stock = [physical("a", "early", "2027-01-01", 30), physical("b", "late", "2027-02-01", 70), physical("c", "expired", "2026-11-16", 100), physical("d", "quarantine", "2027-01-01", 100, "QUARANTINED")];
const parameters = { balances: stock, reservations: [], holds: [], quantity: 50, businessDate: "2026-11-17", requireExpiry: true };
const assigned = allocationTools.planReservationLotAllocations(parameters);
assert.equal(assigned.shortfall.toFixed(), "0");
assert.equal(assigned.allocations.map(row => row.stockLotId + ":" + row.quantity).join(","), "early:30,late:20");
const promise = { quantity: d(50), fulfilledQuantity: d(0), lotAllocations: assigned.allocations };
assert.equal(allocationTools.reservationLotRemaining(promise, "early").toFixed(), "30");
assert.equal(allocationTools.reservationLotRemaining(promise, "late").toFixed(), "20");
assert.equal(allocationTools.reservationLegacyRemaining(promise).toFixed(), "0");
const again = allocationTools.planReservationLotAllocations({ ...parameters, reservations: [promise], quantity: 50 });
assert.equal(again.allocations.map(row => row.stockLotId + ":" + row.quantity).join(","), "late:50");
const delivery = allocationTools.consumeReservationLotAllocations(assigned.allocations, d(40));
assert.equal(delivery.movements.map(row => row.stockLotId + ":" + row.consumedQuantity).join(","), "early:30,late:10");
const partial = { ...promise, fulfilledQuantity: d(40), lotAllocations: delivery.next };
assert.equal(allocationTools.reservationLotRemaining(partial, "early").toFixed(), "0");
assert.equal(allocationTools.reservationLotRemaining(partial, "late").toFixed(), "10");
assert.throws(() => allocationTools.readReservationLotAllocations({ ...partial, fulfilledQuantity: d(39) }), /INVENTORY_RESERVATION_ALLOCATION_INVALID/);
const shelves = [physical("s1", "same", "2027-01-01", 20, "AVAILABLE", "loc1"), physical("s2", "same", "2027-01-01", 20, "AVAILABLE", "loc2")];
const held = allocationTools.planReservationLotAllocations({ ...parameters, balances: shelves, holds: [{ stockLotId: "same", quantity: d(10) }], quantity: 30 });
assert.equal(held.shortfall.toFixed(), "0", "One invoice hold across two shelves must be deducted only once");
assert.equal(held.allocations.map(row => row.quantity).join(","), "10,20");
console.log("Reservation batch allocation and partial delivery: exact balance coordinates, FEFO, holds and no duplicate quantities OK");

const oldHold = allocationTools.planReservationLotAllocations({ ...parameters, holds: [{ stockLotId: null, quantity: d(10) }], quantity: 100 });
assert.equal(oldHold.shortfall.toFixed(), "20", "Unidentified invoice holds remain conservatively protected until reconciled");
const locationOnly = allocationTools.planReservationLotAllocations({ ...parameters, balances: shelves, holds: [{ stockLotId: "same", quantity: d(10) }], storageLocationId: "loc1", quantity: 15 });
assert.equal(locationOnly.shortfall.toFixed(), "5", "A single-location request cannot ignore warehouse-level invoice holds");

const splitInvoice = { stockLotId: null, invoiceItem: { quantity: d(50) }, lotAllocations: [{ stockLotId: "early", quantity: "30" }, { stockLotId: "late", quantity: "20" }] };
assert.equal(allocationTools.readInvoiceLotAllocations(splitInvoice).map(row => row.stockLotId + ":" + row.quantity.toFixed()).join(","), "early:30,late:20");
assert.equal(allocationTools.readInvoiceLotAllocations(splitInvoice, d(15)).map(row => row.stockLotId + ":" + row.quantity.toFixed()).join(","), "early:30,late:5");
assert.equal(allocationTools.readInvoiceLotAllocations(splitInvoice, d(50)).length, 0);
assert.throws(() => allocationTools.readInvoiceLotAllocations({ ...splitInvoice, invoiceItem: { quantity: d(51) } }), /RETAIL_INVOICE_LOT_ALLOCATION_INVALID/);
assert.throws(() => allocationTools.readInvoiceLotAllocations({ ...splitInvoice, stockLotId: "early" }), /RETAIL_INVOICE_LOT_ALLOCATION_INVALID/);
console.log("Invoice batch promises: one invoice line, immutable batch snapshot, exact release of undelivered credits OK");

const returnSource = { source: splitInvoice, movements: [{ id: "out-early", stockLotId: "early", quantity: d(30) }, { id: "out-late", stockLotId: "late", quantity: d(20) }], previous: [], quantity: d(5), selected: [{ stockLotId: "late", quantity: "5" }] };
assert.equal(allocationTools.planPhysicalInvoiceReturnLots(returnSource)[0].movement.id, "out-late", "Actual returned lot, not earliest sold lot");
assert.throws(() => allocationTools.planPhysicalInvoiceReturnLots({ ...returnSource, selected: [{ stockLotId: "foreign", quantity: "5" }] }), /BATCH_QUANTITY_EXCEEDED/);
assert.throws(() => allocationTools.planPhysicalInvoiceReturnLots({ ...returnSource, previous: [{ quantity: d(18), stockDisposition: "QUARANTINE", lotAllocations: [{ stockLotId: "late", quantity: "18" }] }] }), /BATCH_QUANTITY_EXCEEDED/);
const creditedBeforeDelivery = { ...returnSource, movements: [{ id: "out-early", stockLotId: "early", quantity: d(30) }, { id: "out-late", stockLotId: "late", quantity: d(5) }], previous: [{ quantity: d(15), stockDisposition: "UNDELIVERED_CREDIT" }] };
assert.equal(allocationTools.planPhysicalInvoiceReturnLots(creditedBeforeDelivery)[0].quantity.toFixed(), "5");
assert.throws(() => allocationTools.planPhysicalInvoiceReturnLots({ ...returnSource, selected: [{ stockLotId: "late", quantity: "2" }] }), /BATCH_SELECTION_REQUIRED/);
console.log("Physical returns: explicit lot, prior commitments, undelivered credits and original movements OK");
