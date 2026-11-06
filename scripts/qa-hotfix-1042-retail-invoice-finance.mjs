import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const decimal = (value) => new Prisma.Decimal(value);
const state = { existing: null, checkout: null, invoiceCreated: false, movements: [], updated: false, settings: {} };
const tx = {
  enterpriseRetailInvoiceCheckout: {
    findFirst: async ({ where }) => where.idempotencyKey ? state.existing : state.checkout,
    update: async () => { state.updated = true; },
  },
  organization: {
    findFirst: async () => ({ id: "tenant", timezone: "Africa/Kinshasa" }),
    findUnique: async () => ({ timezone: "Africa/Kinshasa" }),
  },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: state.settings }) },
  enterpriseWarehouse: { findFirst: async () => ({ id: "warehouse" }) },
  enterpriseCatalogItem: { findMany: async () => [{ id: "product", name: "Produit", currency: "CDF", trackInventory: true }] },
  enterpriseInventoryItem: { findMany: async () => [{ id: "inventory", catalogItemId: "product" }] },
  enterpriseInventoryBalance: { findMany: async () => [{ id: "balance", inventoryItemId: "inventory", storageLocationId: null, stockLotId: null, quantityOnHand: decimal(4), quantityReserved: decimal(0) }] },
  enterpriseInventoryReservation: { findMany: async () => [] },
  enterpriseStockLot: { findMany: async () => [] },
};
const prisma = {
  enterpriseRetailInvoiceCheckout: { findFirst: async () => state.existing },
  $transaction: async (callback) => callback(tx),
};
const serviceSource = fs.readFileSync("lib/enterprise/retail/invoice-checkout.ts", "utf8");
const compiled = ts.transpileModule(serviceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const unit = { exports: {} };
vm.runInNewContext(compiled, {
  module: unit, exports: unit.exports, Promise, Set, Map, Date,
  require: (id) => {
    if (id === "@/lib/prisma") return { prisma };
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@/lib/enterprise/retail/constants") return { RETAIL_SECTOR_CODE: "COMMERCE_RETAIL" };
    if (id === "@/lib/enterprise/retail/commercial-engine") return { resolveRetailCommercialPricingDecisions: async () => [{ catalogItemId: "product", lineTotal: decimal(10) }] };
    if (id === "@/lib/enterprise/retail/inventory-policy") return { assertRetailLotPolicyTx: async () => {} };
    if (id === "@/lib/enterprise/retail/site-access") return { requireRetailSiteCapability: async () => {} };
    if (id === "@/lib/enterprise/inventory/service") return { applyStockMovementTx: async (_tx, _org, _actor, movement) => { state.movements.push(movement); } };
    if (id === "@/lib/enterprise/accounting/receivables-service") return { createSalesInvoiceTx: async () => { state.invoiceCreated = true; return {}; } };
    return require(id);
  },
});

const { prepareRetailInvoice, retailInvoicePrepareSchema, postPaidRetailInvoiceStockTx } = unit.exports;
const input = {
  idempotencyKey: "client-retry-001", siteId: "site", warehouseId: "warehouse", currencyCode: "CDF",
  lines: [{ catalogItemId: "product", quantity: 2 }],
};
assert.equal(retailInvoicePrepareSchema.safeParse(input).success, true);
assert.equal(retailInvoicePrepareSchema.safeParse({ ...input, lines: [{ catalogItemId: "product", quantity: -2 }] }).success, false);
state.existing = { id: "checkout", idempotencyKey: input.idempotencyKey, requestFingerprint: require("node:crypto").createHash("sha256").update(JSON.stringify(input)).digest("hex"), invoice: { id: "finance-invoice" } };
const repeated = await prepareRetailInvoice("tenant", "owner", input);
assert.equal(repeated.idempotent, true, "Retry returns the same canonical invoice");
assert.equal(state.invoiceCreated, false, "Retry cannot issue a second Finance invoice");
await assert.rejects(prepareRetailInvoice("tenant", "owner", { ...input, currencyCode: "USD" }), { code: "RETAIL_INVOICE_IDEMPOTENCY_COLLISION" });
state.existing = null;
await assert.rejects(prepareRetailInvoice("tenant", "owner", input), { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
assert.equal(state.invoiceCreated, false, "Owner-only draft is disabled for existing tenants");

const checkout = {
  id: "checkout", salesInvoiceId: "finance-invoice", warehouseId: "warehouse", stockPostedAt: null,
  invoice: { id: "finance-invoice", status: "ISSUED", outstandingAmount: decimal(20) },
  lines: [{ id: "line", inventoryItemId: "inventory", stockLotId: null, invoiceItemId: "finance-line", invoiceItem: { quantity: decimal(2) } }],
};
state.checkout = checkout;
await assert.rejects(postPaidRetailInvoiceStockTx(tx, "tenant", "finance-invoice", "cashier"), { code: "RETAIL_INVOICE_NOT_FULLY_PAID" });
assert.equal(state.movements.length, 0, "No stock exit before confirmed full payment allocation");
checkout.invoice = { ...checkout.invoice, status: "PAID", outstandingAmount: decimal(0) };
await postPaidRetailInvoiceStockTx(tx, "tenant", "finance-invoice", "cashier");
assert.equal(state.movements.length, 1, "One stock exit after full settlement");
assert.equal(state.movements[0].movementType, "SALE_FULFILLMENT");
assert.equal(state.movements[0].sourceEntityType, "EnterpriseSalesInvoice");
assert.equal(state.movements[0].sourceEntityId, "finance-invoice");
assert.equal(state.movements[0].quantity, 2);
assert.equal(state.updated, true);
checkout.stockPostedAt = new Date();
await postPaidRetailInvoiceStockTx(tx, "tenant", "finance-invoice", "cashier");
assert.equal(state.movements.length, 1, "Repeated posting must be idempotent");

const financeService = fs.readFileSync("lib/enterprise/accounting/payments-service.ts", "utf8");
assert.match(financeService, /postPaidRetailInvoiceStockTx\(tx, organizationId, receivable\.salesInvoiceId, actorUserId\)/);
assert.match(financeService, /if \(outstanding\.isZero\(\)\) \{/);
assert.match(financeService, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
const route = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/route.ts", "utf8");
assert.match(route, /RETAIL_OWNER_ROLES/);
assert.match(route, /checkoutReady: false/);
assert.match(route, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS"/);
assert.match(route, /writeAuditLog\(/);
const schema = fs.readFileSync("prisma/enterprise-retail-invoice-checkout.prisma", "utf8");
assert.match(schema, /@@unique\(\[organizationId, idempotencyKey\]\)/);
assert.match(schema, /@relation\(fields: \[organizationId, salesInvoiceId\], references: \[organizationId, id\]/);
assert.doesNotMatch(schema, /grandTotal|amountPaid|outstandingAmount|financialAccountId/, "Retail must not create a competing financial ledger");
console.log("HOTFIX #1042 Finance bridge: retry/collision, opt-in guard, no early stock, full-payment stock posting, idempotency, owner scope, canonical Finance schema passed.");
