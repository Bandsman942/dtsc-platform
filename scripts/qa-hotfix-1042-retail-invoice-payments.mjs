import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const { z } = require("zod");
const money = (value) => new Prisma.Decimal(value);
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const state = {
  site: "shop-A", method: "CASH", accountSite: "shop-A", invoiceStatus: "ISSUED", invoiceOutstanding: "100", receivable: true,
  settings: { invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: true }, existing: null, pending: [],
  paymentCreations: [], proposalCreations: [], allowed: true, cashSessionOpen: true, customerActive: true,
  transactionAttempts: 0, retriableFailures: 0,
};
const invoice = () => ({
  id: "invoice-A", number: "INV-2026-001", status: state.invoiceStatus, currencyCode: "CDF", businessPartyId: "customer-A",
  outstandingAmount: money(state.invoiceOutstanding), receivable: state.receivable ? { id: "receivable-A", status: "OPEN" } : null,
});
const tx = {
  $executeRaw: async () => 1,
  enterpriseRetailInvoiceCheckout: { findFirst: async () => ({ id: "checkout-A", siteId: state.site, invoice: invoice() }) },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: state.settings }) },
  enterpriseRetailInvoicePaymentProposal: {
    findUnique: async () => state.existing,
    findMany: async () => state.pending.map((amount) => ({ payment: { unallocatedAmount: money(amount) } })),
    create: async ({ data }) => { state.proposalCreations.push(data); return { id: "proposal-A", ...data }; },
  },
  enterpriseFinancialAccount: { findFirst: async () => ({ id: "account-A", siteId: state.accountSite, currencyCode: "CDF", accountType: "CASH" }) },
  enterpriseCashSession: { findFirst: async () => state.cashSessionOpen ? { id: "session-A" } : null },
  enterpriseBusinessParty: { findFirst: async () => state.customerActive ? { id: "customer-A" } : null },
};
const prisma = { $transaction: async (callback) => {
  state.transactionAttempts += 1;
  if (state.retriableFailures > 0) {
    state.retriableFailures -= 1;
    throw Object.assign(new Error("Could not serialize access"), { code: "P2034" });
  }
  return callback(tx);
} };
const retrySource = fs.readFileSync("lib/enterprise/retail/transaction-retry.ts", "utf8");
const retryModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(retrySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: retryModule, exports: retryModule.exports, Promise, Set, Error, setTimeout });

const source = fs.readFileSync("lib/enterprise/retail/invoice-payments.ts", "utf8");
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(transpiled, { module: mod, exports: mod.exports, Promise, Map, Set, Date,
  require: (id) => {
    if (id === "@/lib/prisma") return { prisma };
    if (id === "@/lib/enterprise/retail/transaction-retry") return retryModule.exports;
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@/lib/enterprise/accounting/schemas") return { positiveMoneyInputSchema: z.string().regex(/^\d+(?:\.\d{1,6})?$/).refine((value) => Number(value) > 0) };
    if (id === "@/lib/enterprise/accounting/payments-service") return { createEnterprisePaymentTx: async (_tx, org, actor, data) => {
      state.paymentCreations.push({ org, actor, data });
      return { id: "payment-A", organizationId: org, amount: money(data.amount), status: "DRAFT", unallocatedAmount: money(data.amount) };
    } };
    if (id === "@/lib/enterprise/retail/site-access") return {
      retailInvoiceVisibleSites: async () => ({ isOwner: false, siteIds: state.allowed ? ["shop-A"] : [] }),
      requireRetailSiteCapability: async (_org, _actor, site, cap, _tx, options) => {
        if (!state.allowed || site !== "shop-A" || cap !== "COLLECT_PAYMENT" || !options.requireAssignment) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
      },
    };
    return require(id);
  },
});
const { retailInvoicePaymentProposalSchema, proposeRetailInvoicePayment } = mod.exports;
const input = { idempotencyKey: "shop-payment-0001", methodType: "CASH", financialAccountId: "account-A", cashSessionId: "session-A", amount: "25" };
assert.equal(retailInvoicePaymentProposalSchema.safeParse(input).success, true);
assert.equal(retailInvoicePaymentProposalSchema.safeParse({ ...input, amount: "-20" }).success, false);
assert.equal(retailInvoicePaymentProposalSchema.safeParse({ ...input, methodType: "OTHER" }).success, false);
assert.equal(retailInvoicePaymentProposalSchema.safeParse({ ...input, organizationId: "other-tenant" }).success, false, "Client cannot override tenant");

state.settings.invoiceCheckoutEnabled = false;
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input), { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
state.settings.invoiceCheckoutEnabled = true;
state.allowed = false;
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input), { code: "RETAIL_SITE_ACCESS_DENIED" });
state.allowed = true; state.accountSite = "shop-B";
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input), { code: "RETAIL_INVOICE_FINANCIAL_ACCOUNT_SITE_MISMATCH" });
state.accountSite = "shop-A"; state.cashSessionOpen = false;
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input), { code: "RETAIL_OPEN_CASH_SESSION_REQUIRED" });
state.cashSessionOpen = true; state.invoiceStatus = "DRAFT";
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input), { code: "RETAIL_INVOICE_PAYMENT_NOT_RECEIVABLE" });
state.invoiceStatus = "ISSUED"; state.pending = ["80"];
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input), { code: "RETAIL_INVOICE_PAYMENT_EXCEEDS_OUTSTANDING" });
state.pending = [];
const result = await proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input);
assert.equal(result.idempotent, false);
assert.equal(state.paymentCreations.length, 1);
assert.equal(state.proposalCreations.length, 1);
assert.equal(state.paymentCreations[0].data.paymentType, "CUSTOMER_PAYMENT");
assert.equal(state.paymentCreations[0].data.direction, "INBOUND");
assert.equal(state.paymentCreations[0].data.businessPartyId, "customer-A");
assert.equal(state.paymentCreations[0].data.currencyCode, "CDF");
assert.equal(state.paymentCreations[0].data.cashSessionId, "session-A");
assert.equal(state.proposalCreations[0].paymentId, "payment-A");
assert.equal(result.payment.status, "DRAFT", "Cashier cannot directly confirm or post a payment");
state.existing = { ...state.proposalCreations[0], checkoutId: "checkout-A", payment: result.payment };
const retried = await proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", input);
assert.equal(retried.idempotent, true);
assert.equal(state.paymentCreations.length, 1, "Idempotent retry does not create duplicate Finance payment");
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", { ...input, amount: "30" }), { code: "RETAIL_INVOICE_PAYMENT_IDEMPOTENCY_COLLISION" });

// A serialization conflict must rerun the WHOLE transaction: permissions,
// outstanding balance, idempotency and Finance payment remain in the same unit.
state.existing = null;
state.retriableFailures = 1;
const previousAttempts = state.transactionAttempts;
const retryInput = { ...input, idempotencyKey: "shop-payment-0002" };
const afterConflict = await proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", retryInput);
assert.equal(afterConflict.idempotent, false);
assert.equal(state.transactionAttempts - previousAttempts, 2, "P2034 retries the entire payment transaction exactly once");
assert.equal(state.paymentCreations.length, 2, "Retried transaction creates just one additional canonical Finance draft");
assert.equal(state.proposalCreations.length, 2, "Retried transaction creates just one additional Retail mapping");
state.retriableFailures = 3;
const beforeExhaustion = state.transactionAttempts;
await assert.rejects(proposeRetailInvoicePayment("tenant-A", "invoice-A", "cashier-A", {
  ...input, idempotencyKey: "shop-payment-0003",
}), { code: "P2034" });
assert.equal(state.transactionAttempts - beforeExhaustion, 3, "Bounded retries never spin indefinitely");
assert.equal(state.paymentCreations.length, 2, "Failed serialization must not create a Finance payment");


const finance = fs.readFileSync("lib/enterprise/accounting/payments-service.ts", "utf8");
assert.match(finance, /export async function createEnterprisePaymentTx\(/);
assert.match(finance, /enterpriseRetailInvoicePaymentProposal\.findFirst\(/);
assert.match(finance, /retailIntent\.checkout\.salesInvoiceId !== receivable\.salesInvoiceId/);
assert.match(finance, /source\.outstandingAmount\.lessThan\(payment\.amount\)/, "Finance revalidates remaining receivable before treasury confirmation");
assert.match(finance, /account\.siteId !== retailIntent\.checkout\.siteId/, "Finance revalidates the original store before confirming a Retail payment");
const approval = fs.readFileSync("lib/enterprise/accounting/accounting-approval-service.ts", "utf8");
assert.match(approval, /assertRetailPaymentFinanceApproverTx\(tx,/);
const orchestration = fs.readFileSync("lib/enterprise/accounting/accounting-human-approval-orchestration.ts", "utf8");
assert.match(orchestration, /retailPaymentSiteId: options\.retailPaymentSiteId/);
assert.match(orchestration, /payment\.initiatedByUserId !== actorUserId/);
const routes = [
  "app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/route.ts",
  "app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/[paymentId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/payments/[paymentId]/allocate/route.ts",
];
for (const path of routes) {
  const content = fs.readFileSync(path, "utf8");
  assert.match(content, /authorizeRetailRequest\(/, `${path} must gate auth`);
  assert.match(content, /retailInvoicePaymentOptions|proposeRetailInvoicePayment/, `${path} must enforce store/site scope`);
  assert.match(content, /writeAuditLog\(/, `${path} must audit mutations`);
}
const allocation = fs.readFileSync(routes[2], "utf8");
assert.match(allocation, /amount: proposal\.payment\.unallocatedAmount\.toFixed\(6\)/);
assert.doesNotMatch(allocation, /await req\.json\(/, "No client-provided target or settlement amount");
const transition = fs.readFileSync(routes[1], "utf8");
assert.doesNotMatch(transition, /z\.literal\("APPROVE"\)|z\.literal\("CONFIRM"\)/, "No cashier self-approval/confirmation");
const migration = fs.readFileSync("prisma/migrations/20261107110000_retail_invoice_payment_proposals/migration.sql", "utf8");
assert.match(migration, /CREATE TABLE "EnterpriseRetailInvoicePaymentProposal"/);
assert.match(migration, /UNIQUE INDEX .*organizationId_payme_key/);
assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
const ui = fs.readFileSync("components/enterprise/professional/retail-invoice-payment-dialog.tsx", "utf8");
assert.match(ui, /RetailInvoicePaymentDialog/);
assert.match(ui, /FINANCE_PAYMENTS/);
assert.match(ui, /"en"/);
assert.match(ui, /"fr"/);
console.log("HOTFIX #1042 tranche encaissement Finance canonique : montant, boutique, session, idempotence, approbation indépendante, affectation, migration et Design 2.0 validés ; OWNER_E2E en attente.");
