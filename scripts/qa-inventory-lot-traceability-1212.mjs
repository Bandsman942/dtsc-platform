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
mocks["@/lib/enterprise/inventory/approval"] = { assertInventoryApprovalCandidate: async () => {} };
let deniedApprovalActor = "approver";
let deniedApprovalCapability = "canSubmit";
mocks["@/lib/enterprise/module-access"] = {
  resolveEnterpriseModuleCapabilities: async ({ organizationId, userId, moduleCode }) => {
    assert.equal(organizationId, "org"); assert.equal(moduleCode, "VALIDATIONS");
    return { canRead: true, canSubmit: true, ...(userId === deniedApprovalActor ? { [deniedApprovalCapability]: false } : {}) };
  },
};
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
await assert.rejects(reclass.submitStockLotReclassification("org", "requester", { approverUserId: "approver" }), { code: "STOCK_RECLASS_VALIDATIONS_REQUIRED" });
deniedApprovalActor = "requester";
deniedApprovalCapability = "canRead";
await assert.rejects(reclass.submitStockLotReclassification("org", "requester", { approverUserId: "approver" }), { code: "STOCK_RECLASS_VALIDATIONS_REQUIRED" });
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

/* Supplier dispatch is not yet exposed by an HTTP/UI action: exercise the
 * actual service and posting builder in isolation without a fake end-to-end
 * claim. PostgreSQL integration is mandatory before exposing the action. */
const approvedRtv = {
  id: "rtv-a", organizationId: "org-a", reference: "RTV-A", purchaseId: "po-a",
  receiptId: "receipt-a", receiptItemId: "receipt-item-a", sourceMovementId: "receipt-movement-a",
  inventoryItemId: "item-a", warehouseId: "wh-a", storageLocationId: null, stockLotId: "lot-a",
  supplierId: "supplier-a", supplierInvoiceId: "invoice-a", supplierInvoiceItemId: "invoice-item-a",
  receiptAccountingEventId: "receipt-event-a", originCostLayerId: "origin-layer-a",
  quantity: d(2), unitCost: d(7), totalCost: d(14), recoverableTaxAmount:d(0), currencyCode: "USD",
  reason: "Defective goods", requestedByUserId: "requester", status: "APPROVED", revision: 2,
};
const approvalRtv = { id: "review-a", requestedByUserId: "requester", approverUserId: "approver", status: "APPROVED" };
const dispatch = { requestId: "rtv-a", revision: 2, dispatchReference: "SHIP-123" };
let rtv = { ...approvedRtv }, canManageValue = true, payableBalance = d(70), approvalEvidence = true;
let quantityRemaining = d(4), writes = [], failPost = false, txOptions;
const sourceOut = { id: "out-a", movementType: "SUPPLIER_RETURN_OUT", direction: "OUT", sourceEntityType: "EnterpriseSupplierReturnRequest",
  sourceEntityId: "rtv-a", quantity: d(2), inventoryItemId: "item-a", warehouseId: "wh-a", stockLotId: "lot-a", warehouse: { siteId: "site-a" } };
let currentEvent = { id: "event-a", stockMovementId: "out-a", organizationId: "org-a", inventoryItemId: "item-a", quantity: d(2), unitCost:d(7), totalCost:d(14), currencyCode:"USD", createdAt:new Date(), eventType:"SUPPLIER_RETURN", status:"APPROVED" };
const rtvTx = {
  $queryRaw: async () => [],
  enterpriseSupplierReturnRequest: {
    findFirst: async ({ where }) => {
      assert.equal(where.organizationId, "org-a");
      if (where.requestedByUserId && where.requestedByUserId !== rtv.requestedByUserId) return null;
      return rtv;
    },
    findFirstOrThrow: async () => rtv,
    updateMany: async ({ where, data }) => {
      assert.equal(where.status, "APPROVED"); assert.equal(where.revision, 2);
      writes.push("state"); rtv = { ...rtv, ...data, revision: rtv.revision + data.revision.increment }; return { count: 1 };
    },
  },
  enterpriseApproval: { findFirst: async () => approvalRtv },
  enterpriseApprovalDecision: { findFirst: async () => approvalEvidence ? { id: "decision-a" } : null },
  enterprisePayable: { findUnique: async () => ({ organizationId: "org-a", outstandingAmount: payableBalance }) },
  enterpriseInventoryCostLayer: { updateMany: async ({ where, data }) => {
    assert.equal(where.id, "origin-layer-a"); assert.ok(where.remainingQuantity.equals.equals(quantityRemaining));
    assert.ok(data.remainingQuantity.decrement.equals(2)); quantityRemaining = quantityRemaining.minus(data.remainingQuantity.decrement);
    writes.push("layer"); return { count: 1 };
  } },
  enterpriseInventoryAccountingEvent: {
    findFirst: async () => currentEvent,
    create: async ({ data }) => { assert.equal(data.eventType, "SUPPLIER_RETURN"); assert.ok(data.totalCost.equals(14)); writes.push("event"); return currentEvent; },
    update: async ({ data }) => { assert.equal(data.status, "POSTED"); assert.equal(data.journalEntryId, "journal-a"); writes.push("event-posted"); return currentEvent; },
  },
  enterpriseStockMovement: { findFirst: async () => sourceOut },
  enterpriseSupplierCreditNote: { findFirst: async () => ({ id:"credit-a", supplierInvoiceId:"invoice-a" }) },
};
mocks["@/lib/prisma"] = { prisma: { ...rtvTx, $transaction: async (fn, options) => {
  txOptions = options;
  const prior = { rtv, quantityRemaining, writes: [...writes] };
  try { return await fn(rtvTx); } catch (error) { rtv = prior.rtv; quantityRemaining = prior.quantityRemaining; writes = prior.writes; throw error; }
} } };
mocks["@/lib/enterprise/module-access"] = { resolveEnterpriseModuleCapabilities: async () => ({ canRead:true, canSubmit:true, canManage:canManageValue }) };
mocks["@/lib/enterprise/approval-assignment"] = {};
mocks["@/lib/enterprise/procurement/access"] = {};
mocks["@/lib/enterprise/inventory/supplier-return-preflight"] = {
  assertSupplierReturnAccess: async () => {},
  inspectSupplierReturnTx: async (_tx, org, actor, input) => {
    assert.equal(org,"org-a"); assert.equal(actor,"requester"); assert.equal(input.supplierReturnSourceMovementId,"receipt-movement-a");
    return { receipt:{id:"receipt-a",purchaseId:"po-a"}, receiptItem:{id:"receipt-item-a"}, invoice:{id:"invoice-a",supplierId:"supplier-a"}, invoiceItem:{id:"invoice-item-a"},
      receiptValue:{id:"receipt-event-a"}, originLayer:{id:"origin-layer-a",remainingQuantity:quantityRemaining},
      unitCost:d(7),totalCost:d(14),recoverableTaxAmount:d(0),currencyCode:"USD" };
  },
};
mocks["@/lib/enterprise/accounting/helpers"] = { idempotencyKey: () => "value-a", publishFinanceEvent: async () => { writes.push("audit"); } };
mocks["@/lib/enterprise/inventory/service"] = {
  applyStockMovementTx: async (_tx, org, actor, input, internal) => {
    assert.equal(org,"org-a"); assert.equal(actor,"requester"); assert.equal(input.quantity,2);
    assert.equal(input.movementType,"SUPPLIER_RETURN_OUT"); assert.equal(input.stockLotId,"lot-a");
    assert.equal(internal.approvedSupplierReturnId,"rtv-a"); writes.push("movement"); return {movement:sourceOut,idempotent:false};
  },
};
mocks["@/lib/enterprise/accounting/posting-service"] = {
  postBusinessEventTx: async (_tx, org, actor, input) => {
    assert.equal(org,"org-a"); assert.equal(actor,"requester"); assert.equal(input.postingEvent,"INVENTORY_SUPPLIER_RETURN_VALUED");
    if (failPost) throw Error("closed period"); writes.push("journal"); return {entry:{id:"journal-a"}};
  },
};
mocks["@/lib/enterprise/accounting/errors"] = { EnterpriseAccountingError: TestDomainError };
const returnSvc = load("lib/enterprise/inventory/supplier-return-request-service.ts");
const qtySchema = returnSvc.supplierReturnRequestSchema.shape.quantity;
for (const quantity of ["2","1.125","0.001","999999999999.999"]) assert.equal(qtySchema.safeParse(quantity).success,true);
for (const quantity of ["1.0001","-1","2e2","2,5","1000000000000"]) assert.equal(qtySchema.safeParse(quantity).success,false);
assert.equal(returnSvc.supplierReturnDispatchSchema.safeParse({...dispatch,dispatchReference:""}).success,false);
const doDispatch = () => returnSvc.dispatchSupplierReturn("org-a","po-a","requester",dispatch);
canManageValue=false;
await assert.rejects(doDispatch(),{code:"SUPPLIER_RETURN_DISPATCH_DENIED"});
canManageValue=true; payableBalance=d(10);
await assert.rejects(doDispatch(),{code:"SUPPLIER_RETURN_PAYABLE_INSUFFICIENT"});
payableBalance=d(70); approvalEvidence=false;
await assert.rejects(doDispatch(),{code:"SUPPLIER_RETURN_DISPATCH_DENIED"});
approvalEvidence=true; rtv={...approvedRtv,status:"PENDING_APPROVAL"};
await assert.rejects(doDispatch(),{code:"SUPPLIER_RETURN_CONFLICT"});
rtv={...approvedRtv}; failPost=true;
await assert.rejects(doDispatch(),/closed period/);
assert.equal(rtv.status,"APPROVED"); assert.equal(quantityRemaining.toFixed(),"4"); assert.equal(writes.length,0);
failPost=false;
const originalSupplierLock=rtvTx.$queryRaw;
const retryHelpers=load("lib/enterprise/retail/transaction-retry.ts");
try {
  for(const code of ["40001","40P01"]){
    const conflict=new Prisma.PrismaClientKnownRequestError("supplier invoice lock",{code:"P2010",clientVersion:"test",meta:{code}});
    rtvTx.$queryRaw=async()=>{throw conflict;};
    await assert.rejects(doDispatch(),{code:"SUPPLIER_RETURN_CONFLICT"});
    assert.equal(retryHelpers.isRetriableRetailTransactionError(conflict),true);
    let attempts=0;
    const retried=await retryHelpers.withRetailTransactionRetry(async()=>{if(++attempts===1)throw conflict;return "ok";},{maxAttempts:2,baseDelayMs:0});
    assert.equal(retried,"ok");assert.equal(attempts,2);
  }
  const unexpected=new Prisma.PrismaClientKnownRequestError("unexpected SQL failure",{code:"P2010",clientVersion:"test",meta:{code:"42P01"}});
  rtvTx.$queryRaw=async()=>{throw unexpected;};
  await assert.rejects(doDispatch(),error=>error===unexpected);
  assert.equal(retryHelpers.isRetriableRetailTransactionError(unexpected),false);
  let attempts=0;
  await assert.rejects(retryHelpers.withRetailTransactionRetry(async()=>{attempts++;throw unexpected;},{maxAttempts:2,baseDelayMs:0}),error=>error===unexpected);
  assert.equal(attempts,1);
}finally{rtvTx.$queryRaw=originalSupplierLock;}
assert.equal(rtv.status,"APPROVED");assert.equal(quantityRemaining.toFixed(),"4");assert.equal(writes.length,0);
const dispatched = await doDispatch();
assert.equal(dispatched.request.status,"DISPATCHED"); assert.equal(dispatched.request.dispatchMovementId,"out-a");
assert.equal(dispatched.request.dispatchAccountingEventId,"event-a"); assert.equal(quantityRemaining.toFixed(),"2");
assert.equal(txOptions.isolationLevel,Prisma.TransactionIsolationLevel.Serializable);
assert.equal(writes.join(","),"movement,layer,event,journal,event-posted,state,audit");
const replayDispatch = await doDispatch();
assert.equal(replayDispatch.idempotent,true); assert.equal(quantityRemaining.toFixed(),"2");
assert.equal(writes.length,7);
await assert.rejects(returnSvc.dispatchSupplierReturn("org-a","po-a","requester",{...dispatch,dispatchReference:"SHIP-OTHER"}),{code:"SUPPLIER_RETURN_CONFLICT"});
mocks["@/lib/enterprise/accounting/semantic-account-resolver"] = { resolveSemanticPostingAccount: async (_tx,input) => ({id:input.mappingKey}) };
const realBusinessContext = load("lib/enterprise/business-context.ts");
mocks["@/lib/enterprise/business-context"] = realBusinessContext;
rtvTx.organization={findFirst:async()=>({timezone:"Africa/Kinshasa"})};
rtvTx.enterpriseFinanceConfiguration={findUnique:async()=>({functionalCurrencyCode:"USD"})};
mocks["@/lib/enterprise/accounting/helpers"]={...mocks["@/lib/enterprise/accounting/helpers"],money:value=>d(value).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP),sumDecimals:values=>values.reduce((sum,value)=>sum.plus(value),d(0))};
mocks["@/lib/enterprise/accounting/historical-credit-tax"]=load("lib/enterprise/accounting/historical-credit-tax.ts");
const returnCredit = load("lib/enterprise/accounting/supplier-return-credit-reconciliation.ts");
mocks["@/lib/enterprise/accounting/supplier-return-credit-reconciliation"] = returnCredit;
const postingBuilder = load("lib/enterprise/accounting/domain-posting-builders.ts");
const doc = await postingBuilder.buildInventoryAccountingPosting(rtvTx,{organizationId:"org-a",sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:"event-a"},"SUPPLIER_RETURN");
assert.equal(doc.lines[0].accountMappingKey,"GOODS_RECEIVED_CLEARING");
assert.equal(doc.lines[1].accountMappingKey,"INVENTORY");
assert.ok(doc.lines[0].debit.equals(14)); assert.ok(doc.lines[1].credit.equals(14));
currentEvent = {...currentEvent,eventType:"ISSUE"};
await assert.rejects(postingBuilder.buildInventoryAccountingPosting(rtvTx,{organizationId:"org-a",sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:"event-a"},"ISSUE"),{code:"INVENTORY_ACCOUNTING_EVENT_NOT_POSTABLE"});
const fakeCredit = { id:"credit-a", supplierInvoiceId:"invoice-a", currencyCode:"USD", grandTotal:d(14),subtotal:d(14),taxTotal:d(0),creditDate:new Date("2026-10-19T00:00:00.000Z"),createdByUserId:"creator",approvedByUserId:"reviewer" };
const fakeLine = {sourceInvoiceItemId:"invoice-item-a",catalogItemId:"catalog-a",quantity:d(2),unitPrice:d(7),netAmount:d(14),taxAmount:d(0),totalAmount:d(14)};
const creditTx = {...rtvTx,enterpriseInventoryAcquisitionCostSupplement:{findFirst:async()=>null},enterpriseSupplierReturnRequest:{findFirst:async()=>rtv,findMany:async()=>[rtv]},
  enterpriseSupplierCreditNote:{findFirst:async()=>fakeCredit},enterpriseSupplierCreditNoteItem:{findMany:async()=>[fakeLine]}};
await assert.rejects(postingBuilder.buildSupplierCreditNotePosting(creditTx,{organizationId:"org-a",sourceEntityType:"EnterpriseSupplierCreditNote",sourceEntityId:"credit-a"}),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
const capacity=returnCredit.supplierReturnPayableCapacity({currencyCode:"USD",outstandingAmount:d(70)},[rtv]);
assert.equal(capacity.reserved.toFixed(),"14");assert.equal(capacity.available.toFixed(),"56");
assert.equal(returnCredit.supplierReturnPayableCapacity({currencyCode:"USD",outstandingAmount:d(56)},[]).available.toFixed(),"56");
assert.throws(()=>returnCredit.supplierReturnPayableCapacity({currencyCode:"CDF",outstandingAmount:d(70)},[rtv]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
const projection=await returnCredit.supplierReturnFinanceProjectionTx({enterpriseSupplierReturnRequest:{findMany:async({where,select})=>{assert.equal(where.organizationId,"org-a");assert.deepEqual([...where.supplierInvoiceId.in],["invoice-a"]);assert.equal(select.reason,undefined);return [rtv];}}},"org-a",["invoice-a"]);
assert.equal(projection.get("invoice-a").id,"rtv-a");
await returnCredit.assertSupplierPaymentCapacityTx(creditTx,"org-a",{supplierInvoiceId:"invoice-a",currencyCode:"USD",outstandingAmount:d(70)},d(56));
await assert.rejects(returnCredit.assertSupplierPaymentCapacityTx(creditTx,"org-a",{supplierInvoiceId:"invoice-a",currencyCode:"USD",outstandingAmount:d(70)},d("56.01")),{code:"SUPPLIER_RETURN_PAYABLE_RESERVED"});
const ledgerLine = (ledgerAccountId,debit,credit)=>({ledgerAccountId,debit:d(debit),credit:d(credit)});
rtv={...rtv,dispatchedAt:new Date("2026-10-18T23:30:00.000Z"),supplierCreditNoteId:"credit-a",supplierCreditReference:"SCN-ORIG"};
currentEvent={...currentEvent,eventType:"SUPPLIER_RETURN",status:"POSTED",journalEntryId:"dispatch-journal"};
const evidenceTx={...creditTx,enterpriseSupplierInvoiceItem:{findFirst:async()=>({id:"invoice-item-a",catalogItemId:"catalog-a",taxAmount:d(0)})},
  enterpriseJournalEntry:{findFirst:async({where})=>where.id?{id:"dispatch-journal",accountingDate:new Date("2026-10-19T00:00:00.000Z"),functionalCurrencyCode:"USD",lines:[ledgerLine("GOODS_RECEIVED_CLEARING",14,0),ledgerLine("INVENTORY",0,14)]}:{id:"invoice-journal",functionalCurrencyCode:"USD",lines:[ledgerLine("GOODS_RECEIVED_CLEARING",70,0),ledgerLine("ACCOUNTS_PAYABLE",0,70)]}}};
assert.equal((await returnCredit.verifySupplierReturnCreditTx(evidenceTx,"org-a",fakeCredit,[fakeLine])).id,rtv.id);
await assert.rejects(returnCredit.assertSupplierReturnCreditDateTx(evidenceTx,"org-a",new Date("2026-10-18T00:00:00.000Z"),rtv.dispatchedAt),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
assert.equal(await returnCredit.assertSupplierReturnCreditDateTx(evidenceTx,"org-a",fakeCredit.creditDate,rtv.dispatchedAt),"2026-10-19");
await assert.rejects(returnCredit.assertSupplierReturnCreditDateTx(evidenceTx,"org-a",new Date("2026-10-19T12:00:00.000Z"),rtv.dispatchedAt),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
await assert.rejects(returnCredit.verifySupplierReturnCreditTx(evidenceTx,"org-a",{...fakeCredit,grandTotal:d(13)},[fakeLine]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
await assert.rejects(returnCredit.verifySupplierReturnCreditTx(evidenceTx,"org-a",{...fakeCredit,approvedByUserId:"creator"},[fakeLine]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
await assert.rejects(returnCredit.verifySupplierReturnCreditTx(evidenceTx,"org-a",fakeCredit,[{...fakeLine,quantity:d(1)}]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
let reconciled;
await returnCredit.completeSupplierReturnCreditTx({...evidenceTx,enterpriseSupplierReturnRequest:{findFirst:async()=>rtv,updateMany:async(args)=>{reconciled=args;return {count:1};}}},"org-a",fakeCredit,"credit-journal","poster");
assert.equal(reconciled.data.status,"RECONCILED");assert.equal(reconciled.data.creditJournalEntryId,"credit-journal");
// Historic recoverable VAT only; amount comes from the original invoice
// tax snapshot and posted INPUT line, not from a current tax rate.
const vatSnapshot={taxCodeId:"vat-a",rate:"0.16000000",base:"70.000000",amount:"11.200000",jurisdiction:"CD",treatment:"STANDARD",templateVersion:null,evidenceReference:"E2E-ORIGINAL",basisMode:"NET",applicationOrder:0,effectiveAt:"2026-10-18T00:00:00.000Z"};
const vatOriginal={id:"invoice-item-a",catalogItemId:"catalog-a",description:"Historic goods",quantity:d(10),unitPrice:d(7),netAmount:d(70),taxAmount:d("11.2"),taxRecoveryRequested:true,taxCalculationMode:"NET",taxBreakdownJson:[vatSnapshot]};
const vatApplication={taxCodeId:"vat-a",taxCode:{category:"VAT"},direction:"INPUT",currencyCode:"USD",taxTreatment:"STANDARD",basisMode:"NET",jurisdiction:"CD",templateVersion:null,evidenceReference:"E2E-ORIGINAL",applicationOrder:0,effectiveAt:new Date(vatSnapshot.effectiveAt),taxableAmount:d(70),taxRate:d("0.16"),taxAmount:d("11.2")};
const vatProof={...evidenceTx,enterpriseTaxLine:{findMany:async({where})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.sourceEntityId,vatOriginal.id);return [vatApplication];}},enterpriseSupplierInvoiceItem:{findFirst:async()=>vatOriginal},
  enterpriseJournalEntry:{findFirst:async({where})=>where.id?{id:"dispatch-journal",accountingDate:new Date("2026-10-19T00:00:00.000Z"),functionalCurrencyCode:"USD",lines:[ledgerLine("GOODS_RECEIVED_CLEARING",14,0),ledgerLine("INVENTORY",0,14)]}:{id:"invoice-journal",functionalCurrencyCode:"USD",lines:[ledgerLine("GOODS_RECEIVED_CLEARING",70,0),ledgerLine("TAX_RECEIVABLE","11.2",0),ledgerLine("ACCOUNTS_PAYABLE",0,"81.2")]}}};
const historicalVat=await returnCredit.deriveSupplierReturnTaxTx(vatProof,"org-a",vatOriginal,"USD",d(2),fakeCredit.creditDate);
assert.equal(historicalVat.amount.toFixed(),"2.24");
assert.equal(historicalVat.breakdown[0].rate,vatSnapshot.rate);
assert.equal(historicalVat.breakdown[0].effectiveAt,fakeCredit.creditDate.toISOString());
for(const invalid of [{...vatOriginal,taxRecoveryRequested:false},{...vatOriginal,taxCalculationMode:"SEQUENTIAL"},{...vatOriginal,taxBreakdownJson:null}]) await assert.rejects(returnCredit.deriveSupplierReturnTaxTx(vatProof,"org-a",invalid,"USD",d(2),fakeCredit.creditDate),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
await assert.rejects(returnCredit.deriveSupplierReturnTaxTx({...vatProof,enterpriseTaxLine:{findMany:async()=>[]}},"org-a",vatOriginal,"USD",d(2),fakeCredit.creditDate),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
await assert.rejects(returnCredit.deriveSupplierReturnTaxTx({...vatProof,enterpriseTaxLine:{findMany:async()=>[{...vatApplication,taxAmount:d(10)}]}},"org-a",vatOriginal,"USD",d(2),fakeCredit.creditDate),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
const vatReturn={...rtv,recoverableTaxAmount:d("2.24")};
const vatCapacity=returnCredit.supplierReturnPayableCapacity({currencyCode:"USD",outstandingAmount:d("81.2")},[vatReturn]);
assert.equal(vatCapacity.reserved.toFixed(),"16.24");assert.equal(vatCapacity.available.toFixed(),"64.96");
const vatCredit={...fakeCredit,taxTotal:d("2.24"),grandTotal:d("16.24")};
const vatCreditLine={...fakeLine,taxAmount:d("2.24"),totalAmount:d("16.24"),taxRecoveryRequested:true,taxBreakdownJson:historicalVat.breakdown};
const previousRtv=rtv;rtv=vatReturn;
try{
  assert.equal((await returnCredit.verifySupplierReturnCreditTx(vatProof,"org-a",vatCredit,[vatCreditLine])).id,rtv.id);
  await assert.rejects(returnCredit.verifySupplierReturnCreditTx(vatProof,"org-a",vatCredit,[{...vatCreditLine,taxRecoveryRequested:false}]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
  await assert.rejects(returnCredit.verifySupplierReturnCreditTx(vatProof,"org-a",vatCredit,[{...vatCreditLine,taxBreakdownJson:[{...historicalVat.breakdown[0],rate:"0.20"}]}]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
}finally{rtv=previousRtv;}
console.log("Supplier return VAT: historical input proof, tax-exclusive stock, gross payable reserve and exact credit evidence OK (isolated mocks)");
// Two independently posted standard VAT applications must be matched
// by code; neither database ordering nor current rates can change the credit.
const secondVat={...vatSnapshot,taxCodeId:"vat-b",rate:"0.04000000",amount:"2.800000",applicationOrder:1};
const secondApplication={...vatApplication,taxCodeId:"vat-b",taxRate:d("0.04"),taxAmount:d("2.8"),applicationOrder:1};
const multiOriginal={...vatOriginal,taxAmount:d(14),taxBreakdownJson:[vatSnapshot,secondVat]};
const multiProof={...vatProof,enterpriseTaxLine:{findMany:async()=>[secondApplication,vatApplication]},enterpriseSupplierInvoiceItem:{findFirst:async()=>multiOriginal},
  enterpriseJournalEntry:{findFirst:async({where})=>where.id?{id:"dispatch-journal",accountingDate:new Date("2026-10-19T00:00:00.000Z"),functionalCurrencyCode:"USD",lines:[ledgerLine("GOODS_RECEIVED_CLEARING",14,0),ledgerLine("INVENTORY",0,14)]}:{id:"invoice-journal",functionalCurrencyCode:"USD",lines:[ledgerLine("GOODS_RECEIVED_CLEARING",70,0),ledgerLine("TAX_RECEIVABLE",14,0),ledgerLine("ACCOUNTS_PAYABLE",0,84)]}}};
const multiTax=await returnCredit.deriveSupplierReturnTaxTx(multiProof,"org-a",multiOriginal,"USD",d(2),fakeCredit.creditDate);
assert.equal(multiTax.amount.toFixed(),"2.8");
assert.equal(multiTax.breakdown.map(row=>row.taxCodeId+":"+row.amount).join(","),"vat-a:2.240000,vat-b:0.560000");
for(const invalid of [
  {...multiOriginal,taxAmount:d("13.99")},
  {...multiOriginal,taxBreakdownJson:[vatSnapshot,{...secondVat,taxCodeId:"vat-a"}]},
  {...multiOriginal,taxBreakdownJson:[vatSnapshot,{...secondVat,applicationOrder:0}]},
  {...multiOriginal,taxBreakdownJson:[vatSnapshot,{...secondVat,basisMode:"SEQUENTIAL"}]},
  {...multiOriginal,taxRecoveryRequested:false}
]) await assert.rejects(returnCredit.deriveSupplierReturnTaxTx(multiProof,"org-a",invalid,"USD",d(2),fakeCredit.creditDate),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
for(const applications of [[vatApplication],[vatApplication,vatApplication],[vatApplication,{...secondApplication,direction:"INPUT_NONRECOVERABLE"}],[vatApplication,{...secondApplication,taxCode:{category:"WITHHOLDING"}}],[vatApplication,{...secondApplication,taxableAmount:d(81.2)}]]){
  await assert.rejects(returnCredit.deriveSupplierReturnTaxTx({...multiProof,enterpriseTaxLine:{findMany:async()=>applications}},"org-a",multiOriginal,"USD",d(2),fakeCredit.creditDate),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
}
const multiCredit={...fakeCredit,taxTotal:d("2.8"),grandTotal:d("16.8")};
const multiLine={...fakeLine,taxAmount:d("2.8"),totalAmount:d("16.8"),taxRecoveryRequested:true,taxBreakdownJson:multiTax.breakdown};
rtv={...previousRtv,recoverableTaxAmount:d("2.8")};
try{
  const reserved=returnCredit.supplierReturnPayableCapacity({currencyCode:"USD",outstandingAmount:d(84)},[rtv]);
  assert.equal(reserved.reserved.toFixed(),"16.8");assert.equal(reserved.available.toFixed(),"67.2");
  assert.equal((await returnCredit.verifySupplierReturnCreditTx(multiProof,"org-a",multiCredit,[multiLine])).id,rtv.id);
  await assert.rejects(returnCredit.verifySupplierReturnCreditTx(multiProof,"org-a",multiCredit,[{...multiLine,taxBreakdownJson:[multiTax.breakdown[0],{...multiTax.breakdown[1],rate:"0.05"}]}]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
  await assert.rejects(returnCredit.verifySupplierReturnCreditTx(multiProof,"org-a",multiCredit,[{...multiLine,taxBreakdownJson:[...multiTax.breakdown].reverse()}]),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
}finally{rtv=previousRtv;}
console.log("Independent historical VAT applications: exact per-code proof, no duplicate or compound tax, credit and reserve match");

// Read-only first tranche of nonrecoverable acquisition-cost evidence.
const nonRecoverableOriginal={...vatOriginal,taxRecoveryRequested:false};
const nonRecoverableRow={...vatApplication,direction:"INPUT_NONRECOVERABLE"};
const nonRecoverableProof={...vatProof,enterpriseTaxLine:{findMany:async({where})=>{
  assert.equal(where.organizationId,"org-a");
  assert.equal(where.sourceEntityId,nonRecoverableOriginal.id);
  return [nonRecoverableRow];
}}};
const receiptCost={quantity:d(10),unitCost:d(7),totalCost:d(70)};
const supplement=await returnCredit.deriveNonRecoverableInventoryCostTx(nonRecoverableProof,"org-a",nonRecoverableOriginal,"USD",receiptCost,fakeCredit.creditDate);
assert.equal(supplement.originalUnitCost.toFixed(),"7");
assert.equal(supplement.originalTotalCost.toFixed(),"70");
assert.equal(supplement.capitalizedTaxAmount.toFixed(),"11.2");
assert.equal(supplement.unitCost.toFixed(),"8.12");
assert.equal(supplement.totalCost.toFixed(),"81.2");
assert.equal(supplement.unitCost.times(2).toFixed(),"16.24");
assert.equal(supplement.unitCost.times(8).toFixed(),"64.96");
const deriveCost=(tx,original,receipt=receiptCost)=>returnCredit.deriveNonRecoverableInventoryCostTx(tx,"org-a",original,"USD",receipt,fakeCredit.creditDate);
for (const invalid of [vatOriginal,{...nonRecoverableOriginal,taxBreakdownJson:null},{...nonRecoverableOriginal,taxCalculationMode:"SEQUENTIAL"},{...multiOriginal,taxRecoveryRequested:false}]) {
  await assert.rejects(deriveCost(nonRecoverableProof,invalid),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
}
for (const rows of [[],[vatApplication],[{...nonRecoverableRow,currencyCode:"CDF"}],[{...nonRecoverableRow,taxAmount:d(10)}]]) {
  await assert.rejects(deriveCost({...nonRecoverableProof,enterpriseTaxLine:{findMany:async()=>rows}},nonRecoverableOriginal),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
}
for (const receipt of [{...receiptCost,quantity:d(9)},{...receiptCost,totalCost:d(69)},{...receiptCost,unitCost:d(8)}]) {
  await assert.rejects(deriveCost(nonRecoverableProof,nonRecoverableOriginal,receipt),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
}
const fractionSnapshot={...vatSnapshot,base:"21.000000",amount:"1.000000",rate:"0.04761905"};
const fractionOriginal={...nonRecoverableOriginal,quantity:d(3),netAmount:d(21),taxAmount:d(1),taxBreakdownJson:[fractionSnapshot]};
const fractionProof={...nonRecoverableProof,enterpriseTaxLine:{findMany:async()=>[{...nonRecoverableRow,taxableAmount:d(21),taxAmount:d(1),taxRate:d("0.04761905")}]}};
await assert.rejects(deriveCost(fractionProof,fractionOriginal,{quantity:d(3),unitCost:d(7),totalCost:d(21)}),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
// The existing public recoverable-return contract must remain restrictive.
await assert.rejects(returnCredit.deriveSupplierReturnTaxTx(nonRecoverableProof,"org-a",nonRecoverableOriginal,"USD",d(2),fakeCredit.creditDate),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
console.log("Nonrecoverable inventory cost evidence: exact TTC acquisition cost, historical INPUT_NONRECOVERABLE proof and refusal of rounding or ambiguous receipt (read-only mocks)");

// Acquisition-cost preflight must prove the entire CUMP pool, not just the
// selected physical lot. All delegates below are read-only.
const poolOrigin={id:"acq-move",organizationId:"org-a",inventoryItemId:"acq-item",warehouseId:"acq-wh",storageLocationId:null,stockLotId:"acq-lot",sourceEntityId:"acq-receipt",sourceLineId:"acq-line",quantity:d(10),occurredAt:new Date("2026-10-19T10:00:00Z")};
const poolLayer={id:"acq-layer",sourceMovementId:poolOrigin.id,currencyCode:"USD",valuationMethod:"WEIGHTED_AVERAGE",effectiveAt:poolOrigin.occurredAt,quantity:d(10),remainingQuantity:d(10),unitCost:d(7),totalCost:d(70)};
const poolBalance={stockLotId:"acq-lot",storageLocationId:null,quantityOnHand:d(10),quantityReserved:d(0)};
const poolEvent={id:"acq-event",journalEntryId:"acq-journal",currencyCode:"USD",quantity:d(10),unitCost:d(7),totalCost:d(70)};
const poolConfig={automaticPostingEnabled:true,inventoryValuationMethod:"WEIGHTED_AVERAGE",functionalCurrencyCode:"USD"};
let poolMovements=[{id:poolOrigin.id}], poolLayers=[poolLayer],poolBalances=[poolBalance],poolReceipt=poolEvent,poolSupplement=null,poolHolds=[],poolReservations=0,poolAdjustments=0,poolTransfers=0,poolCounts=0;
const poolQuery=({where,take})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.inventoryItemId,"acq-item");assert.equal(where.warehouseId,"acq-wh");assert.equal(take,2);};
const poolTx={
  enterpriseStockMovement:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.movementType,"PURCHASE_RECEIPT");return where.id===poolOrigin.id?poolOrigin:null;},findMany:async(args)=>{poolQuery(args);return poolMovements;}},
  enterpriseInventoryCostLayer:{findMany:async(args)=>{poolQuery(args);assert.equal(args.where.currencyCode,undefined);assert.equal(args.where.remainingQuantity,undefined);return poolLayers;}},
  enterpriseInventoryBalance:{findMany:async(args)=>{poolQuery(args);return poolBalances;}},
  enterpriseInventoryAccountingEvent:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.stockMovementId,poolOrigin.id);assert.equal(where.status,"POSTED");return poolReceipt;}},
  enterpriseFinanceConfiguration:{findUnique:async({where})=>{assert.equal(where.organizationId,"org-a");return poolConfig;}},
  enterpriseInventoryReservation:{count:async()=>poolReservations},
  enterpriseStockAdjustment:{count:async()=>poolAdjustments},
  enterpriseStockTransfer:{count:async()=>poolTransfers},
  enterpriseInventoryCount:{count:async()=>poolCounts},
  enterpriseInventoryAcquisitionCostSupplement:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.OR[0].costLayerId,poolLayer.id);return poolSupplement;}},
};
const priorHoldMock=mocks["@/lib/enterprise/retail/invoice-stock-holds"];
mocks["@/lib/enterprise/retail/invoice-stock-holds"]={readActiveRetailInvoiceStockHoldsTx:async(_tx,args)=>{assert.equal(args.organizationId,"org-a");assert.equal(args.warehouseId,"acq-wh");return poolHolds;}};
const acquisitionPool=load("lib/enterprise/accounting/inventory-acquisition-cost-preflight.ts");
mocks["@/lib/enterprise/retail/invoice-stock-holds"]=priorHoldMock;
const inspectPool=(movementId=poolOrigin.id,currency="USD")=>acquisitionPool.inspectUnconsumedAcquisitionPoolTx(poolTx,"org-a",movementId,currency);
const rejectedPool=()=>assert.rejects(inspectPool(),{code:"SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED"});
assert.equal((await inspectPool()).layer.id,poolLayer.id);
await assert.rejects(inspectPool("another-tenant-movement"),{code:"SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED"});
await assert.rejects(inspectPool(poolOrigin.id,"CDF"),{code:"SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED"});
poolMovements=[...poolMovements,{id:"other-lot-issue"}];await rejectedPool();poolMovements=[{id:poolOrigin.id}];
for(const layers of [[{...poolLayer,remainingQuantity:d(9)}],[poolLayer,{...poolLayer,id:"depleted-layer",remainingQuantity:d(0)}],[poolLayer,{...poolLayer,id:"other-currency",currencyCode:"CDF"}],[{...poolLayer,totalCost:d(71)}]]){poolLayers=layers;await rejectedPool();}poolLayers=[poolLayer];
for(const balances of [[{...poolBalance,quantityReserved:d(1)}],[{...poolBalance,stockLotId:"different-lot"}],[{...poolBalance,quantityOnHand:d(9)}]]){poolBalances=balances;await rejectedPool();}poolBalances=[poolBalance];
poolReceipt=null;await rejectedPool();poolReceipt={...poolEvent,totalCost:d(71)};await rejectedPool();poolReceipt=poolEvent;
poolConfig.automaticPostingEnabled=false;await rejectedPool();poolConfig.automaticPostingEnabled=true;
poolSupplement={id:"already-capitalized"};await rejectedPool();poolSupplement=null;
poolHolds=[{}];await rejectedPool();poolHolds=[];
poolReservations=1;await rejectedPool();poolReservations=0;
poolAdjustments=1;await rejectedPool();poolAdjustments=0;
poolTransfers=1;await rejectedPool();poolTransfers=0;
poolCounts=1;await rejectedPool();poolCounts=0;
assert.equal((await inspectPool()).receiptEvent.id,poolEvent.id);
console.log("Acquisition pool preflight: entire history, tenant, functional currency, physical and cost equality, no open operations or duplicate supplement (read-only mocks)");

// Test the write primitive with the existing real isolated-pool and tax
// verification helpers. No production route calls it yet.
mocks["@/lib/enterprise/accounting/inventory-acquisition-cost-preflight"]=acquisitionPool;
const acqDay=new Date(realBusinessContext.formatEnterpriseBusinessDate(new Date(),"Africa/Kinshasa")+"T00:00:00Z");
const acqNow=new Date();
const acqOrigin={...poolOrigin,occurredAt:new Date(acqNow.getTime()-1000)};
const acqLayer={...poolLayer,effectiveAt:acqOrigin.occurredAt};
const acqPurchaseItem={id:"purchase-item-acq",quantity:d(10),unitPrice:d(7),lineSubtotal:d(70),taxAmount:d("11.2"),lineTotal:d("81.2")};
const acqReceipt={id:acqOrigin.sourceEntityId,receivedAt:acqOrigin.occurredAt,items:[{id:acqOrigin.sourceLineId,purchaseItemId:acqPurchaseItem.id,quantityReceived:d(10)}]};
const acqInvoiceItem={...nonRecoverableOriginal,catalogItemId:"acq-catalog",totalAmount:d("81.2"),taxBreakdownJson:[{...vatSnapshot,effectiveAt:acqDay.toISOString()}]};
const acqMatch={organizationId:"org-a",purchaseId:"purchase-acq",purchaseReceiptId:acqReceipt.id,status:"MATCHED",currencyMatches:true,supplierMatches:true,withinTolerance:true,overrideReason:null,quantityVariance:d(0),priceVariance:d(0),taxVariance:d(0)};
const acqInvoice={id:"invoice-acq",purchaseId:"purchase-acq",purchaseReceiptId:acqReceipt.id,supplierId:"supplier-acq",assetId:null,expenseId:null,approvedAt:acqNow,approvedByUserId:"approver",createdByUserId:"creator",items:[acqInvoiceItem],amountPaid:d(0),amountCredited:d(0),outstandingAmount:d("81.2"),subtotal:d(70),taxTotal:d("11.2"),grandTotal:d("81.2"),currencyCode:"USD",invoiceDate:acqDay,threeWayMatch:acqMatch};
const acqPurchase={currency:"USD",items:[acqPurchaseItem],receipts:[acqReceipt],subtotalAmount:d(70),taxAmount:d("11.2"),totalAmount:d("81.2")};
const acqLedger=(account,debit,credit)=>({...ledgerLine(account,debit,credit),transactionCurrencyCode:"USD",exchangeRate:d(1)});
const acqInvoiceJournal={id:"invoice-journal-acq",postedAt:acqNow,postedByUserId:"poster",idempotencyKey:"acq-key",fiscalPeriodId:"period-acq",accountingDate:acqDay,functionalCurrencyCode:"USD",totalDebit:d("81.2"),totalCredit:d("81.2"),lines:[acqLedger("GOODS_RECEIVED_CLEARING",70,0),acqLedger("INVENTORY","11.2",0),acqLedger("ACCOUNTS_PAYABLE",0,"81.2")]};
const acqReceiptJournal={id:poolEvent.journalEntryId,postedAt:acqOrigin.occurredAt,accountingDate:acqOrigin.occurredAt,functionalCurrencyCode:"USD",totalDebit:d(70),totalCredit:d(70),lines:[acqLedger("INVENTORY",70,0),acqLedger("GOODS_RECEIVED_CLEARING",0,70)]};
let acqInvoiceRead=acqInvoice,acqPurchaseRead=acqPurchase,acqJournalRead=acqInvoiceJournal,acqReceiptJournalRead=acqReceiptJournal,acqLink=true,acqBatch=true,acqTax=true,acqAffected=1,acqWrites=[],acqProofWrites=[],acqPriorPayable=null,acqDuplicateInvoice=false;
const acqPeriodMock=mocks["@/lib/enterprise/accounting/periods"];
let acqPeriodOpen=true;
mocks["@/lib/enterprise/accounting/periods"]={getPostingPeriod:async(_tx,org,date,options)=>{assert.equal(org,"org-a");assert.equal(date.getTime(),acqDay.getTime());assert.equal(options,undefined);if(!acqPeriodOpen)throw new TestDomainError("FINANCE_PERIOD_CLOSED",409);return {id:"period-acq"};}};
const acqWriter=load("lib/enterprise/accounting/inventory-acquisition-cost-service.ts");
mocks["@/lib/enterprise/accounting/periods"]=acqPeriodMock;
const acqTx={...poolTx,
  $queryRaw:async()=>[],
  organization:{findFirst:async()=>({timezone:"Africa/Kinshasa"})},
  enterpriseSupplierInvoice:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.status,"APPROVED");assert.equal(where.postedAt,null);return acqInvoiceRead;},findMany:async()=>acqDuplicateInvoice?[{id:acqInvoice.id},{id:"other"}]:[{id:acqInvoice.id}]},
  enterprisePurchase:{findFirst:async({where})=>{assert.equal(where.supplierId,acqInvoice.supplierId);return acqPurchaseRead;}},
  enterpriseStockMovement:{findFirst:async()=>acqOrigin,findMany:async({where})=>where.sourceEntityId?[{...acqOrigin,direction:"IN",movementType:"PURCHASE_RECEIPT"}]:[{id:acqOrigin.id}]},
  enterpriseInventoryCostLayer:{findMany:async()=>[acqLayer],updateMany:async args=>{acqWrites.push(args);return {count:acqAffected};}},
  enterprisePostingBatch:{findFirst:async({where})=>{assert.equal(where.status,"PROCESSING");return acqBatch?{idempotencyKey:"acq-key"}:null;}},
  enterpriseJournalEntry:{findFirst:async({where})=>where.id===acqInvoiceJournal.id?acqJournalRead:acqReceiptJournalRead},
  enterprisePayable:{findFirst:async()=>acqPriorPayable},
  enterpriseSupplierCreditNote:{count:async()=>0},
  pharmacyProductExtension:{count:async()=>0},
  enterpriseSectorInventoryEvent:{count:async()=>0},
  enterprisePurchaseItemCatalogLink:{findFirst:async()=>acqLink?{id:"link"}:null},
  enterprisePurchaseReceiptOperationalLink:{findFirst:async()=>({id:"receipt-link"})},
  enterpriseInventoryItem:{findFirst:async()=>({id:acqOrigin.inventoryItemId})},
  enterpriseTaxLine:{findMany:async()=>[{...nonRecoverableRow,effectiveAt:acqDay}],findFirst:async()=>acqTax?{id:"acq-tax",effectiveAt:acqDay}:null},
  enterpriseInventoryAcquisitionCostSupplement:{findFirst:async()=>poolSupplement,create:async({data})=>{acqProofWrites.push(data);return {id:"acq-proof",...data};}},
};
const applyAcq=()=>acqWriter.capitalizeNonRecoverableAcquisitionCostTx(acqTx,"org-a","poster",{invoiceId:acqInvoice.id,invoiceJournalId:acqInvoiceJournal.id,postingBatchId:"batch-acq"});
const blockedAcq=()=>assert.rejects(applyAcq(),{code:"SUPPLIER_RETURN_NONRECOVERABLE_COST_RECONCILIATION_REQUIRED"});
acqInvoiceRead={...acqInvoice,threeWayMatch:{...acqMatch,taxVariance:d("0.01")}};await blockedAcq();acqInvoiceRead=acqInvoice;
acqDuplicateInvoice=true;await blockedAcq();acqDuplicateInvoice=false;
acqPurchaseRead={...acqPurchase,taxAmount:d(10)};await blockedAcq();acqPurchaseRead=acqPurchase;
acqLink=false;await blockedAcq();acqLink=true;
acqPriorPayable={id:"existing"};await blockedAcq();acqPriorPayable=null;
acqBatch=false;await blockedAcq();acqBatch=true;
acqTax=false;await blockedAcq();acqTax=true;
acqJournalRead={...acqInvoiceJournal,lines:[...acqInvoiceJournal.lines.slice(0,2),acqLedger("ACCOUNTS_PAYABLE",0,81)]};await blockedAcq();acqJournalRead=acqInvoiceJournal;
acqReceiptJournalRead={...acqReceiptJournal,totalDebit:d(71)};await blockedAcq();acqReceiptJournalRead=acqReceiptJournal;
acqPeriodOpen=false;await assert.rejects(applyAcq(),{code:"FINANCE_PERIOD_CLOSED"});acqPeriodOpen=true;
poolSupplement={id:"already-capitalized"};await blockedAcq();poolSupplement=null;
assert.equal(acqWrites.length,0);assert.equal(acqProofWrites.length,0);
acqAffected=0;await blockedAcq();assert.equal(acqProofWrites.length,0);
acqAffected=1;const recordedAcq=await applyAcq();
assert.equal(recordedAcq.totalCost.toFixed(),"81.2");assert.equal(recordedAcq.unitCost.toFixed(),"8.12");
assert.equal(acqWrites.at(-1).where.organizationId,"org-a");assert.equal(acqWrites.at(-1).where.remainingQuantity.toFixed(),"10");
assert.equal(acqWrites.at(-1).where.unitCost.toFixed(),"7");assert.equal(acqWrites.at(-1).data.unitCost.toFixed(),"8.12");
assert.equal(acqWrites.at(-1).data.totalCost.toFixed(),"81.2");assert.equal(acqWrites.at(-1).data.remainingQuantity,undefined);
assert.equal(acqProofWrites.length,1);assert.equal(acqProofWrites[0].invoiceJournalEntryId,acqInvoiceJournal.id);assert.equal(acqProofWrites[0].receiptAccountingEventId,poolEvent.id);
assert.equal(acqProofWrites[0].taxLineId,"acq-tax");assert.equal(acqProofWrites[0].recordedByUserId,"poster");
console.log("Acquisition cost writer: strict 3-way provenance, original and invoice journals, posted tax proof, open period and compare-and-set layer without quantity or journal mutation (isolated mocks)");

const acquisitionGuards=load("lib/enterprise/accounting/inventory-acquisition-cost-guards.ts");
let guardProof=null;
const guardTx={
  enterpriseInventoryAcquisitionCostSupplement:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");return guardProof;}},
  enterpriseInventoryAccountingEvent:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");return {stockMovementId:poolOrigin.id};}},
  enterpriseStockMovement:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");return {inventoryItemId:"acq-item",warehouseId:"acq-wh"};}},
};
const guardInvoiceSource={sourceEntityType:"EnterpriseSupplierInvoice",sourceEntityId:acqInvoice.id,journalId:acqInvoiceJournal.id};
const guardEventSource={sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:poolEvent.id};
await acquisitionGuards.assertAcquisitionJournalCorrectionAllowedTx(guardTx,"org-a",guardInvoiceSource);
await acquisitionGuards.assertAcquisitionJournalCorrectionAllowedTx(guardTx,"org-a",guardEventSource);
guardProof={id:"protected-supplement"};
for(const source of [guardInvoiceSource,guardEventSource]) await assert.rejects(acquisitionGuards.assertAcquisitionJournalCorrectionAllowedTx(guardTx,"org-a",source),{code:"INVENTORY_ACQUISITION_COST_DOMAIN_CORRECTION_REQUIRED"});
await acquisitionGuards.assertAcquisitionJournalCorrectionAllowedTx(guardTx,"org-a",{sourceEntityType:"EnterprisePayment",sourceEntityId:"other"});
await assert.rejects(returnCredit.assertNoCapitalizedSupplierCreditTx(guardTx,"org-a",acqInvoice.id),{code:"INVENTORY_ACQUISITION_COST_DOMAIN_CORRECTION_REQUIRED"});
await assert.rejects(returnCredit.verifySupplierReturnCreditTx({...evidenceTx,enterpriseSupplierReturnRequest:{findFirst:async()=>null},enterpriseInventoryAcquisitionCostSupplement:guardTx.enterpriseInventoryAcquisitionCostSupplement},"org-a",fakeCredit,[fakeLine]),{code:"INVENTORY_ACQUISITION_COST_DOMAIN_CORRECTION_REQUIRED"});
guardProof=null;
await returnCredit.assertNoCapitalizedSupplierCreditTx(guardTx,"org-a",acqInvoice.id);
let cutoffBlocked=false;
const cutoffTx={$queryRaw:async query=>{assert.ok(query.values.includes("org-a"));assert.ok(query.values.some(value=>value instanceof Date&&value.getTime()===acqDay.getTime()));assert.ok(query.sql.includes('s."createdAt"'));assert.ok(query.sql.includes('e."createdAt"'));return cutoffBlocked?[{blocked:1}]:[];}};
await acquisitionGuards.assertAcquisitionValuationCutoffTx(cutoffTx,"org-a",acqDay);
cutoffBlocked=true;await assert.rejects(acquisitionGuards.assertAcquisitionValuationCutoffTx(cutoffTx,"org-a",acqDay),{code:"INVENTORY_ACQUISITION_COST_HISTORY_REQUIRED"});
console.log("Acquisition guards: generic credits/reversals, tenant scope and misleading historical projections blocked");
const capCoordinates={originCostLayerId:recordedAcq.costLayerId,receiptAccountingEventId:recordedAcq.receiptAccountingEventId,invoiceJournalEntryId:recordedAcq.invoiceJournalEntryId,currencyCode:"USD",quantity:d(2)};
const capTaxTx={...acqTx,enterpriseTaxLine:{findMany:async()=>[{...nonRecoverableRow,effectiveAt:acqDay}],findFirst:async({where})=>where.id===recordedAcq.taxLineId?{id:recordedAcq.taxLineId,effectiveAt:acqDay}:null}};
const capReturn=await returnCredit.deriveCapitalizedSupplierReturnTx(capTaxTx,"org-a",acqInvoiceItem,recordedAcq,capCoordinates,acqDay);
assert.equal(capReturn.unitPrice.toFixed(),"7");assert.equal(capReturn.net.toFixed(),"14");assert.equal(capReturn.tax.amount.toFixed(),"2.24");assert.equal(capReturn.gross.toFixed(),"16.24");
for(const coords of [{...capCoordinates,currencyCode:"CDF"},{...capCoordinates,originCostLayerId:"other"},{...capCoordinates,receiptAccountingEventId:"other"},{...capCoordinates,invoiceJournalEntryId:"other"},{...capCoordinates,quantity:d(11)}])await assert.rejects(returnCredit.deriveCapitalizedSupplierReturnTx(capTaxTx,"org-a",acqInvoiceItem,recordedAcq,coords,acqDay),{code:"SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED"});
console.log("Capitalized supplier return: exact historical HT/VAT/TTC allocation and linked source proof");




console.log("Linked supplier credit contract: exact source, posting evidence, separate approval and reserved payable (isolated mocks)");
console.log("Supplier return dispatch contract: exact cost, approved source, separate clearing journal, replay and generic credit guard OK (isolated mocks)");

/* Recovery diagnostic: an original issue cost is only a ceiling, not a
 * new valuation. Mock delegates deliberately expose no mutation methods. */
let recoveryAllowed=true,recoveryRecall=0,recoveryPriorRestock=0,recoverySiteAllowed=true,recoverySpecialized=0;
mocks["@/lib/enterprise/module-access"]={resolveEnterpriseModuleAccess:async()=>({allowed:recoveryAllowed})};
mocks["@/lib/enterprise/inventory/service"]={requireInventoryStockAuthorityTx:async(_tx,org,actor,warehouse)=>{assert.equal(org,"org-a");assert.equal(warehouse,"wh-a");if(!recoverySiteAllowed)throw new TestDomainError("FORBIDDEN",403);}};
mocks["@/lib/enterprise/inventory/lot-allocation"]={lotExpiryDateKey:date=>realBusinessContext.formatEnterpriseBusinessDate(date,"UTC")};
mocks["@/lib/enterprise/accounting/helpers"]={money:value=>d(value).toDecimalPlaces(6)};
const recoveryService=load("lib/enterprise/inventory/custody-recovery-preflight.ts");
const recoveryLot={id:"lot-a",lotNumber:"A",inventoryItemId:"item-a",warehouseId:"wh-a",storageLocationId:null,status:"AVAILABLE",expiryDate:new Date("2099-01-01T00:00:00Z"),archivedAt:null,recallReference:null};
const recoveryIssue={id:"issue-a",inventoryItemId:"item-a",warehouseId:"wh-a",storageLocationId:null,stockLotId:"lot-a",movementType:"SALE_FULFILLMENT",direction:"OUT",sourceEntityType:"EnterpriseSalesInvoice",sourceEntityId:"invoice-a",sourceLineId:"sale-line-a",quantity:d(4),stockLot:recoveryLot,inventoryItem:{catalogItemId:"catalog-a",status:"ACTIVE",archivedAt:null,lotTracking:true,expiryTracking:true,catalogItem:{status:"ACTIVE",trackInventory:true,archivedAt:null}},warehouse:{status:"ACTIVE",archivedAt:null}};
const recoveryCustody={id:"custody-a",status:"QUARANTINED",disposition:"QUARANTINE",revision:1,quantity:d(2),originalMovement:recoveryIssue,returnLine:{quantity:d(2),stockDisposition:"QUARANTINE",checkoutLineId:"checkout-line-a",request:{number:"RET-A",salesCreditNoteId:"credit-a",inspectedByUserId:"inspector",completedAt:new Date()},checkoutLine:{invoiceItemId:"sale-line-a",inventoryItemId:"item-a",checkout:{salesInvoiceId:"invoice-a",warehouseId:"wh-a"}}}};
const recoveryValuation={id:"issue-val",journalEntryId:"issue-journal",quantity:d(4),unitCost:d(7),totalCost:d(28),currencyCode:"USD"};
const recoveryTx={
  organization:{findFirst:async()=>({timezone:"Africa/Kinshasa"})},
  enterpriseFinanceConfiguration:{findUnique:async()=>({automaticPostingEnabled:true,inventoryValuationMethod:"WEIGHTED_AVERAGE",functionalCurrencyCode:"USD"})},
  enterpriseInventoryReturnCustody:{findFirst:async({where})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.id,"custody-a");return recoveryCustody;},aggregate:async()=>({_sum:{quantity:d(2)}})},
  enterpriseStockLot:{count:async({where})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.lotNumber,"A");return recoveryRecall;}},
  enterpriseStockMovement:{count:async({where})=>where.direction==="IN"?recoveryPriorRestock:1},
  pharmacyProductExtension:{count:async()=>recoverySpecialized},enterpriseSectorInventoryEvent:{count:async()=>0},
  enterpriseSalesCreditNote:{findFirst:async()=>({id:"credit-a"})},enterpriseInventoryAccountingEvent:{findFirst:async()=>recoveryValuation},
  enterpriseRetailInvoiceReturnLine:{findMany:async()=>[{id:"return-line-a"}]},
  enterpriseJournalEntry:{findFirst:async({where})=>where.sourceEntityType==="EnterpriseSalesCreditNote"?{id:"credit-journal",functionalCurrencyCode:"USD",totalDebit:d(40),totalCredit:d(40)}:{id:"issue-journal",functionalCurrencyCode:"USD",lines:[ledgerLine("COST_OF_SALES",28,0),ledgerLine("INVENTORY",0,28)]}},
};
await recoveryService.assertCustodyRecoveryReadAccess("org-a","actor");
recoveryAllowed=false;await assert.rejects(recoveryService.assertCustodyRecoveryReadAccess("org-a","actor"),{code:"INVENTORY_RETURN_RECOVERY_PERMISSION_REQUIRED"});recoveryAllowed=true;
const inspectRecovery=()=>recoveryService.inspectCustodyRecoveryTx(recoveryTx,"org-a","actor","custody-a");
const recoveryPreview=await inspectRecovery();
assert.equal(recoveryPreview.historicalCostCeiling,"14");
assert.equal(recoveryPreview.readOnly,true);assert.equal(recoveryPreview.physicalReleaseAuthorized,false);assert.equal(recoveryPreview.accountingRecognitionAuthorized,false);
recoveryRecall=1;await assert.rejects(inspectRecovery(),{code:"INVENTORY_RETURN_RECOVERY_LOT_UNSAFE"});recoveryRecall=0;
recoveryLot.expiryDate=new Date("2000-01-01T00:00:00Z");await assert.rejects(inspectRecovery(),{code:"INVENTORY_RETURN_RECOVERY_LOT_UNSAFE"});recoveryLot.expiryDate=new Date("2099-01-01T00:00:00Z");
recoveryPriorRestock=1;await assert.rejects(inspectRecovery(),{code:"INVENTORY_RETURN_RECOVERY_ORIGIN_INVALID"});recoveryPriorRestock=0;
recoverySpecialized=1;await assert.rejects(inspectRecovery(),{code:"INVENTORY_RETURN_RECOVERY_SECTOR_REQUIRED"});recoverySpecialized=0;
recoveryCustody.status="DISPOSED";await assert.rejects(inspectRecovery(),{code:"INVENTORY_RETURN_RECOVERY_CUSTODY_INVALID"});recoveryCustody.status="QUARANTINED";
recoverySiteAllowed=false;await assert.rejects(inspectRecovery(),{code:"FORBIDDEN"});
console.log("Custody recovery diagnostic: historical ceiling only, no mutations, recall/expiry, sector and site guards (isolated mocks)");

/* Appraisal submission and review: only the dossier and approval delegates
 * are writable. The source custody, balances, cost layers and journals are not. */
recoverySiteAllowed=true;
recoveryCustody.inspectedByUserId="original-inspector";
recoveryCustody.registeredByUserId="original-settler";
let savedAssessment=null,savedReview=null,savedVersion=null,reviewDecisions=[],appraisalEvents=[];
mocks["@/lib/enterprise/module-access"]={resolveEnterpriseModuleAccess:async()=>({allowed:true}),resolveEnterpriseModuleCapabilities:async()=>({canRead:true,canCreate:true,canManage:true,canSubmit:true})};
mocks["@/lib/enterprise/inventory/custody-recovery-preflight"]=recoveryService;
mocks["@/lib/enterprise/inventory/approval"]={assertInventoryApprovalCandidate:async()=>{},assertInventoryApprovalDecision:async()=>{}};
mocks["@/lib/enterprise/approval-assignment"]={listEnterpriseApprovalCandidates:async()=>({candidates:["appraiser","reviewer","original-inspector","original-settler"].map(userId=>({userId}))})};
mocks["@/lib/enterprise/retail/site-access"]={retailInventoryVisibleSites:async()=>({isolationEnabled:false})};
mocks["@/lib/enterprise/crm-sales/helpers"]={publishEnterpriseEvent:async(_tx,event)=>{appraisalEvents.push(event);}};
const appraisalTx={...recoveryTx,$queryRaw:async()=>[],
  enterpriseInventoryReturnRecoveryAssessment:{
    findFirst:async({where})=>savedAssessment&&(!where.id||where.id===savedAssessment.id)&&(!where.idempotencyKey||where.idempotencyKey===savedAssessment.idempotencyKey)&&(!where.status||where.status===savedAssessment.status)?savedAssessment:null,
    findFirstOrThrow:async()=>savedAssessment,
    count:async()=>savedAssessment&&["PENDING_APPROVAL","APPROVED"].includes(savedAssessment.status)?1:0,
    create:async({data})=>{savedAssessment={...data,id:"assessment-a",status:"PENDING_APPROVAL",revision:1};for(const field of ["quantity","historicalCostCeiling","estimatedSellingAmount","completionCost","sellingCost","estimatedNetValue","proposedRecoveryAmount"])savedAssessment[field]=d(data[field]);return savedAssessment;},
    updateMany:async({where,data})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.status,savedAssessment.status);savedAssessment={...savedAssessment,...data,revision:savedAssessment.revision+1};return {count:1};}
  },
  enterpriseApproval:{
    findFirst:async({where})=>savedReview&&(!where.id||where.id===savedReview.id)&&(!where.status||where.status===savedReview.status)&&(!where.revision||where.revision===savedReview.revision)?savedReview:null,
    create:async({data})=>{savedReview={...data,id:"approval-recovery-a",revision:1};return savedReview;},
    updateMany:async({where,data})=>{assert.equal(where.organizationId,"org-a");assert.equal(where.revision,savedReview.revision);savedReview={...savedReview,...data,revision:savedReview.revision+1};return {count:1};}
  },
  enterpriseApprovalSubmissionVersion:{create:async({data})=>{savedVersion={...data,id:"version-recovery-a"};return savedVersion;},findFirst:async()=>savedVersion},
  enterpriseApprovalDecision:{findFirst:async()=>reviewDecisions[0]?{...reviewDecisions[0],id:"decision-recovery-a"}:null,create:async({data})=>{reviewDecisions.push(data);return data;}},
  enterpriseStockMovement:{count:async({where})=>where.sourceEntityType==="EnterpriseInventoryReturnRecoveryAssessment"?0:recoveryTx.enterpriseStockMovement.count({where})},
  enterpriseEntityLink:{create:async()=>({})},
};
mocks["@/lib/prisma"]={prisma:{...appraisalTx,$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,Prisma.TransactionIsolationLevel.Serializable);return fn(appraisalTx);}}};
mocks["@/lib/enterprise/accounting/periods"]={getPostingPeriod:async()=>({id:"period-a",status:"OPEN"})};
// Exercise the production error class for recovery conflicts, including its
// actual HTTP 409 status; the older generic VM stub defaults to 400.
mocks["@/lib/enterprise/common/errors"]=load("lib/enterprise/common/errors.ts");
const appraisal=load("lib/enterprise/inventory/custody-recovery-assessment.ts");
const application={custodyId:"custody-a",custodyRevision:1,estimatedSellingAmount:"18",completionCost:"5",sellingCost:"2",evidenceReference:"REPORT-QA",findings:"Physical appraisal confirms repairable condition.",confirmedPhysicalInspection:true,approverUserId:"reviewer",idempotencyKey:"APPRAISAL-QA-01"};
assert.equal(appraisal.recoveryAssessmentSchema.safeParse(application).success,true);
assert.equal(appraisal.recoveryAssessmentSchema.safeParse({...application,confirmedPhysicalInspection:false}).success,false);
assert.equal(appraisal.recoveryAssessmentSchema.safeParse({...application,completionCost:"1.0000001"}).success,false);
assert.equal(appraisal.recoveryProposal(application,"14").proposedRecoveryAmount.toFixed(),"11");
assert.equal(appraisal.recoveryProposal({...application,estimatedSellingAmount:"40"},"14").proposedRecoveryAmount.toFixed(),"14");
assert.throws(()=>appraisal.recoveryProposal({...application,estimatedSellingAmount:"7"},"14"),{code:"INVENTORY_RETURN_RECOVERY_AMOUNT_INVALID"});
assert.equal((await appraisal.recoveryApprovalCandidates("org-a","appraiser","custody-a")).candidates.length,1);
await assert.rejects(appraisal.submitRecoveryAssessment("org-a","appraiser",{...application,approverUserId:"appraiser"}),{code:"INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED"});
await assert.rejects(appraisal.submitRecoveryAssessment("org-a","original-inspector",application),{code:"INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED"});
const appraisalCreated=await appraisal.submitRecoveryAssessment("org-a","appraiser",application);
assert.equal(appraisalCreated.assessment.proposedRecoveryAmount.toFixed(),"11");
assert.equal(savedVersion.snapshotJson.totalAmount,"11");
assert.equal(savedVersion.snapshotJson.historicalCostCeiling,"14");
assert.equal((await appraisal.submitRecoveryAssessment("org-a","appraiser",application)).idempotent,true);
await assert.rejects(appraisal.submitRecoveryAssessment("org-a","appraiser",{...application,completionCost:"6"}),{code:"INVENTORY_RETURN_RECOVERY_CONFLICT"});
await assert.rejects(appraisal.submitRecoveryAssessment("org-a","appraiser",{...application,idempotencyKey:"APPRAISAL-QA-02"}),{code:"INVENTORY_RETURN_RECOVERY_CONFLICT"});
const reviewInput={organizationId:"org-a",approvalId:"approval-recovery-a",actorUserId:"reviewer",action:"APPROVE",revision:1,reviewedVersionId:"version-recovery-a"};
await assert.rejects(appraisal.decideRecoveryAssessment({...reviewInput,actorUserId:"appraiser"}),{code:"INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED"});
await assert.rejects(appraisal.decideRecoveryAssessment({...reviewInput,reviewedVersionId:"old"}),{code:"INVENTORY_RETURN_RECOVERY_CONFLICT"});
recoveryCustody.revision=2;await assert.rejects(appraisal.decideRecoveryAssessment(reviewInput),{code:"INVENTORY_RETURN_RECOVERY_CONFLICT"});recoveryCustody.revision=1;
recoveryRecall=1;await assert.rejects(appraisal.decideRecoveryAssessment(reviewInput),{code:"INVENTORY_RETURN_RECOVERY_LOT_UNSAFE"});recoveryRecall=0;
assert.equal((await appraisal.decideRecoveryAssessment(reviewInput)).status,"APPROVED");
assert.equal(savedAssessment.status,"APPROVED");assert.equal(reviewDecisions.length,1);
assert.equal(reviewDecisions[0].submissionVersionId,savedVersion.id);
assert.equal(recoveryCustody.status,"QUARANTINED");assert.equal(recoveryCustody.revision,1);
assert.equal(appraisalEvents.length,2);assert.ok(appraisalEvents.every(event=>event.metadataJson.physicalReleaseAuthorized===false&&event.metadataJson.accountingRecognitionAuthorized===false));
console.log("Recovery appraisal contract: prudent value, independence, immutable review, idempotency and stale-source rejection (isolated mocks)");

const withdrawal={custodyId:"custody-a",assessmentId:"assessment-a",revision:2,reason:"Expert withdrew the unused appraisal",confirmedNotReleased:true};
assert.equal(appraisal.recoveryWithdrawalSchema.safeParse(withdrawal).success,true);
assert.equal(appraisal.recoveryWithdrawalSchema.safeParse({...withdrawal,confirmedNotReleased:false}).success,false);
const withdrawnAppraisal=await appraisal.withdrawRecoveryAssessment("org-a","appraiser",withdrawal);
assert.equal(withdrawnAppraisal.assessment.status,"CANCELLED");
assert.equal(savedReview.status,"APPROVED");assert.equal(reviewDecisions.length,1);
assert.equal(savedAssessment.withdrawalReason,withdrawal.reason);
assert.equal((await appraisal.withdrawRecoveryAssessment("org-a","appraiser",withdrawal)).idempotent,true);
await assert.rejects(appraisal.withdrawRecoveryAssessment("org-a","appraiser",{...withdrawal,reason:"Attempt to change original reason"}),{code:"INVENTORY_RETURN_RECOVERY_CONFLICT"});
assert.equal(recoveryCustody.status,"QUARANTINED");assert.equal(recoveryCustody.revision,1);
console.log("Recovery withdrawal preserves original decision and physical custody");

// The real PostgreSQL SELECT FOR UPDATE may reject the losing Serializable
// transaction as P2010/40001 (or 40P01), not just P2034. Never disguise an
// unrelated raw-query failure as a business conflict.
const executeRecoveryInput={custodyId:"custody-a",assessmentId:"assessment-a",revision:2,releaseEvidence:"Physical quality release confirmed",confirmedSaleableAndRepaired:true};
const originalRecoveryLock=appraisalTx.$queryRaw;
const recoveryErrors=[
  new Prisma.PrismaClientKnownRequestError("serialization conflict",{code:"P2034",clientVersion:"test"}),
  new Prisma.PrismaClientKnownRequestError("unique conflict",{code:"P2002",clientVersion:"test"}),
  ...["40001","40P01"].map(code=>new Prisma.PrismaClientKnownRequestError("raw lock conflict",{code:"P2010",clientVersion:"test",meta:{code}})),
];
const previousAppraisalEventCount=appraisalEvents.length;
try{
  for(const error of recoveryErrors){
    appraisalTx.$queryRaw=async()=>{throw error;};
    await assert.rejects(appraisal.executeRecoveryAssessment("org-a","appraiser",executeRecoveryInput),{code:"INVENTORY_RETURN_RECOVERY_CONFLICT",status:409});
  }
  const unexpected=new Prisma.PrismaClientKnownRequestError("unexpected raw failure",{code:"P2010",clientVersion:"test",meta:{code:"42P01"}});
  appraisalTx.$queryRaw=async()=>{throw unexpected;};
  await assert.rejects(appraisal.executeRecoveryAssessment("org-a","appraiser",executeRecoveryInput),error=>error===unexpected);
}finally{appraisalTx.$queryRaw=originalRecoveryLock;}
assert.equal(appraisalEvents.length,previousAppraisalEventCount);
assert.equal(savedAssessment.status,"CANCELLED");
assert.equal(recoveryCustody.status,"QUARANTINED");
console.log("Recovery concurrency normalizes only known transaction conflicts; unexpected errors propagate");
