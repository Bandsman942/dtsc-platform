import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const D = (v) => new Prisma.Decimal(v);
class EnterpriseAccountingError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}

const state = {
  retailCheckout: true, events: [], creditsCreated: 0,
  invoice: {
    id: "inv-A", status: "PAID", number: "F-1", currencyCode: "CDF",
    grandTotal: D(25), subtotal: D(25), taxTotal: D(0),
    creditNotes: [], receivable: { outstandingAmount: D(25) },
    items: [{ description: "Product", quantity: D(1), unitPrice: D(25),
      netAmount: D(25), taxAmount: D(0), totalAmount: D(25) }],
  },
};
const tx = {
  $executeRaw: async () => 1,
  enterpriseSalesInvoice: { findFirst: async () => state.invoice },
  enterpriseRetailInvoiceCheckout: { findFirst: async ({ where }) => {
    assert.equal(where.organizationId, "tenant-A");
    assert.equal(where.salesInvoiceId, "inv-A");
    return state.retailCheckout ? { id: "retail-checkout-A" } : null;
  } },
  enterpriseRetailInvoiceReturnRequest: { findFirst: async () => null },
  enterpriseSalesCreditNote: {
    findFirst: async () => null,
    create: async ({ data }) => {
      state.creditsCreated += 1;
      return { id: "CN-" + state.creditsCreated, grandTotal: data.grandTotal, number: data.number };
    },
  },
  enterprisePayment: { findFirst: async () => ({
    id: "refund", status: "APPROVED", paymentType: "REFUND", direction: "OUTBOUND", amount: D(25),
  }) },
  enterprisePaymentEvent: {
    findFirst: async ({ where }) => where.eventType === "REFUND_ALLOCATIONS_REVERSED"
      ? { metadataJson: { receivableId: "recv-A" } } : null,
    create: async ({ data }) => { state.events.push(data); return { id: "evt" }; },
  },
  enterpriseReceivable: { findFirst: async () => ({ id: "recv-A", salesInvoiceId: "inv-A" }) },
};
const prisma = { $transaction: async (fn) => fn(tx) };
const source = fs.readFileSync("lib/enterprise/accounting/customer-refund-service.ts", "utf8");
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, Promise, Date, Map, Set,
  require: (id) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "@/lib/prisma") return { prisma };
    if (id === "@/lib/enterprise/accounting/errors") return { EnterpriseAccountingError };
    if (id === "@/lib/enterprise/accounting/access") return { assertIndependentActor: () => {} };
    if (id === "@/lib/enterprise/accounting/helpers") return {
      financeReference: () => "CN-TEST", publishFinanceEvent: async () => {},
    };
    if (id === "@/lib/enterprise/accounting/posting-service") return { postBusinessEventTx: async () => {} };
    if (id === "@/lib/enterprise/accounting/reversal-service") return { reverseJournalEntryTx: async () => {} };
    if (id === "@/lib/enterprise/accounting/payments-service") return { resolveCashSessionForConfirmation: async () => ({ id: "cash" }) };
    if (id === "@/lib/enterprise/retail/site-access") return { retailFinanceReadSiteScope: async () => ["shop-A"] };
    return require(id);
  },
});
const {
  prepareSalesCreditNoteForRefundAmount,
  createExactSalesCreditNoteForRefund,
  markCustomerRefundFinancialInverseReady,
} = unit.exports;
const partial = () => prepareSalesCreditNoteForRefundAmount("tenant-A", "inv-A", "actor", "Refund case", D(25));
const exact = () => createExactSalesCreditNoteForRefund("tenant-A", "inv-A", "actor", "Refund case");
const inverse = () => markCustomerRefundFinancialInverseReady("tenant-A", "refund", "credit", "actor");

await assert.rejects(partial(), { code: "RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED" });
await assert.rejects(exact(), { code: "RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED" });
await assert.rejects(inverse(), { code: "RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED" });
assert.equal(state.creditsCreated, 0, "Retail credit cannot be created without canonical return accounting");
assert.equal(state.events.length, 0, "No refund inverse readiness may be fabricated");

// Legacy idempotent replay must not return a preexisting Finance credit for a
// Retail checkout without first checking the same Retail return proof.
state.invoice.creditNotes = [{ reason: "Refund case", grandTotal: D(25), id: "legacy-credit" }];
await assert.rejects(partial(), { code: "RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED" });
state.invoice.creditNotes = [];

// Preserve all non-Retail Pharmacy/Gaming refund paths.
state.retailCheckout = false;
const nonRetail = await partial();
assert.equal(nonRetail.id, "CN-1");
assert.equal(state.creditsCreated, 1);
const financeSource = fs.readFileSync("lib/enterprise/accounting/receivables-service.ts", "utf8");
assert.match(financeSource, /RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED/);
const postingSource = fs.readFileSync("lib/enterprise/accounting/credit-note-posting-preflight.ts", "utf8");
assert.match(postingSource, /RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED/);
console.log("HOTFIX #1042: Finance refund helpers cannot bypass Retail stock/credit synchronization; non-Retail preserved");
