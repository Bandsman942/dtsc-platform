import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const D = (x) => new Prisma.Decimal(x);
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const state = {
  featureEnabled: true, revoked: false, financeAllowed: true, reserved: [],
  existing: false, created: null, saved: null, lines: [], review: null, events: [], operations: [],
  checkout: {
    id: "checkout-A", salesInvoiceId: "invoice-A", siteId: "store-A",
    stockPostedAt: new Date(), invoice: { status: "PAID", currencyCode: "CDF", grandTotal: D(30) },
    lines: [{ id: "line-A", inventoryItemId: "item-A", stockLotId: "lot-A",
      invoiceItem: { quantity: D(3), totalAmount: D(30) } }],
  },
};
const tx = {
  enterpriseRetailConfiguration: {
    findUnique: async () => ({ settingsJson: { invoiceCheckoutEnabled: state.featureEnabled } }),
  },
  enterpriseRetailInvoiceCheckout: { findFirst: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.equal(where.salesInvoiceId, "invoice-A");
    return state.checkout;
  } },
  enterpriseRetailInvoiceReturnLine: {
    findMany: async () => state.reserved,
    createMany: async ({ data }) => {
      state.operations.push("create-lines");
      state.lines = data;
      state.saved = { ...state.created, lines: data };
      return { count: data.length };
    },
  },
  enterpriseRetailInvoiceReturnRequest: {
    findFirst: async ({ where }) => {
      if (where.id && where.checkout) return state.review;
      if (where.id) return state.saved;
      return state.existing ? state.saved : null;
    },
    findMany: async () => state.saved ? [state.saved] : [],
    count: async () => state.saved ? 1 : 0,
    create: async ({ data }) => {
      state.operations.push("create-request");
      state.created = { id: "request-A", revision: 1, ...data };
      return state.created;
    },
    update: async ({ data }) => {
      state.operations.push("approve-request");
      state.review = { ...state.review, status: data.status, revision: state.review.revision + 1 };
      return state.review;
    },
  },
};
const prisma = { ...tx, $transaction: async (fn) => fn(tx) };
const source = fs.readFileSync("lib/enterprise/retail/invoice-returns.ts", "utf8");
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, Promise, Date, Set, Map,
  require: (id) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "zod") return { z: require("zod").z };
    if (id === "@/lib/prisma") return { prisma };
    if (id === "node:crypto") return require("node:crypto");
    if (id === "@/lib/enterprise/accounting/helpers") return {
      publishFinanceEvent: async (_tx, event) => { state.events.push(event.eventType); },
    };
    if (id === "@/lib/enterprise/module-access") return {
      resolveEnterpriseModuleAccess: async ({ moduleCode, action }) => {
        assert.equal(moduleCode, "FINANCE_RECEIVABLES"); assert.equal(action, "approve");
        return { allowed: state.financeAllowed };
      },
    };
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@/lib/enterprise/retail/site-access") return {
      requireRetailSiteCapability: async (_org, user, site, capability) => {
        assert.equal(site, "store-A");
        if ((state.revoked && user === "requester") ||
            (user === "requester" && !["REQUEST_INVOICE_RETURN", "VIEW_SALES"].includes(capability)) ||
            (user === "reviewer" && capability !== "APPROVE_INVOICE_RETURN")) {
          throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
        }
      },
    };
    if (id === "@/lib/enterprise/retail/transaction-retry") return {
      withRetailTransactionRetry: async (fn) => fn(),
    };
    return require(id);
  },
});
const { createRetailInvoiceReturnRequest, decideRetailInvoiceReturnRequest,
  listRetailInvoiceReturnRequests, retailInvoiceReturnRequestSchema } = unit.exports;
const input = { idempotencyKey: "shop-return-001", approverUserId: "reviewer",
  reason: "Produit endommagé", lines: [{ checkoutLineId: "line-A", quantity: "2", stockDisposition: "QUARANTINE" }] };
assert.equal(retailInvoiceReturnRequestSchema.safeParse(input).success, true);
assert.equal(retailInvoiceReturnRequestSchema.safeParse({ ...input, lines: [{ ...input.lines[0], quantity: "2.1234567" }] }).success, false);
const created = await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input);
assert.equal(created.idempotent, false);
assert.equal(created.request.refundAmount.toFixed(), "20");
assert.equal(created.request.lines.length, 1);
assert.equal(created.request.lines[0].checkoutId, "checkout-A");
assert.equal(created.request.lines[0].refundAmount.toFixed(), "20");
assert.deepEqual(state.operations, ["create-request", "create-lines"]);
assert.equal(state.events.length, 1);
state.existing = true;
assert.equal((await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input)).idempotent, true);
await assert.rejects(
  createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", { ...input, reason: "Autre motif" }),
  { code: "RETAIL_INVOICE_RETURN_IDEMPOTENCY_CONFLICT" },
);
state.revoked = true;
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input),
  { code: "RETAIL_SITE_ACCESS_DENIED" });
state.revoked = false;
state.existing = false;
state.reserved = [{ checkoutLineId: "line-A", quantity: D(2), refundAmount: D(20) }];
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input),
  { code: "RETAIL_INVOICE_RETURN_QUANTITY_EXCEEDED" });
state.reserved = [];
state.checkout.stockPostedAt = null;
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input),
  { code: "RETAIL_INVOICE_RETURN_PAID_REQUIRED" });
state.checkout.stockPostedAt = new Date();
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...input, approverUserId: "requester",
}), { code: "RETAIL_INVOICE_RETURN_SELF_APPROVAL_FORBIDDEN" });
state.featureEnabled = false;
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input),
  { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
state.featureEnabled = true;
state.review = { id: "request-A", revision: 1, checkoutId: "checkout-A", status: "SUBMITTED",
  requestedByUserId: "requester", approverUserId: "reviewer", checkout: { siteId: "store-A" } };
state.financeAllowed = false;
await assert.rejects(decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", { revision: 1, decision: "APPROVE" }),
  { code: "RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE" });
state.financeAllowed = true;
await assert.rejects(decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "requester", { revision: 1, decision: "APPROVE" }),
  { code: "RETAIL_SITE_ACCESS_DENIED" });
await assert.rejects(decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", { revision: 1, decision: "REJECT", reason: "non" }),
  { code: "RETAIL_INVOICE_RETURN_REJECTION_REASON_REQUIRED" });
const approved = await decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", { revision: 1, decision: "APPROVE" });
assert.equal(approved.status, "APPROVED");
assert.equal(approved.revision, 2);
assert.equal(state.operations.includes("approve-request"), true);
assert.equal(state.events.includes("RETAIL_INVOICE_RETURN_APPROVED"), true);
const listing = await listRetailInvoiceReturnRequests("tenant", "invoice-A", "requester", 1);
assert.equal(listing.pagination.pageSize, 25);

const migration = fs.readFileSync("prisma/migrations/20261107163000_retail_invoice_return_requests/migration.sql", "utf8");
assert.match(migration, /FOREIGN KEY \("organizationId", "returnRequestId", "checkoutId"\)/);
assert.match(migration, /FOREIGN KEY \("organizationId", "checkoutId", "checkoutLineId"\)/);
assert.match(migration, /CHECK \("status" IN/);
const schema = fs.readFileSync("prisma/enterprise-retail-invoice-checkout.prisma", "utf8");
assert.match(schema, /model EnterpriseRetailInvoiceReturnRequest/);
assert.match(schema, /model EnterpriseRetailInvoiceReturnLine/);
assert.match(schema, /@@unique\(\[organizationId, checkoutId, id\]/);
const route = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/route.ts", "utf8");
assert.match(route, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS", "submit", \{ mutation: true/);
assert.match(route, /writeAuditLog/);
const decisionRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/decision/route.ts", "utf8");
assert.match(decisionRoute, /writeAuditLog/);
assert.doesNotMatch(source, /enterpriseSalesCreditNote\.create|enterprisePayment\.create|applyStockMovementTx/,
  "Request and approval must not mutate canonical money or stock");
console.log("HOTFIX #1042: Retail invoice return requests are tenant/site scoped, serializable, independently approved and finance/stock-inert");
