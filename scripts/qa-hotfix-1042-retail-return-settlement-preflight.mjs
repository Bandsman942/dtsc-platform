import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const D = (value) => new Prisma.Decimal(value);
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}

const state = {
  request: {
    id: "return-A", checkoutId: "checkout-A", status: "APPROVED", refundAmount: D("33.33"),
    requestedByUserId: "requester", approverUserId: "approver", decidedByUserId: "approver",
    inspectedByUserId: "inspector", inspectedAt: new Date(), inspectionNotes: "Stock reçu et vérifié",
    lines: [{ id: "returnline-A", checkoutLineId: "checkoutline-A", quantity: D(1),
      refundAmount: D("33.33"), refundNetAmount: D(30), refundTaxAmount: D("3.33"), stockDisposition: "RESTOCK" }],
    checkout: {
      id: "checkout-A", siteId: "site-A", warehouseId: "warehouse-A", stockPostedAt: new Date(),
      invoice: {
        id: "invoice-A", status: "PAID", grandTotal: D(100), currencyCode: "CDF",
        amountPaid: D(100), amountCredited: D(0), outstandingAmount: D(0),
        businessPartyId: "buyer-A", receivable: { id: "receivable-A" },
      },
      lines: [{ id: "checkoutline-A", invoiceItemId: "invoice-line-A", inventoryItemId: "item-A", stockLotId: "lot-A",
        invoiceItem: { quantity: D(3), netAmount: D(90), taxAmount: D(10), totalAmount: D(100) } }],
    },
  },
  allocations: [{ id: "allocation-A", paymentId: "payment-A", amount: D(100), payment: { status: "CONFIRMED", direction: "INBOUND", paymentType: "CUSTOMER_PAYMENT",
    businessPartyId: "buyer-A", currencyCode: "CDF", financialAccountId: "account-A" } }],
  movements: [{ id: "movement-A", sourceLineId: "invoice-line-A", warehouseId: "warehouse-A",
    storageLocationId: "shelf-A", inventoryItemId: "item-A", stockLotId: "lot-A", quantity: D(3) }],
  completed: [],
};
const tx = {
  enterpriseRetailInvoiceReturnRequest: { findFirst: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.equal(where.id, "return-A");
    assert.equal(where.checkout.salesInvoiceId, "invoice-A");
    return state.request;
  } },
  enterprisePaymentAllocation: { findMany: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.equal(where.receivableId, "receivable-A");
    assert.equal(where.status, "CONFIRMED");
    assert.equal(state.allocations.length <= 2, true);
    return state.allocations;
  } },
  enterpriseFinancialAccount: { findMany: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    return where.id.in.includes("account-A") ? [{ id: "account-A", siteId: state.accountSiteId || "site-A", currencyCode: "CDF" }] : [];
  } },
  enterpriseStockMovement: { findMany: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.equal(where.sourceEntityType, "EnterpriseSalesInvoice");
    assert.equal(where.sourceEntityId, "invoice-A");
    assert.equal(where.direction, "OUT");
    assert.equal(where.movementType, "SALE_FULFILLMENT");
    assert.equal(where.sourceLineId.in.join(","), "invoice-line-A");
    return state.movements;
  } },
  enterpriseRetailInvoiceReturnLine: { findMany: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.equal(where.checkoutId, "checkout-A");
    assert.equal(where.request.status, "COMPLETED");
    return state.completed;
  } },
};
const source = fs.readFileSync("lib/enterprise/retail/invoice-return-settlement-preflight.ts", "utf8");
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, Promise, Date, Set, Map,
  require: (id) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    return require(id);
  },
});
const preview = () => unit.exports.assertRetailInvoiceReturnSettlementReadinessTx(tx, "tenant", "invoice-A", "return-A");
const ready = await preview();
assert.equal(ready.refundAmount.toFixed(2), "33.33");
assert.equal(ready.siteId, "site-A");
assert.equal(ready.stockLineCount, 1);
assert.equal(ready.stockSourcePlan.length, 1);
assert.equal(ready.stockSourcePlan[0].originalMovementId, "movement-A");
assert.equal(ready.stockSourcePlan[0].storageLocationId, "shelf-A");
assert.equal(ready.stockSourcePlan[0].quantity.toFixed(), "1");
assert.equal(ready.stockSourcePlan[0].stockDisposition, "RESTOCK");
assert.equal(ready.financeSourcePlan.length, 1);
assert.equal(ready.financeSourcePlan[0].allocationId, "allocation-A");
assert.equal(ready.financeSourcePlan[0].paymentId, "payment-A");
assert.equal(ready.financeSourcePlan[0].amount.toFixed(2), "33.33");

// A bounded refund may consume multiple confirmed allocations, in a stable
// sequence, but only up to the requested amount and never from another site.
state.allocations = [
  { ...state.allocations[0], amount: D(10) },
  { ...state.allocations[0], id: "allocation-B", paymentId: "payment-B", amount: D(90) },
];
const splitFinance = await preview();
assert.equal(splitFinance.financeSourcePlan.length, 2);
assert.equal(splitFinance.financeSourcePlan[0].amount.toFixed(2), "10.00");
assert.equal(splitFinance.financeSourcePlan[1].amount.toFixed(2), "23.33");
assert.equal(splitFinance.financeSourcePlan[1].paymentId, "payment-B");
state.allocations = [{ ...state.allocations[0], amount: D("99.999999") }];
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_ALLOCATION_PRECISION_INVALID" });
state.allocations[0].amount = D(100);

// Stock movements have three decimal places, invoice items may have six.
state.request.lines[0].quantity = D("0.0001");
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION" });
state.request.lines[0].quantity = D(1);

// A duplicated or out-of-balance posting must never feed a return.
state.movements[0].quantity = D(4);
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID" });
state.movements[0].quantity = D(3);
state.movements.push({ ...state.movements[0], id: "movement-wrong-depot", warehouseId: "warehouse-B", quantity: D(1) });
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID" });
state.movements.pop();

// Previous completed returns consume the original movement FIFO; a later
// return traces exact remaining source movements without duplicating stock.
state.movements = [
  { ...state.movements[0], quantity: D(2) },
  { ...state.movements[0], id: "movement-B", storageLocationId: "shelf-B", quantity: D(1) },
];
state.completed = [{ checkoutLineId: "checkoutline-A", quantity: D(1), refundAmount: D("33.33"),
  refundNetAmount: D(30), refundTaxAmount: D("3.33") }];
state.request.lines[0].quantity = D(2);
state.request.lines[0].refundAmount = D("66.67");
state.request.lines[0].refundNetAmount = D(60);
state.request.lines[0].refundTaxAmount = D("6.67");
state.request.refundAmount = D("66.67");
const split = await preview();
assert.equal(split.stockSourcePlan.length, 2);
assert.equal(split.stockSourcePlan[0].originalMovementId, "movement-A");
assert.equal(split.stockSourcePlan[0].quantity.toFixed(), "1");
assert.equal(split.stockSourcePlan[1].originalMovementId, "movement-B");
assert.equal(split.stockSourcePlan[1].quantity.toFixed(), "1");
state.request.lines[0].stockDisposition = "DISPOSE";
assert.equal((await preview()).stockSourcePlan[0].stockDisposition, "DISPOSE");
state.request.lines[0].stockDisposition = "RESTOCK";
state.completed = [];
state.request.lines[0].quantity = D(1);
state.request.lines[0].refundAmount = D("33.33");
state.request.lines[0].refundNetAmount = D(30);
state.request.lines[0].refundTaxAmount = D("3.33");
state.request.refundAmount = D("33.33");
state.movements = [{ ...state.movements[0], quantity: D(3) }];

state.request.status = "SUBMITTED";
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_APPROVAL_REQUIRED" });
state.request.status = "APPROVED";
state.request.inspectedByUserId = "requester";
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_APPROVAL_REQUIRED" });
state.request.inspectedByUserId = "inspector";
state.request.decidedByUserId = "someone-else";
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_APPROVAL_REQUIRED" });
state.request.decidedByUserId = "approver";

state.request.refundAmount = D("33.333333");
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_AMOUNT_INVALID" });
state.request.refundAmount = D("33.33");
state.request.lines[0].refundAmount = D("30.00");
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_AMOUNT_INVALID" });
state.request.lines[0].refundAmount = D("33.33");

state.allocations = [{ ...state.allocations[0], payment: { ...state.allocations[0].payment, businessPartyId: "buyer-B" } }];
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_FUNDS_INSUFFICIENT" });
state.allocations = [{ id: "allocation-A", paymentId: "payment-A", amount: D(100), payment: { status: "RECONCILED", direction: "INBOUND", paymentType: "CUSTOMER_PAYMENT",
  businessPartyId: "buyer-A", currencyCode: "CDF", financialAccountId: "account-A" } }];
assert.equal((await preview()).stockLineCount, 1);
state.allocations[0].amount = D(30);
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_FUNDS_INSUFFICIENT" });
state.allocations[0].amount = D(100);
state.accountSiteId = "site-B";
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_FUNDS_INSUFFICIENT" });
state.accountSiteId = "site-A";

state.movements[0].warehouseId = "warehouse-B";
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID" });
state.movements[0].warehouseId = "warehouse-A";
state.movements[0].stockLotId = "lot-B";
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID" });
state.movements[0].stockLotId = "lot-A";
state.movements[0].quantity = D(2);
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID" });
state.movements[0].quantity = D(3);
state.completed = [{ checkoutLineId: "checkoutline-A", quantity: D(3), refundAmount: D(100),
  refundNetAmount: D(90), refundTaxAmount: D(10) }];
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID" });
state.completed = [];

state.request.lines[0].stockDisposition = "RESTOCK";
state.request.checkout.lines[0].inventoryItemId = null;
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_STOCK_INVALID" });
state.request.checkout.lines[0].inventoryItemId = "item-A";
state.request.lines[0].quantity = D(0);
await assert.rejects(preview(), { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID" });

assert.doesNotMatch(source, /tx\.[a-zA-Z]+\.(?:create|update|delete|upsert|createMany|updateMany)\(/,
  "Preflight must remain read-only: it is NOT an accounting, payment or stock settlement");
console.log("HOTFIX #1042 Retail return settlement preflight: independent approvals, exact amounts, Finance sources and original warehouse stock verified; no writes");
