import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";
const qaQuantityPolicy = workflowTestLoader({})("@/lib/enterprise/inventory/quantity-policy");
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const lotTools = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/enterprise/inventory/lot-allocation.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: lotTools.exports, require: (id) => id === "@/lib/enterprise/inventory/quantity-policy" ? qaQuantityPolicy : id === "@prisma/client" ? { Prisma } : require(id) });

const D = (x) => new Prisma.Decimal(x);
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const state = {
  featureEnabled: true, revoked: false, inspectorRevoked: false, allowExtraStockCapability: false,
  financeAllowed: true, reserved: [], stockUnitScale: 6,
  existing: false, created: null, saved: null, lines: [], review: null, events: [], operations: [],
  checkout: {
    id: "checkout-A", salesInvoiceId: "invoice-A", siteId: "store-A",
    stockPostedAt: new Date(), invoice: { status: "PAID", currencyCode: "CDF", grandTotal: D(30),
      amountPaid: D(30), amountCredited: D(0), outstandingAmount: D(0) },
    lines: [{ id: "line-A", inventoryItemId: "item-A", stockLotId: "lot-A",
      invoiceItem: { quantity: D(3), netAmount: D(27), taxAmount: D(3), totalAmount: D(30) } }],
  },
};
const tx = {
  enterpriseInventoryItem: { findMany: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.ok(where.id.in.includes("item-A"));
    return [{ id: "item-A", catalogItem: { unitOfMeasure: { decimalScale: state.stockUnitScale, symbol: "kg" } } }];
  } },
  enterpriseRetailConfiguration: {
    findUnique: async () => ({ settingsJson: { invoiceCheckoutEnabled: state.featureEnabled } }),
  },
  enterpriseRetailInvoiceCheckout: { findFirst: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.equal(where.salesInvoiceId, "invoice-A");
    return state.checkout;
  } },
  enterpriseRetailInvoiceReturnLine: {
    findMany: async ({ where }) => {
      assert.equal(where.request.status.in.join(","), "SUBMITTED,INSPECTED,APPROVED,FINANCE_PENDING,REFUND_PENDING,COMPLETED");
      return state.reserved;
    },
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
    findMany: async ({ select }) => {
      assert.ok(select.refundLegs?.select?.refundPayment?.select?.status,
        "Retail return list must select each canonical refund payment approval");
      return state.saved ? [{ ...state.saved,
        lines: (state.saved.lines || []).map((line) => ({ ...line, checkoutLine: { inventoryItemId: "item-A" } })),
        refundLegs: state.listRefundLegs || [],
        refundPayment: state.listRefundPayment || null,
        salesCreditNote: state.listCreditNote || null }] : [];
    },
    count: async () => state.saved ? 1 : 0,
    create: async ({ data }) => {
      state.operations.push("create-request");
      state.created = { id: "request-A", revision: 1, ...data };
      return state.created;
    },
    update: async ({ data }) => {
      state.operations.push(data.status === "INSPECTED" ? "inspect-request" : "decide-request");
      state.review = { ...state.review, status: data.status, revision: state.review.revision + 1,
        inspectedByUserId: data.inspectedByUserId ?? state.review.inspectedByUserId,
        inspectedAt: data.inspectedAt ?? state.review.inspectedAt,
        inspectionNotes: data.inspectionNotes ?? state.review.inspectionNotes };
      return state.review;
    },
  },
  organizationMember: {
    findFirst: async () => ({ role: "CASHIER" }),
    findMany: async () => [
      { userId: "reviewer", role: "CASHIER", positionTitle: "Responsable Finance", user: { name: "Finance" } },
      { userId: "inspector", role: "CASHIER", positionTitle: "Responsable stock", user: { name: "Stock" } },
    ],
  },
  enterpriseRetailSiteAssignment: {
    findUnique: async ({ where }) => ({ isActive: true, roleCode: "CASHIER", permissionsJson: {
      requester: ["VIEW_SALES", "REQUEST_INVOICE_RETURN"],
      reviewer: ["VIEW_SALES", "APPROVE_INVOICE_RETURN"],
      inspector: ["VIEW_SALES", "MANAGE_STOCK"],
    }[where.organizationId_siteId_userId.userId] || [] }),
    findMany: async () => [
      { userId: "reviewer", roleCode: "CASHIER", permissionsJson: ["APPROVE_INVOICE_RETURN"] },
      { userId: "inspector", roleCode: "CASHIER", permissionsJson: ["MANAGE_STOCK"] },
    ],
  },
  enterpriseSite: { findFirst: async ({ where }) => where.organizationId === "tenant" && where.id === "store-A" ? { id: "store-A" } : null },
};
const prisma = { ...tx, $transaction: async (fn) => fn(tx) };
const source = fs.readFileSync("lib/enterprise/retail/invoice-returns.ts", "utf8");
const returnUi = fs.readFileSync("components/enterprise/professional/retail-invoice-return-dialog.tsx", "utf8");
const retailErrors = fs.readFileSync("lib/enterprise/retail/http.ts", "utf8");
assert.match(retailErrors, /RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION: "La quantité/);
assert.match(returnUi, /inventoryQuantityStep\(line\.decimalScale\)/);
assert.match(returnUi, /isInventoryQuantityInputValid\(batch\.quantity, line\.decimalScale\)/);
assert.match(returnUi, /sum !== inventoryQuantityMicrounits\(line\.quantity\)/);
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, Promise, Date, Set, Map,
  require: (id) => {
    if (id === "@/lib/enterprise/inventory/lot-allocation") return lotTools.exports;
    if (id === "@/lib/enterprise/inventory/quantity-policy") return qaQuantityPolicy;
    if (id === "@prisma/client") return { Prisma };
    if (id === "zod") return { z: require("zod").z };
    if (id === "@/lib/prisma") return { prisma };
    if (id === "node:crypto") return require("node:crypto");
    if (id === "@/lib/enterprise/accounting/helpers") return {
      publishFinanceEvent: async (_tx, event) => { state.events.push(event.eventType); },
    };
    if (id === "@/lib/enterprise/accounting/currency") return {
      resolveExchangeRateDetails: async () => { throw new Error("UNEXPECTED_EXPRESS_FX_IN_STANDARD_RETURN_FIXTURE"); },
    };
    if (id === "@/lib/enterprise/module-access") return {
      resolveEnterpriseModuleAccess: async ({ moduleCode, action }) => {
        assert.ok(["FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"].includes(moduleCode)); assert.equal(action, "approve");
        return { allowed: state.financeAllowed };
      },
      resolveEnterpriseModuleCapabilities: async () => ({
        canCreate: state.financeAllowed, canSubmit: state.financeAllowed,
        canWrite: state.financeAllowed, canManage: state.financeAllowed,
      }),
    };
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@/lib/enterprise/retail/site-access") return {
      RETAIL_OWNER_ROLES: new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]),
      siteStaffCapabilities: (_role, permissions) => permissions || [],
      // Historical regression fixtures carry NO owner-granted self-return permission.
      hasRetailSelfApprovalGrant: async () => false,
      requireRetailSiteCapability: async (_org, user, site, capability) => {
        assert.equal(site, "store-A");
        if ((state.revoked && user === "requester") ||
            (state.inspectorRevoked && user === "inspector") ||
            (user === "requester" && !["REQUEST_INVOICE_RETURN", "VIEW_SALES"].includes(capability) &&
              !(state.allowExtraStockCapability && capability === "MANAGE_STOCK")) ||
            (user === "reviewer" && !["APPROVE_INVOICE_RETURN", "VIEW_SALES"].includes(capability) &&
              !(state.allowExtraStockCapability && capability === "MANAGE_STOCK")) ||
            (user === "inspector" && !["MANAGE_STOCK", "VIEW_SALES"].includes(capability))) {
          throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
        }
      },
    };
    if (id === "@/lib/enterprise/retail/transaction-retry") return {
      withRetailTransactionRetry: async (fn) => fn(),
    };
    // Legacy fixture never activates the new opt-in policy. Keep the old
    // independent-validator contract: no self-inspection, no auto-posting.
    if (id === "@/lib/enterprise/retail/invoice-return-policy") return {
      readRetailInvoiceReturnPolicy: () => ({ version: 1, mode: "STANDARD",
        allowRequesterInspection: false, allowDelegatedSelfApproval: false,
        autoPostCreditNote: false, promptImmediateRefund: false, scope: "ALL_SITES",
        expressRefundLimitAmount: 100, expressRefundLimitCurrency: "USD" }),
      readRetailInvoiceReturnPolicySnapshot: () => ({ version: 1, mode: "STANDARD",
        allowRequesterInspection: false, allowDelegatedSelfApproval: false,
        autoPostCreditNote: false, promptImmediateRefund: false, scope: "ALL_SITES",
        expressRefundLimitAmount: 100, expressRefundLimitCurrency: "USD" }),
      canSelfInspectRetailReturn: () => false,
    };
    if (id === "@/lib/enterprise/retail/invoice-return-unpaid-express") return {
      settleUnpaidRetailInvoiceCreditTx: async () => null,
    };
    // This historical fixture runs strictly in STANDARD mode. Preserve a
    // failing guard if a new express refund path is ever reached, rather
    // than silently granting Finance or stock privileges inside the VM.
    if (id === "@/lib/enterprise/retail/invoice-return-express-authorization") return {
      assertRetailExpressReturnAuthorizationTx: async () => {
        throw new Error("UNEXPECTED_EXPRESS_RETURN_IN_STANDARD_FIXTURE");
      },
    };
    if (id === "@/lib/enterprise/retail/invoice-return-finance") return {
      prepareRetailInvoiceReturnFinanceTx: async () => {
        throw new Error("UNEXPECTED_EXPRESS_FINANCE_PREPARE_IN_STANDARD_FIXTURE");
      },
      settleRetailInvoiceReturnFinanceTx: async () => {
        throw new Error("UNEXPECTED_EXPRESS_FINANCE_SETTLEMENT_IN_STANDARD_FIXTURE");
      },
    };
    return require(id);
  },
});
const { createRetailInvoiceReturnRequest, decideRetailInvoiceReturnRequest,
  inspectRetailInvoiceReturnRequest, listRetailInvoiceReturnRequests, listRetailInvoiceReturnApprovers,
  retailInvoiceReturnRequestSchema, retailInvoiceReturnInspectionSchema } = unit.exports;
const input = { idempotencyKey: "shop-return-001", approverUserId: "reviewer",
  reason: "Produit endommagé", lines: [{ checkoutLineId: "line-A", quantity: "2", stockDisposition: "QUARANTINE" }] };
assert.equal(retailInvoiceReturnRequestSchema.safeParse(input).success, true);
assert.equal(retailInvoiceReturnRequestSchema.safeParse({ ...input, lines: [{ ...input.lines[0], quantity: "0" }] }).success, false);
assert.equal(retailInvoiceReturnRequestSchema.safeParse({ ...input, lines: [{ ...input.lines[0], quantity: "0.000000" }] }).success, false);
assert.equal(retailInvoiceReturnRequestSchema.safeParse({ ...input, lines: [{ ...input.lines[0], quantity: "invalid" }] }).success, false);
assert.equal(retailInvoiceReturnRequestSchema.safeParse({ ...input, lines: [{ ...input.lines[0], quantity: "2.1234567" }] }).success, false);
const created = await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input);
assert.equal(created.idempotent, false);
assert.equal(created.request.refundAmount.toFixed(), "20");
assert.equal(created.request.lines.length, 1);
assert.equal(created.request.lines[0].checkoutId, "checkout-A");
assert.equal(created.request.lines[0].refundAmount.toFixed(), "20");
assert.equal(created.request.lines[0].refundNetAmount.toFixed(), "18");
assert.equal(created.request.lines[0].refundTaxAmount.toFixed(), "2");
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
state.reserved = [{ checkoutLineId: "line-A", quantity: D(2), refundAmount: D(20), refundNetAmount: D(18), refundTaxAmount: D(2) }];
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input),
  { code: "RETAIL_INVOICE_RETURN_QUANTITY_EXCEEDED" });
state.reserved = [];
// #1187: an unfulfilled invoice may be credited even when nothing was paid.
// A physical RESTOCK/QUARANTINE/DISPOSE claim is still forbidden before delivery.
state.checkout.stockPostedAt = null;
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input),
  { code: "RETAIL_INVOICE_RETURN_STOCK_DISPOSITION_INVALID" });
const originalInvoice = state.checkout.invoice;
const originalSaved = state.saved, originalCreated = state.created, originalLines = state.lines;
const operationsBeforeUnfulfilled = state.operations.length, eventsBeforeUnfulfilled = state.events.length;
state.checkout.invoice = { ...originalInvoice, status: "ISSUED", amountPaid: D(0), outstandingAmount: D(30) };
const unfulfilledInput = {
  ...input, idempotencyKey: "shop-return-not-delivered-001",
  lines: [{ ...input.lines[0], stockDisposition: "UNDELIVERED_CREDIT" }],
};
const unfulfilled = await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", unfulfilledInput);
assert.equal(unfulfilled.request.refundAmount.toFixed(2), "20.00");
assert.equal(unfulfilled.request.lines[0].stockDisposition, "UNDELIVERED_CREDIT");
assert.equal(unfulfilled.request.status, "SUBMITTED");
state.checkout.invoice = originalInvoice;
state.checkout.stockPostedAt = new Date();
state.saved = originalSaved; state.created = originalCreated; state.lines = originalLines;
state.operations.length = operationsBeforeUnfulfilled;
state.events.length = eventsBeforeUnfulfilled;
state.stockUnitScale = 0;
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...input, idempotencyKey: "shop-return-stock-unit-001",
  lines: [{ ...input.lines[0], quantity: "0.5" }],
}), { code: "RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION" });
state.stockUnitScale = 6;
const sixPlaces = await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...input, idempotencyKey: "shop-return-valid-micro-001",
  lines: [{ ...input.lines[0], quantity: "0.123456" }],
});
assert.equal(sixPlaces.request.lines[0].quantity.toFixed(), "0.123456");
state.saved = originalSaved; state.created = originalCreated; state.lines = originalLines;
state.operations.length = operationsBeforeUnfulfilled;
state.events.length = eventsBeforeUnfulfilled;
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...input, idempotencyKey: "shop-return-stock-precision-001",
  lines: [{ ...input.lines[0], quantity: "0.0000001" }],
}), { code: "RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION" });
// Physical precision does not waive the canonical currency minor-unit guard.
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...input, idempotencyKey: "shop-return-micro-money-001",
  lines: [{ ...input.lines[0], quantity: "0.000001" }],
}), { code: "RETAIL_INVOICE_RETURN_AMOUNT_BELOW_MINOR_UNIT" });
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...input, approverUserId: "requester",
}), { code: "RETAIL_INVOICE_RETURN_SELF_APPROVAL_FORBIDDEN" });
state.featureEnabled = false;
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", input),
  { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
state.featureEnabled = true;
state.review = { id: "request-A", revision: 1, checkoutId: "checkout-A", status: "SUBMITTED",
  requestedByUserId: "requester", approverUserId: "reviewer",
  lines: [{ checkoutLine: { inventoryItemId: "item-A" } }],
  checkout: { siteId: "store-A", stockPostedAt: new Date(), invoice: { status: "PAID" } } };
state.financeAllowed = false;
await assert.rejects(decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", { revision: 1, decision: "APPROVE" }),
  { code: "RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE" });
state.financeAllowed = true;
await assert.rejects(decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", { revision: 1, decision: "APPROVE" }),
  { code: "RETAIL_INVOICE_RETURN_REVISION_CONFLICT" });
await assert.rejects(decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "requester", { revision: 1, decision: "APPROVE" }),
  { code: "RETAIL_SITE_ACCESS_DENIED" });
await assert.rejects(decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", { revision: 1, decision: "REJECT", reason: "non" }),
  { code: "RETAIL_INVOICE_RETURN_REJECTION_REASON_REQUIRED" });
assert.equal(retailInvoiceReturnInspectionSchema.safeParse({ revision: 1, receivedAndInspected: false, notes: "Contrôle physique des articles" }).success, false);
await assert.rejects(inspectRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "requester", {
  revision: 1, receivedAndInspected: true, notes: "Contrôle physique des articles",
}), { code: "RETAIL_SITE_ACCESS_DENIED" });
await assert.rejects(inspectRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", {
  revision: 1, receivedAndInspected: true, notes: "Contrôle physique des articles",
}), { code: "RETAIL_SITE_ACCESS_DENIED" });
state.allowExtraStockCapability = true;
await assert.rejects(inspectRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "requester", {
  revision: 1, receivedAndInspected: true, notes: "Contrôle physique des articles",
}), { code: "RETAIL_INVOICE_RETURN_INSPECTOR_INELIGIBLE" });
await assert.rejects(inspectRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", {
  revision: 1, receivedAndInspected: true, notes: "Contrôle physique des articles",
}), { code: "RETAIL_INVOICE_RETURN_INSPECTOR_INELIGIBLE" });
state.allowExtraStockCapability = false;
state.inspectorRevoked = true;
await assert.rejects(inspectRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "inspector", {
  revision: 1, receivedAndInspected: true, notes: "Contrôle physique des articles",
}), { code: "RETAIL_SITE_ACCESS_DENIED" });
state.inspectorRevoked = false;
const inspected = await inspectRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "inspector", {
  revision: 1, receivedAndInspected: true, notes: "Articles reçus et vérifiés physiquement",
});
assert.equal(inspected.status, "INSPECTED");
assert.equal(inspected.inspectedByUserId, "inspector");
await assert.rejects(inspectRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "inspector", {
  revision: 1, receivedAndInspected: true, notes: "Contrôle physique des articles",
}), { code: "RETAIL_INVOICE_RETURN_REVISION_CONFLICT" });
const approved = await decideRetailInvoiceReturnRequest("tenant", "invoice-A", "request-A", "reviewer", { revision: 2, decision: "APPROVE" });
assert.equal(approved.status, "APPROVED");
assert.equal(approved.revision, 3);
assert.equal(state.operations.includes("inspect-request"), true);
assert.equal(state.operations.includes("decide-request"), true);
assert.equal(state.events.includes("RETAIL_INVOICE_RETURN_INSPECTED"), true);
assert.equal(state.events.includes("RETAIL_INVOICE_RETURN_APPROVED"), true);
const listing = await listRetailInvoiceReturnRequests("tenant", "invoice-A", "requester", 1);
assert.equal(listing.pagination.pageSize, 25);
assert.equal(listing.canRequest, true);
assert.equal(listing.items[0].canInspect, false);
assert.equal(listing.items[0].canDecide, false);
assert.equal("requestedByUserId" in listing.items[0], false);
assert.equal("approverUserId" in listing.items[0], false);
assert.equal("idempotencyKey" in listing.items[0], false);
assert.equal("requestFingerprint" in listing.items[0], false);
assert.equal(listing.items[0].paymentApprovalTotal, 0);
assert.equal(listing.items[0].paymentApprovalCount, 0);
const reviewerList = await listRetailInvoiceReturnRequests("tenant", "invoice-A", "reviewer", 1);
assert.equal(reviewerList.items[0].canDecide, true);
assert.equal(reviewerList.items[0].canInspect, false);
assert.equal(reviewerList.canRequest, false);
const inspectorList = await listRetailInvoiceReturnRequests("tenant", "invoice-A", "inspector", 1);
assert.equal(inspectorList.items[0].canInspect, true);
assert.equal(inspectorList.items[0].canDecide, false);
// A legacy single-account refund has no legs; multi-account refunds expose
// the actual independent approval count and cannot settle partially.
state.saved = { ...state.saved, status: "FINANCE_PENDING",
  inspectedByUserId: "inspector", preparedByUserId: "preparer" };
state.listRefundPayment = { status: "APPROVED" };
state.listCreditNote = { status: "APPROVED" };
let settlementList = await listRetailInvoiceReturnRequests("tenant", "invoice-A", "settler", 1);
assert.equal(settlementList.items[0].paymentApprovalTotal, 1);
assert.equal(settlementList.items[0].paymentApprovalCount, 1);
assert.equal(settlementList.items[0].canSettleFinance, true);
state.listRefundLegs = [
  { refundPayment: { status: "APPROVED" } },
  { refundPayment: { status: "PENDING_APPROVAL" } },
];
settlementList = await listRetailInvoiceReturnRequests("tenant", "invoice-A", "settler", 1);
assert.equal(settlementList.items[0].paymentApprovalTotal, 2);
assert.equal(settlementList.items[0].paymentApprovalCount, 1);
assert.equal(settlementList.items[0].canSettleFinance, false);
state.listRefundLegs[1].refundPayment.status = "APPROVED";
settlementList = await listRetailInvoiceReturnRequests("tenant", "invoice-A", "settler", 1);
assert.equal(settlementList.items[0].paymentApprovalTotal, 2);
assert.equal(settlementList.items[0].paymentApprovalCount, 2);
assert.equal(settlementList.items[0].canSettleFinance, true);
assert.equal((await listRetailInvoiceReturnApprovers("tenant", "requester", "store-A")).candidates.map((row) => row.userId).join(","), "reviewer");
await assert.rejects(listRetailInvoiceReturnApprovers("tenant", "requester", "store-OTHER"), { code: "RETAIL_SITE_ACCESS_DENIED" });
state.financeAllowed = false;
assert.equal((await listRetailInvoiceReturnApprovers("tenant", "requester", "store-A")).candidates.length, 0);
state.financeAllowed = true;

// The single canonical Finance credit/refund amount has two decimals. Partial
// quantities must preserve exact pennies across successive return requests.
state.existing = false;
state.checkout.lines[0].invoiceItem = { quantity: D(3), netAmount: D(90), taxAmount: D(10), totalAmount: D(100) };
state.checkout.invoice.grandTotal = D(100);
state.checkout.invoice.amountPaid = D(100);
const oneThird = { ...input, idempotencyKey: "shop-return-penny-001",
  lines: [{ ...input.lines[0], quantity: "1" }] };
assert.equal((await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", oneThird)).request.refundAmount.toFixed(2), "33.33");
assert.equal(state.lines[0].refundNetAmount.toFixed(2), "30.00");
assert.equal(state.lines[0].refundTaxAmount.toFixed(2), "3.33");
state.reserved = [{ checkoutLineId: "line-A", quantity: D(1), refundAmount: D("33.33"), refundNetAmount: D(30), refundTaxAmount: D("3.33") }];
assert.equal((await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...oneThird, idempotencyKey: "shop-return-penny-002",
})).request.refundAmount.toFixed(2), "33.33");
state.reserved = [{ checkoutLineId: "line-A", quantity: D(2), refundAmount: D("66.66"), refundNetAmount: D(60), refundTaxAmount: D("6.66") }];
assert.equal((await createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", {
  ...oneThird, idempotencyKey: "shop-return-penny-003",
})).request.refundAmount.toFixed(2), "33.34");
assert.equal(state.lines[0].refundNetAmount.toFixed(2), "30.00");
assert.equal(state.lines[0].refundTaxAmount.toFixed(2), "3.34");
state.reserved = [];
state.checkout.lines[0].invoiceItem = { quantity: D(100), netAmount: D("0.01"), taxAmount: D(0), totalAmount: D("0.01") };
state.checkout.invoice.grandTotal = D("0.01");
state.checkout.invoice.amountPaid = D("0.01");
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", oneThird),
  { code: "RETAIL_INVOICE_RETURN_AMOUNT_BELOW_MINOR_UNIT" });
state.checkout.lines[0].invoiceItem = { quantity: D(1), netAmount: D("10.005"), taxAmount: D(0), totalAmount: D("10.005") };
state.checkout.invoice.grandTotal = D("10.005");
state.checkout.invoice.amountPaid = D("10.005");
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", oneThird),
  { code: "RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED" });
state.checkout.lines[0].invoiceItem = { quantity: D(3), netAmount: D(90), taxAmount: D(10), totalAmount: D(100) };
state.checkout.invoice.grandTotal = D(100);
state.checkout.invoice.amountPaid = D(100);
state.reserved = [{ checkoutLineId: "line-A", quantity: D(1), refundAmount: D("33.333333"), refundNetAmount: D(30), refundTaxAmount: D("3.333333") }];
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", oneThird),
  { code: "RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED" });
state.reserved = [];
state.checkout.invoice.grandTotal = D("100.005");
state.checkout.invoice.amountPaid = D("100.005");
await assert.rejects(createRetailInvoiceReturnRequest("tenant", "invoice-A", "requester", oneThird),
  { code: "RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED" });

const migration = fs.readFileSync("prisma/migrations/20261107163000_retail_invoice_return_requests/migration.sql", "utf8");
assert.match(migration, /FOREIGN KEY \("organizationId", "returnRequestId", "checkoutId"\)/);
assert.match(migration, /FOREIGN KEY \("organizationId", "checkoutId", "checkoutLineId"\)/);
assert.match(migration, /CHECK \("status" IN/);
const inspectionMigration = fs.readFileSync("prisma/migrations/20261107170000_retail_invoice_return_inspection/migration.sql", "utf8");
assert.match(inspectionMigration, /ADD COLUMN "inspectedByUserId" TEXT/);
assert.match(inspectionMigration, /'INSPECTED'/);
const schema = fs.readFileSync("prisma/enterprise-retail-invoice-checkout.prisma", "utf8");
assert.match(schema, /model EnterpriseRetailInvoiceReturnRequest/);
assert.match(schema, /model EnterpriseRetailInvoiceReturnLine/);
assert.match(schema, /@@unique\(\[organizationId, checkoutId, id\]/);
const route = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/handler.ts", "utf8");
assert.match(route, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS", "submit", \{ mutation: true/);
assert.match(route, /writeAuditLog/);
const decisionRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/decision/handler.ts", "utf8");
assert.match(decisionRoute, /writeAuditLog/);
const inspectionRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/inspection/handler.ts", "utf8");
assert.match(inspectionRoute, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS", "submit", \{ mutation: true/);
assert.match(inspectionRoute, /writeAuditLog/);
const candidatesRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/return-approval-candidates/handler.ts", "utf8");
assert.match(candidatesRoute, /listRetailInvoiceReturnApprovers/);
assert.match(candidatesRoute, /authorizeRetailRequest/);
const returnsUi = fs.readFileSync("components/enterprise/professional/retail-invoice-return-dialog.tsx", "utf8");
const invoiceUi = fs.readFileSync("components/enterprise/professional/retail-invoice-flow-workbench.tsx", "utf8");
assert.match(invoiceUi, /<RetailInvoiceReturnDialog/);
assert.match(returnsUi, /receivedAndInspected: true/);
assert.match(returnsUi, /decision: action\.type === "APPROVE"/);
assert.match(returnsUi, /return-approval-candidates/);
assert.match(returnsUi, /canInspect|canDecide/);
assert.match(returnsUi, /APPROVED: copy\.approved/);
assert.doesNotMatch(source, /enterpriseSalesCreditNote\.create|enterprisePayment\.create|applyStockMovementTx/,
  "Request and approval must not mutate canonical money or stock");
console.log("HOTFIX #1042: Retail invoice returns require independent stock inspection before Finance approval; money and stock remain inert");
