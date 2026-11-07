import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const source = read("lib/enterprise/retail/invoice-stock-holds.ts");
const checkout = read("lib/enterprise/retail/invoice-checkout.ts");
const movement = read("lib/enterprise/inventory/service.ts");
const reservations = read("lib/enterprise/inventory/reservations.ts");
const lotSelector = read("app/api/enterprise/[organizationId]/retail/stock-lots/route.ts");
const productSearch = read("app/api/enterprise/[organizationId]/retail/products/search/route.ts");

class Decimal {
  constructor(value) { this.value = Number(value instanceof Decimal ? value.value : value); }
  toFixed() { return String(this.value); }
  plus(value) { return new Decimal(this.value + new Decimal(value).value); }
  minus(value) { return new Decimal(this.value - new Decimal(value).value); }
  lessThan(value) { return this.value < new Decimal(value).value; }
  greaterThan(value) { return this.value > new Decimal(value).value; }
  isPositive() { return this.value >= 0; } // Decimal.js treats zero as non-negative.
}

const module = { exports: {} };
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(javascript, {
  exports: module.exports,
  require(name) {
    assert.equal(name, "@prisma/client");
    return { Prisma: { Decimal } };
  },
});

const { readActiveRetailInvoiceStockHoldsTx } = module.exports;
let captured;
const tx = {
  enterpriseRetailInvoiceCheckoutLine: {
    async findMany(args) {
      captured = args;
      return [
        { inventoryItemId: "item-1", stockLotId: "lot-1", checkout: { warehouseId: "store-a" }, invoiceItem: { quantity: "4.25" } },
        { inventoryItemId: "item-2", stockLotId: null, checkout: { warehouseId: "store-a" }, invoiceItem: { quantity: "3" } },
      ];
    },
  },
};

const result = await readActiveRetailInvoiceStockHoldsTx(tx, {
  organizationId: "tenant-a", warehouseId: "store-a", inventoryItemIds: ["item-1", "item-2"], excludeSalesInvoiceId: "paying-invoice",
});
assert.equal(captured.where.organizationId, "tenant-a");
assert.equal(captured.where.checkout.warehouseId, "store-a");
assert.equal(captured.where.checkout.salesInvoiceId.not, "paying-invoice");
assert.equal(captured.where.checkout.stockPostedAt, null);
assert.deepEqual(Array.from(captured.where.checkout.invoice.status.notIn), ["CANCELLED", "VOIDED"]);
assert.deepEqual(Array.from(captured.where.inventoryItemId.in), ["item-1", "item-2"]);
assert.equal(result[0].quantity.toFixed(), "4.25");
assert.equal(result[1].stockLotId, null);
assert.equal(result[1].warehouseId, "store-a");
captured = null;
assert.deepEqual(Array.from(await readActiveRetailInvoiceStockHoldsTx(tx, { organizationId: "tenant-b", inventoryItemIds: [] })), []);
assert.equal(captured, null, "Empty inventory selection must not query another tenant");

// Execute the stock movement boundary with a deterministic transaction fake.
// The check must run even if a caller reaches the generic Inventory API.
class DomainError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
let outstandingHold = new Decimal(3);
let moved = 0;
const inventoryModule = { exports: {} };
const serviceJavaScript = ts.transpileModule(movement, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(serviceJavaScript, {
  exports: inventoryModule.exports,
  require(name) {
    if (name === "node:crypto") return { randomUUID: () => "test-uuid" };
    if (name === "@prisma/client") return { Prisma: { Decimal } };
    if (name === "@/lib/enterprise/common/errors") return { EnterpriseDomainError: DomainError, EnterpriseDomainConflictError: DomainError };
    if (name === "@/lib/enterprise/crm-sales/helpers") return { publishEnterpriseEvent: async () => {} };
    if (name === "@/lib/enterprise/retail/invoice-stock-holds") return {
      readActiveRetailInvoiceStockHoldsTx: async (_tx, args) => {
        assert.equal(args.organizationId, "tenant-a");
        assert.equal(args.warehouseId, "store-a");
        return args.excludeSalesInvoiceId === "invoice-paying" ? [] : [{ inventoryItemId: "item-1", stockLotId: "lot-1", warehouseId: "store-a", quantity: outstandingHold }];
      },
    };
    if (name === "@/lib/enterprise/inventory/approval") return {};
    if (name === "@/lib/enterprise/retail/inventory-policy") return {};
    // Inventory now imports the Retail site guard for stock transfer writes.
    // This test exercises movement reservation only; site authorization has
    // its own negative/positive cases in qa-hotfix-1042-site-staff.mjs.
    if (name === "@/lib/enterprise/retail/site-access") return { requireRetailSiteCapability: async () => {} };
    if (name === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError: class extends Error {} };
    if (name === "@/lib/prisma") return { prisma: {} };
    throw Error(`Unexpected import: ${name}`);
  },
});
const balance = { id: "balance-1", revision: 1, quantityOnHand: new Decimal(5), quantityReserved: new Decimal(0) };
const movementTx = {
  enterpriseStockMovement: {
    findFirst: async () => null,
    create: async () => { moved++; return { id: "movement-1" }; },
  },
  enterpriseInventoryItem: { findFirst: async () => ({ allowNegativeStock: false, catalogItem: { trackInventory: true } }) },
  enterpriseWarehouse: { findFirst: async () => ({ id: "store-a" }) },
  enterpriseStockLot: { findFirst: async () => ({ id: "lot-1", storageLocationId: null }) },
  enterpriseInventoryBalance: {
    findFirst: async () => balance,
    findMany: async () => [balance],
    updateMany: async () => ({ count: 1 }),
  },
};
const outbound = { inventoryItemId: "item-1", warehouseId: "store-a", stockLotId: "lot-1", quantity: 3, direction: "OUT", movementType: "SALE_FULFILLMENT", idempotencyKey: "test-1" };
await assert.rejects(inventoryModule.exports.applyStockMovementTx(movementTx, "tenant-a", "actor", outbound), { code: "RETAIL_INVOICE_STOCK_HELD" });
assert.equal(moved, 0, "Unpaid customer's quantity must never be consumed by a second sale");
await assert.doesNotReject(inventoryModule.exports.applyStockMovementTx(movementTx, "tenant-a", "actor", { ...outbound, quantity: 2 }));
assert.equal(moved, 1, "Movement of only genuinely free units is permitted");
await assert.doesNotReject(inventoryModule.exports.applyStockMovementTx(movementTx, "tenant-a", "actor", outbound, { consumingRetailInvoiceId: "invoice-paying" }));
assert.equal(moved, 2, "The Finance settlement path may consume only its own promised quantity");
outstandingHold = new Decimal(0);
await assert.doesNotReject(inventoryModule.exports.applyStockMovementTx(movementTx, "tenant-a", "actor", outbound));
assert.equal(moved, 3, "Cancelled invoice must no longer reduce stock availability");

// All reservation sources must share the same canonical invoice lines.
assert.match(checkout, /readActiveRetailInvoiceStockHoldsTx\(tx, \{ organizationId, warehouseId: input\.warehouseId/);
assert.match(checkout, /\.minus\(retailHolds\.filter\(/);
assert.match(checkout, /excludeSalesInvoiceId: checkout\.salesInvoiceId/);
assert.match(checkout, /consumingRetailInvoiceId: checkout\.salesInvoiceId/);
assert.match(checkout, /TransactionIsolationLevel\.Serializable/);

// Every outbound stock movement must preserve the other invoices' promises.
assert.match(movement, /if \(input\.direction === "OUT"\) \{/);
assert.match(movement, /readActiveRetailInvoiceStockHoldsTx\(tx, \{/);
assert.match(movement, /excludeSalesInvoiceId: internal\?\.consumingRetailInvoiceId/);
assert.match(movement, /physicallyFree\.minus\(input\.quantity\)\.lessThan\(held\)/);
assert.match(movement, /RETAIL_INVOICE_STOCK_HELD/);

// Sales orders and availability must not ignore open Retail invoices.
assert.match(reservations, /retailInvoiceHoldQuantity: string/);
assert.match(reservations, /readActiveRetailInvoiceStockHoldsTx\(prisma,/);
assert.match(reservations, /readActiveRetailInvoiceStockHoldsTx\(tx,/);
assert.match(reservations, /onHand\.minus\(legacyReserved\)\.minus\(reserved\)\.minus\(retailHeld\)/);
assert.match(lotSelector, /readActiveRetailInvoiceStockHoldsTx\(prisma, \{ organizationId, warehouseId, inventoryItemIds: itemIds \}\)/);
assert.match(lotSelector, /\.minus\(heldByLot\.get\(lot\.id\)/);
assert.match(productSearch, /readActiveRetailInvoiceStockHoldsTx\(prisma, \{/);
assert.match(productSearch, /\.minus\(heldByItem\.get\(inventoryItem\.id\)/);

console.log("PASS #1042: invoice stock promises are canonical, site/lot scoped, held across all outbound channels and released on Finance cancellation");
