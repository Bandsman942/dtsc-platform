import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");

class EnterpriseAccountingError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const state = {
  checkout: { siteId: "boutique-A" },
  account: { siteId: "boutique-A", currencyCode: "CDF" },
  refund: {
    id: "refund-1", amount: new Prisma.Decimal(20), paymentType: "REFUND",
    direction: "OUTBOUND", status: "APPROVED", currencyCode: "CDF",
    businessPartyId: "client-1", financialAccountId: "account-A", revision: 1,
  },
  invoice: { id: "invoice-A", businessPartyId: "client-1", currencyCode: "CDF" },
  reversed: true,
  reversalReceivableId: "receivable-1",
  confirmed: false,
  allowedSites: ["boutique-A"],
};
const tx = {
  $executeRaw: async () => 1,
  enterprisePayment: { findFirst: async () => state.refund },
  enterpriseReceivable: { findFirst: async () => ({
    id: "receivable-1", salesInvoiceId: "invoice-A", salesInvoice: state.invoice, paymentAllocations: [],
  }) },
  enterpriseRetailInvoiceCheckout: { findFirst: async () => state.checkout },
  enterpriseSalesInvoice: { findFirst: async () => state.invoice },
  enterpriseFinancialAccount: { findFirst: async () => state.account },
  enterprisePaymentEvent: { findFirst: async ({ where }) => {
    if (where.eventType === "REFUND_ALLOCATIONS_REVERSED") return state.reversed ? {
      id: "event-reversed", metadataJson: { receivableId: state.reversalReceivableId, amount: new Prisma.Decimal(20).toDecimalPlaces(6).toFixed() },
    } : null;
    if (where.eventType === "REFUND_FINANCIAL_INVERSE_READY") {
      return { id: "event-ready", metadataJson: { salesInvoiceId: "invoice-A" } };
    }
    return null;
  } },
};
const prisma = { $transaction: async (callback) => callback(tx) };
const source = fs.readFileSync("lib/enterprise/accounting/customer-refund-service.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const unit = { exports: {} };
vm.runInNewContext(compiled, {
  module: unit, exports: unit.exports, Promise, Map, Set, Date,
  require: (name) => {
    if (name === "@prisma/client") return { Prisma };
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/enterprise/accounting/errors") return { EnterpriseAccountingError };
    if (name === "@/lib/enterprise/accounting/access") return { assertIndependentActor: () => {} };
    if (name === "@/lib/enterprise/accounting/helpers") return { financeReference: () => "CN-1", publishFinanceEvent: async () => {} };
    if (name === "@/lib/enterprise/accounting/posting-service") return { postBusinessEventTx: async () => {} };
    if (name === "@/lib/enterprise/accounting/reversal-service") return { reverseJournalEntryTx: async () => {} };
    if (name === "@/lib/enterprise/accounting/payments-service") return { resolveCashSessionForConfirmation: async () => ({ id: "cash-session" }) };
    if (name === "@/lib/enterprise/retail/site-access") return { retailFinanceReadSiteScope: async () => state.allowedSites };
    return require(name);
  },
});
const {
  reverseCustomerPaymentAllocationsForRefund,
  reverseCustomerPaymentAllocationsForRefundAmount,
  reverseCustomerPaymentAllocationsForRefundAmountTx,
  confirmCustomerRefundPayment,
  confirmCustomerRefundPaymentTx,
} = unit.exports;
const reverse = () => reverseCustomerPaymentAllocationsForRefundAmount(
  "organization-1", "receivable-1", "refund-1", "finance-user", "Retour client",
  new Prisma.Decimal(20), "payment-original",
);
const confirm = () => confirmCustomerRefundPayment(
  "organization-1", "refund-1", "finance-user", { revision: 1, reason: "Retour client" },
);
const reverseAll = (paymentId = "refund-1") => reverseCustomerPaymentAllocationsForRefund(
  "organization-1", "receivable-1", "finance-user", "Retour client", paymentId,
);

assert.equal((await reverse()).idempotent, true, "Same-site idempotent refund is accepted");
const originalTransaction = prisma.$transaction;
prisma.$transaction = () => { throw new Error("NESTED_FINANCE_TRANSACTION_FORBIDDEN"); };
assert.equal((await reverseCustomerPaymentAllocationsForRefundAmountTx(
  tx, "organization-1", "receivable-1", "refund-1", "finance-user", "Retour client",
  new Prisma.Decimal(20), "payment-original",
)).idempotent, true, "The canonical Finance inverse can participate in a caller-owned transaction");
state.refund.status = "CONFIRMED";
assert.equal((await confirmCustomerRefundPaymentTx(
  tx, "organization-1", "refund-1", "finance-user", { revision: 1, reason: "Retour client" },
)).id, "refund-1", "The canonical refund confirmation can be reused in a caller-owned transaction");
state.refund.status = "APPROVED";
prisma.$transaction = originalTransaction;
assert.equal((await reverseAll()).idempotent, true, "Legacy reversal also checks a valid same-site refund");
state.allowedSites = ["boutique-B"];
await assert.rejects(reverse(), { code: "RETAIL_INVOICE_REFUND_SITE_ACCESS_DENIED" });
await assert.rejects(reverseAll(), { code: "RETAIL_INVOICE_REFUND_SITE_ACCESS_DENIED" });
await assert.rejects(confirm(), { code: "RETAIL_INVOICE_REFUND_SITE_ACCESS_DENIED" });
state.refund = { ...state.refund, status: "CONFIRMED" };
await assert.rejects(confirm(), { code: "RETAIL_INVOICE_REFUND_SITE_ACCESS_DENIED" });
state.refund = { ...state.refund, status: "APPROVED" };
state.allowedSites = [];
await assert.rejects(reverse(), { code: "RETAIL_INVOICE_REFUND_SITE_ACCESS_DENIED" });
state.allowedSites = null;
assert.equal((await reverse()).idempotent, true, "Independent Finance actor keeps Finance-authorized scope");
state.allowedSites = ["boutique-A"];
state.reversalReceivableId = "receivable-B";
await assert.rejects(reverse(), { code: "REFUND_ALLOCATION_REVERSAL_CONFLICT" });
await assert.rejects(reverseAll(), { code: "REFUND_ALLOCATION_REVERSAL_CONFLICT" });
state.reversalReceivableId = "receivable-1";
await assert.rejects(reverseAll(null), { code: "RETAIL_INVOICE_REFUND_PAYMENT_REQUIRED" });
state.account = { siteId: "boutique-B", currencyCode: "CDF" };
await assert.rejects(reverse(), { code: "RETAIL_INVOICE_REFUND_ACCOUNT_SITE_MISMATCH" });
await assert.rejects(reverseAll(), { code: "RETAIL_INVOICE_REFUND_ACCOUNT_SITE_MISMATCH" });
await assert.rejects(confirm(), { code: "RETAIL_INVOICE_REFUND_ACCOUNT_SITE_MISMATCH" });
state.account = { siteId: "boutique-A", currencyCode: "USD" };
await assert.rejects(reverse(), { code: "RETAIL_INVOICE_REFUND_ACCOUNT_SITE_MISMATCH" });
state.account = null;
await assert.rejects(reverse(), { code: "RETAIL_INVOICE_REFUND_ACCOUNT_SITE_MISMATCH" });
state.account = { siteId: "boutique-A", currencyCode: "CDF" };
state.refund = { ...state.refund, businessPartyId: "client-B" };
await assert.rejects(reverse(), { code: "RETAIL_INVOICE_REFUND_CUSTOMER_CURRENCY_MISMATCH" });
state.refund = { ...state.refund, businessPartyId: "client-1", currencyCode: "USD" };
await assert.rejects(reverse(), { code: "RETAIL_INVOICE_REFUND_CUSTOMER_CURRENCY_MISMATCH" });
state.refund = { ...state.refund, currencyCode: "CDF" };
state.checkout = null;
assert.equal((await reverse()).idempotent, true, "Common Finance invoices keep their existing refund flow");

assert.match(source, /await assertRetailInvoiceRefundAccountTx\(tx, organizationId, receivable\.salesInvoiceId, actorUserId, refundPayment\)/);
assert.match(source, /await assertRetailInvoiceRefundAccountTx\(tx, organizationId, salesInvoiceId, actorUserId, current\)/);
console.log("HOTFIX #1042 refund scope: site actor, revocation, same-site, cross-site, currency, customer, replay and Finance fallback OK");
