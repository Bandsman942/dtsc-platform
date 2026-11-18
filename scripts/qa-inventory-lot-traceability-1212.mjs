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
  quantity: d(2), unitCost: d(7), totalCost: d(14), currencyCode: "USD",
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
      unitCost:d(7),totalCost:d(14),currencyCode:"USD" };
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
const creditTx = {...rtvTx,enterpriseSupplierReturnRequest:{findFirst:async()=>rtv,findMany:async()=>[rtv]},
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
const evidenceTx={...creditTx,enterpriseSupplierInvoiceItem:{findFirst:async()=>({id:"invoice-item-a",catalogItemId:"catalog-a"})},
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
