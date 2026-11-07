import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const { z } = require("zod");
const d = (value) => new Prisma.Decimal(value);
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const state = {
  feature: true, siteAllowed: true, financeAllowed: true, accountBalance: d(100),
  accountSite: "shop-A", sourceAccounts: ["cash-A"], operations: [], requestStatus: "APPROVED",
  requestRevision: 1, refundPaymentId: null, salesCreditNoteId: null, preparedByUserId: null,
  settledByUserId: null, creditStatus: "PENDING_APPROVAL", paymentStatus: "PENDING_APPROVAL",
  approvedByUserId: null, receivableOutstanding: d(0), throwStock: false,
};
const currentRequest = () => ({
  id: "return-A", number: "RIR-A", organizationId: "tenant", checkoutId: "checkout-A",
  status: state.requestStatus, revision: state.requestRevision,
  refundAmount: d("33.33"), reason: "Défectueux", requestedByUserId: "requester",
  inspectedByUserId: "inspector", approverUserId: "approver",
  preparedByUserId: state.preparedByUserId, settledByUserId: state.settledByUserId,
  refundPaymentId: state.refundPaymentId, salesCreditNoteId: state.salesCreditNoteId,
  checkout: { siteId: "shop-A", invoice: { currencyCode: "CDF", businessPartyId: "buyer-A" } },
  lines: [{ id: "line-A", checkoutLineId: "checkout-line-A", quantity: d(1),
    refundAmount: d("33.33"), refundNetAmount: d(30), refundTaxAmount: d("3.33"),
    checkoutLine: { invoiceItem: { description: "Article" } } }],
});
const preview = () => ({
  requestId: "return-A", siteId: "shop-A", receivableId: "receivable-A",
  refundAmount: d("33.33"), currencyCode: "CDF",
  financeSourcePlan: state.sourceAccounts.map((account, index) => ({
    allocationId: `allocation-${index}`, paymentId: `source-payment-${index}`,
    financialAccountId: account, amount: d("33.33"),
  })),
  stockSourcePlan: [{ returnLineId: "line-A", originalMovementId: "movement-A",
    inventoryItemId: "item-A", warehouseId: "warehouse-A", stockLotId: "lot-A",
    storageLocationId: "shelf-A", stockDisposition: "RESTOCK", quantity: d(1) }],
});
const tx = {
  $executeRaw: async () => 1,
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: { invoiceCheckoutEnabled: state.feature } }) },
  enterpriseRetailInvoiceReturnRequest: {
    findFirst: async ({ where }) => {
      assert.equal(where.organizationId, "tenant");
      assert.equal(where.id, "return-A");
      assert.equal(where.checkout.salesInvoiceId, "invoice-A");
      return currentRequest();
    },
    update: async ({ data }) => {
      state.operations.push(`return:${data.status}`);
      state.requestStatus = data.status;
      state.requestRevision++;
      if (data.refundPaymentId) state.refundPaymentId = data.refundPaymentId;
      if (data.salesCreditNoteId) state.salesCreditNoteId = data.salesCreditNoteId;
      if (data.preparedByUserId) state.preparedByUserId = data.preparedByUserId;
      if (data.settledByUserId) state.settledByUserId = data.settledByUserId;
      return currentRequest();
    },
  },
  enterprisePayment: {
    findMany: async () => state.sourceAccounts.map((account, index) => ({
      id: `source-payment-${index}`, methodType: "CASH", financialAccountId: account,
      businessPartyId: "buyer-A", currencyCode: "CDF", status: "CONFIRMED",
      direction: "INBOUND", paymentType: "CUSTOMER_PAYMENT",
    })),
    findFirst: async () => ({ id: "refund-A", status: state.paymentStatus,
      approvedByUserId: state.approvedByUserId, initiatedByUserId: "preparer",
      financialAccountId: "cash-A", direction: "OUTBOUND", paymentType: "REFUND",
      currencyCode: "CDF", businessPartyId: "buyer-A", amount: d("33.33"), revision: 2 }),
    update: async () => { state.operations.push("payment:submit"); return {}; },
  },
  enterpriseSalesInvoice: {
    findFirst: async () => ({
      id: "invoice-A", grandTotal: d(100), currencyCode: "CDF", businessPartyId: "buyer-A",
    }),
    update: async () => { state.operations.push("invoice:update"); return {}; },
  },
  enterpriseSalesCreditNote: {
    findMany: async () => [],
    findFirst: async () => ({ id: "credit-A", status: state.creditStatus,
      approvedByUserId: state.approvedByUserId, createdByUserId: "preparer",
      salesInvoiceId: "invoice-A", currencyCode: "CDF", grandTotal: d("33.33"),
      subtotal: d(30), taxTotal: d("3.33"), creditDate: new Date() }),
    create: async ({ data }) => {
      assert.equal(data.items.create[0].taxAmount.toFixed(2), "3.33");
      assert.equal(data.items.create[0].netAmount.toFixed(2), "30.00");
      assert.equal(Object.hasOwn(data.items.create[0], "organizationId"), false,
        "Nested credit-note items must inherit their composite organization relation from the parent");
      state.operations.push("credit:create");
      return { id: "credit-A", number: "CN-A", ...data };
    },
    update: async ({ data }) => { state.operations.push(`credit:${data.status}`); return {}; },
  },
  enterprisePaymentEvent: { create: async () => { state.operations.push("payment:event"); return {}; } },
  enterpriseFinancialAccount: { findFirst: async () => ({
    id: "cash-A", siteId: state.accountSite, currencyCode: "CDF", operationalBalance: state.accountBalance,
  }) },
  enterpriseReceivable: {
    findFirst: async () => ({ id: "receivable-A", outstandingAmount: state.receivableOutstanding }),
    update: async () => { state.operations.push("receivable:update"); return {}; },
  },
  enterpriseReceivableAllocation: { create: async () => { state.operations.push("credit:allocation"); return {}; } },
};
const prisma = { $transaction: async (call) => call(tx) };
const mocks = {
  "@/lib/prisma": { prisma },
  "@prisma/client": { Prisma },
  "zod": { z },
  "@/lib/enterprise/retail/errors": { EnterpriseRetailError },
  "@/lib/enterprise/module-access": { resolveEnterpriseModuleCapabilities: async () => ({
    canCreate: state.financeAllowed, canSubmit: state.financeAllowed,
    canWrite: state.financeAllowed, canManage: state.financeAllowed,
  }) },
  "@/lib/enterprise/retail/site-access": {
    retailFinanceReadSiteScope: async () => state.siteAllowed ? ["shop-A"] : ["shop-B"],
  },
  "@/lib/enterprise/retail/transaction-retry": { withRetailTransactionRetry: (call) => call() },
  "@/lib/enterprise/retail/invoice-return-settlement-preflight": {
    assertRetailInvoiceReturnSettlementReadinessTx: async (_tx, org, invoice, id, status) => {
      assert.equal(org, "tenant"); assert.equal(invoice, "invoice-A"); assert.equal(id, "return-A");
      assert.equal(status || "APPROVED", state.requestStatus);
      return preview();
    },
  },
  "@/lib/enterprise/accounting/helpers": {
    financeReference: () => "CN-A", publishFinanceEvent: async () => { state.operations.push("audit"); },
  },
  "@/lib/enterprise/accounting/payments-service": {
    createEnterprisePaymentTx: async (_tx, org, actor, input) => {
      assert.equal(org, "tenant"); assert.equal(actor, "preparer");
      assert.equal(input.financialAccountId, "cash-A");
      assert.equal(input.amount, "33.33");
      state.operations.push("payment:create");
      return { id: "refund-A", number: "PAY-A" };
    },
  },
  "@/lib/enterprise/accounting/accounting-approval-service": {
    createAccountingApprovalAssignment: async (_tx, { approverUserId, targetEntityType }) => {
      assert.equal(approverUserId, "approver");
      state.operations.push(`approval:${targetEntityType}`);
      return { id: `approval-${targetEntityType}` };
    },
  },
  "@/lib/enterprise/accounting/customer-refund-service": {
    reverseCustomerPaymentAllocationsForRefundAmountTx: async (_tx, org, id, refund, actor, reason, amount, preference, allowedIds) => {
      assert.equal(org, "tenant"); assert.equal(id, "receivable-A"); assert.equal(refund, "refund-A");
      assert.equal(actor, "settler"); assert.equal(amount.toFixed(2), "33.33");
      assert.equal(preference, null); assert.equal(allowedIds.join(","), "allocation-0");
      state.operations.push("payment:reverse-allocations");
      state.receivableOutstanding = d("33.33");
    },
    markCustomerRefundFinancialInverseReadyTx: async (_tx, _org, refund, credit, actor, requestId) => {
      assert.equal(refund, "refund-A"); assert.equal(credit, "credit-A");
      assert.equal(actor, "settler"); assert.equal(requestId, "return-A");
      state.operations.push("payment:inverse-ready");
    },
    confirmCustomerRefundPaymentTx: async () => { state.operations.push("payment:confirmed"); },
  },
  "@/lib/enterprise/accounting/posting-service": {
    postBusinessEventTx: async () => { state.operations.push("credit:posted-journal"); return { entry: { id: "journal-A" } }; },
  },
  "@/lib/enterprise/inventory/service": {
    applyStockMovementTx: async (_tx, org, actor, input) => {
      assert.equal(org, "tenant"); assert.equal(actor, "settler");
      assert.equal(input.sourceEntityType, "EnterpriseRetailInvoiceReturnRequest");
      assert.equal(input.sourceLineId, "line-A");
      if (state.throwStock) throw new EnterpriseRetailError("SIMULATED_STOCK_FAILURE");
      state.operations.push("stock:return-in"); return { movement: { id: "stock-return-A" } };
    },
  },
  "@/lib/enterprise/retail/accounting": {
    valueRetailInventoryReturnTx: async (_tx, _org, movement, _actor, { originalStockMovementId }) => {
      assert.equal(movement, "stock-return-A");
      assert.equal(originalStockMovementId, "movement-A");
      state.operations.push("stock:valued");
    },
  },
};
const mod = { exports: {} };
const source = fs.readFileSync("lib/enterprise/retail/invoice-return-finance.ts", "utf8");
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, Promise, Date, Set, Map,
  require: (id) => mocks[id] || require(id),
});
const prep = (actor = "preparer", revision = 1) => mod.exports.prepareRetailInvoiceReturnFinance("tenant", "invoice-A", "return-A", actor, { revision });
const settle = (actor = "settler", revision = 2) => mod.exports.settleRetailInvoiceReturnFinance("tenant", "invoice-A", "return-A", actor, { revision, reason: "Dossier contrôlé" });

state.feature = false;
await assert.rejects(prep(), { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
state.feature = true; state.siteAllowed = false;
await assert.rejects(prep(), { code: "RETAIL_SITE_ACCESS_DENIED" });
state.siteAllowed = true; state.financeAllowed = false;
await assert.rejects(prep(), { code: "RETAIL_INVOICE_RETURN_FINANCE_PERMISSION_REQUIRED" });
state.financeAllowed = true;
await assert.rejects(prep("approver"), { code: "RETAIL_INVOICE_RETURN_FINANCE_CONFLICT" });
await assert.rejects(prep("preparer", 99), { code: "RETAIL_INVOICE_RETURN_FINANCE_CONFLICT" });
state.sourceAccounts = ["cash-A", "cash-B"];
await assert.rejects(prep(), { code: "RETAIL_INVOICE_RETURN_MULTIPLE_REFUND_ACCOUNTS_UNSUPPORTED" });
state.sourceAccounts = ["cash-A"];

const prepared = await prep();
assert.equal(prepared.request.status, "FINANCE_PENDING");
assert.equal(prepared.request.refundPaymentId, "refund-A");
assert.equal(prepared.request.salesCreditNoteId, "credit-A");
assert.deepEqual(state.operations.filter((entry) => entry.startsWith("approval:")),
  ["approval:EnterprisePayment", "approval:EnterpriseSalesCreditNoteApproval"]);
assert.equal((await prep("preparer", 1)).idempotent, true);
assert.equal(state.operations.filter((entry) => entry === "payment:create").length, 1);
await assert.rejects(settle(), { code: "RETAIL_INVOICE_RETURN_FINANCE_CONFLICT" });
state.paymentStatus = "APPROVED"; state.creditStatus = "APPROVED";
state.approvedByUserId = "approver";
state.accountBalance = d(20);
await assert.rejects(settle(), { code: "RETAIL_INVOICE_RETURN_REFUND_ACCOUNT_INSUFFICIENT" });
state.accountBalance = d(100); state.throwStock = true;
await assert.rejects(settle(), { code: "SIMULATED_STOCK_FAILURE" });
assert.equal(state.requestStatus, "FINANCE_PENDING", "failure must not mark the return COMPLETED");
state.throwStock = false; state.operations = [];
const settled = await settle();
assert.equal(settled.request.status, "COMPLETED");
assert.equal((await settle("settler", 2)).idempotent, true);
assert.ok(state.operations.indexOf("payment:reverse-allocations") < state.operations.indexOf("credit:posted-journal"));
assert.ok(state.operations.indexOf("credit:posted-journal") < state.operations.indexOf("payment:inverse-ready"));
assert.ok(state.operations.indexOf("payment:confirmed") < state.operations.indexOf("stock:return-in"));
assert.ok(state.operations.indexOf("stock:valued") < state.operations.indexOf("return:COMPLETED"));
const financePrepareRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/prepare/route.ts", "utf8");
const financeSettleRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/settle/route.ts", "utf8");
assert.match(financePrepareRoute, /authorizeFinanceRequest\(req, organizationId, "FINANCE_PAYMENTS", "submit", \{ mutation: true/);
assert.match(financeSettleRoute, /authorizeFinanceRequest\(req, organizationId, "FINANCE_PAYMENTS", "update", \{ mutation: true/);
assert.doesNotMatch(financePrepareRoute + financeSettleRoute, /authorizeRetailRequest|"RETAIL_POS"/,
  "Independent Finance actors are not granted and do not require POS cashier permissions");
assert.match(source, /resolveEnterpriseModuleCapabilities\(\{ organizationId, userId: actorUserId, moduleCode: "FINANCE_RECEIVABLES" \}\)/);
assert.match(source, /retailFinanceReadSiteScope\(organizationId, actorUserId, "COLLECT_PAYMENT", tx\)/);
console.log("✓ #1042 Retail invoice return Finance prepare/settle: authorization, independent approvals, idempotence, exact source scope, atomic ordering, stock rollback and completion");
