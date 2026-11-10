import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const legacy = read("lib/enterprise/retail/sale-execution.ts");
const offline = read("lib/enterprise/retail/offline-server.ts");
const omnibus = read("lib/enterprise/retail/omnichannel.ts");
const returns = read("lib/enterprise/retail/omnichannel-returns.ts");
const dashboard = read("app/api/enterprise/[organizationId]/retail/site-overview/route.ts");
const readiness = read("lib/enterprise/retail/self-service-onboarding.ts");
const finance = read("lib/enterprise/accounting/receivables-service.ts");
const retailInvoices = read("app/api/enterprise/[organizationId]/retail/invoices/route.ts");
const invoiceView = read("components/enterprise/professional/retail-invoice-flow-workbench.tsx");
const paymentView = read("components/enterprise/professional/retail-payment-followup.tsx");

assert.match(legacy, /RETAIL_LEGACY_SALE_DISABLED_USE_INVOICE/, "Legacy sale engine must reject direct payment once invoice checkout is active");
assert.match(offline, /RETAIL_OFFLINE_INVOICE_CHECKOUT_NOT_SUPPORTED/, "Offline snapshot cannot sell outside the canonical approval circuit");
assert.match(offline, /syncRetailOfflineSale[\s\S]*?requireRetailSiteCapability/, "Offline sync must recheck store permissions");
assert.match(omnibus, /requireRetailSiteCapability/, "Omnichannel mutations enforce site authorization");
assert.match(returns, /assertOmnichannelOrderStore/, "Returns cannot read or submit from unassigned shops");
assert.match(returns, /assertOmnichannelReturnFinanceStore/, "Finance return decisions cannot cross assigned shops");
assert.match(finance, /CANCEL: \{ from: \["DRAFT", "REJECTED"\]/, "Unposted rejected invoices can be cancelled");
assert.match(retailInvoices, /canSubmit: \["DRAFT", "REJECTED"\]/, "Rejected invoices can be resubmitted by issuer");
assert.match(invoiceView, /REJECTED: lang\.rejected/, "Rejected invoices must have meaningful localized status");
assert.match(invoiceView, /mode === "checkout" \? <div[^\n]*Ouvrir le registre des factures/, "Checkout must link to register instead of duplicating it");
assert.match(paymentView, /canonicalPagination\.pageCount > 1/, "Finance payment follow-up is paginated");
assert.match(dashboard, /"EnterprisePaymentAllocation" allocation/, "Finance collections must use real allocated payments");
assert.match(dashboard, /allocation\."reversedAt" IS NULL/, "Reversed allocations must not inflate collections");
for (const code of ["STORE_STAFF", "STORE_INVOICERS", "STORE_CASHIERS", "STORE_ISOLATION", "INVOICE_CHECKOUT"]) {
  assert.ok(readiness.includes(`code: "${code}"`), `Readiness must check ${code}`);
}

const source = read("app/api/enterprise/[organizationId]/retail/payments/invoices/route.ts");
let capturedWhere;
let checkoutEnabled = true;
const prisma = {
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: { invoiceCheckoutEnabled: checkoutEnabled } }) },
  enterpriseRetailInvoicePaymentProposal: {
    findMany: async ({ where }) => { capturedWhere = where; return [{
      id: "proposal", createdAt: new Date("2026-11-10T12:00:00Z"),
      payment: { id: "finance-payment", number: "PMT-1", status: "CONFIRMED", amount: { toFixed: () => "12.00" }, currencyCode: "CDF", methodType: "CASH", confirmedAt: new Date(), reference: "REF" },
      checkout: { invoice: { id: "invoice", number: "FAC-1", status: "PAID", outstandingAmount: "0" }, site: { code: "A", name: "Boutique A" } },
    }]; },
    count: async () => 1,
  },
};
class NextResponse {
  constructor(body, options = {}) { this.body = body; this.status = options.status || 200; }
  static json(body, options) { return new NextResponse(body, options); }
}
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module, exports: module.exports, URL, Promise,
  require(name) {
    if (name === "next/server") return { NextResponse };
    if (name === "@/lib/audit") return { writeApiLog: async () => {} };
    if (name === "@/lib/enterprise/retail/http") return {
      authorizeRetailRequest: async () => ({ ok: true, session: { userId: "cashier" } }),
      retailErrorResponse: (error) => NextResponse.json({ error: error.code }, { status: error.status || 500 }),
      retailListParams: () => ({ page: 1, pageSize: 20, status: "CONFIRMED" }),
    };
    if (name === "@/lib/enterprise/retail/site-access") return {
      retailInvoiceVisibleSites: async () => ({ isOwner: false, collectibleSiteIds: ["site-a"] }),
    };
    if (name === "@/lib/prisma") return { prisma };
    throw Error(`Unexpected import: ${name}`);
  },
});
const params = { params: Promise.resolve({ organizationId: "tenant" }) };
const ok = await module.exports.GET(new Request("https://app.dtsc-platform.com/api/enterprise/tenant/retail/payments/invoices?status=CONFIRMED"), params);
assert.equal(ok.status, 200);
assert.equal(ok.body.items.length, 1);
assert.equal(capturedWhere.checkout.siteId.in[0], "site-a", "Canonical Finance payments must be site-scoped in SQL");
assert.equal(capturedWhere.payment.status, "CONFIRMED");
const denied = await module.exports.GET(new Request("https://app.dtsc-platform.com/api/enterprise/tenant/retail/payments/invoices?siteId=site-b"), params);
assert.equal(denied.status, 403, "Forged store filter is denied");
checkoutEnabled = false;
const disabled = await module.exports.GET(new Request("https://app.dtsc-platform.com/api/enterprise/tenant/retail/payments/invoices"), params);
assert.equal(disabled.status, 200);
assert.equal(disabled.body.active, false, "Non-activated tenants keep their historic channel view");
console.log("PASS #1101 — site-isolated payment proposals, invoice status, legacy cutover, readiness and report separation");
