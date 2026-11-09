import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const nav = read("components/enterprise/professional/retail-pos-section-navigation.tsx");
const page = read("app/enterprise-modules/retail-page.tsx");
const sale = read("components/enterprise/professional/retail-invoice-flow-workbench.tsx");
const legacySale = read("components/enterprise/professional/retail-pos-dtsc-workspace.tsx");
const customerValueE2e = read("tests/e2e/shop2-customer-value-ui.spec.mjs");
const cashier = read("components/enterprise/professional/retail-invoice-cashier-workbench.tsx");
const staff = read("components/enterprise/professional/retail-site-staff-access.tsx");
const assignments = read("app/api/enterprise/[organizationId]/retail/site-assignments/route.ts");
const access = read("lib/enterprise/retail/site-access.ts");
const invoicePayments = read("lib/enterprise/retail/invoice-payments.ts");
const apiSource = read("app/api/enterprise/[organizationId]/retail/invoices/route.ts");
const civilDates = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("lib/enterprise/retail/civil-date.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: civilDates, exports: civilDates.exports, Date, Intl });

for (const id of ["store-setup", "sites", "staff", "payments", "equipment", "readiness", "activation", "inventory", "offline", "omnichannel"]) {
  assert.match(nav, new RegExp(`id: "${id}"[^\\n]*adminOnly: true`), `${id} must be owner/admin-only`);
}
assert.match(nav, /id: "checkout"[^\n]*requiredCapability: "PREPARE_INVOICE"/);
assert.match(nav, /id: "collections"[^\n]*requiredCapability: "COLLECT_PAYMENT"/);
assert.match(page, /getRetailPosSection\(options\?\.section, canManagePos, posCapabilities\)/);
assert.match(page, /posAssignments\.some/);
assert.match(page, /posSection\?\.id === "customers"\) redirect/);
assert.match(page, /mode="checkout"/);
assert.match(page, /mode="invoices"/);
assert.match(page, /<RetailInvoiceCashierWorkbench/);
assert.match(staff, /positionTitleFr/);
assert.match(staff, /positionTitleEn/);
assert.match(assignments, /enterprisePosition\.findMany/);
assert.match(assignments, /positionId/);
assert.match(access, /retailStaffMustBeScoped/);
assert.match(access, /findMany\(\{\s*where: \{ organizationId, userId \}/);
assert.equal((invoicePayments.match(/visibility\.collectibleSiteIds\.includes\(checkout\.siteId\)/g) || []).length, 2,
  "Payment options and the payment proposal transaction must allow collection-only staff, without granting invoice draft access");

assert.match(sale, /<RetailActiveCustomerBar organizationId=\{organizationId\} compact/);
assert.match(legacySale, /<RetailActiveCustomerBar organizationId=\{organizationId\} compact/, "Legacy checkout must also embed the active customer instead of restoring a separate POS card");
assert.match(customerValueE2e, /data-retail-pos-card="checkout"/, "Customer value browser acceptance must exercise the compact checkout");
assert.doesNotMatch(customerValueE2e, /data-retail-pos-card="customers"/);
assert.match(sale, /data-retail-invoice-proforma/);
assert.match(sale, /previewOpen/);
assert.match(sale, /printProforma/);
assert.match(sale, /businessPartyId: customerId/);
assert.match(sale, /pricing\/preview/);
assert.match(sale, /<ShoppingBasket/);
assert.doesNotMatch(sale, /<RetailInvoicePaymentDialog/);
assert.match(cashier, /view: "collections"/);
assert.match(cashier, /<RetailInvoicePaymentDialog/);
assert.match(cashier, /entry\.canCollect/);
assert.match(cashier, /pageCount > 1/);

class NextResponse {
  constructor(body, options = {}) { this.body = body; this.status = options.status || 200; }
  static json(body, options = {}) { return new NextResponse(body, options); }
}
let capturedWhere;
const checkout = {
  id: "retail-checkout", siteId: "shop-a",
  invoice: { id: "invoice-a", status: "ISSUED", number: "FAC-A", createdByUserId: "invoicer", grandTotal: "100", outstandingAmount: "100" },
};
const prisma = {
  enterpriseRetailInvoiceCheckout: {
    findMany: async ({ where }) => { capturedWhere = where; return [checkout]; },
    count: async () => 1,
  },
  enterpriseSite: { findMany: async () => [{ id: "shop-a", name: "Boutique A", warehouses: [] }], findFirst: async () => ({ timezone: "Africa/Kinshasa" }) },
  organization: { findFirst: async () => ({ timezone: "Africa/Kinshasa" }) },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: { invoiceCheckoutEnabled: true } }) },
};
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(apiSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, URL, Promise,
  require(name) {
    if (name === "next/server") return { NextResponse };
    if (name === "@/lib/audit") return { writeApiLog: async () => {}, writeAuditLog: async () => {} };
    if (name === "@/lib/enterprise/common/http") return { enterpriseValidationErrorResponse: () => { throw Error("validation not used"); } };
    if (name === "@/lib/enterprise/retail/http") return {
      authorizeRetailRequest: async () => ({ ok: true, session: { userId: "cashier" } }),
      retailErrorResponse: (error) => NextResponse.json({ code: error.code }, { status: error.status || 500 }),
      retailListParams: () => ({ page: 1, pageSize: 10, status: null }),
    };
    if (name === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError: class extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } } };
    if (name === "@/lib/enterprise/retail/civil-date") return civilDates.exports;
    if (name === "@/lib/enterprise/retail/invoice-checkout") return { retailInvoicePrepareSchema: { safeParse: () => ({ success: false }) } };
    if (name === "@/lib/enterprise/retail/site-access") return {
      retailInvoiceVisibleSites: async () => ({
        isOwner: false, siteIds: [], cancellableSiteIds: [], submittableSiteIds: [], collectibleSiteIds: ["shop-a"],
      }),
    };
    if (name === "@/lib/prisma") return { prisma };
    throw Error(`Unexpected module ${name}`);
  },
});

const params = { params: Promise.resolve({ organizationId: "tenant" }) };
const collections = await unit.exports.GET(new Request("https://app.dtsc-platform.com/api/enterprise/tenant/retail/invoices?view=collections&q=FAC"), params);
assert.equal(collections.status, 200);
assert.equal(collections.body.items[0].canCollect, true);
assert.equal(capturedWhere.siteId.in[0], "shop-a");
assert.deepEqual(Array.from(capturedWhere.invoice.status.in), ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);
assert.equal(capturedWhere.invoice.OR[0].number.contains, "FAC");
assert.equal(capturedWhere.invoice.OR[1].items.some.description.contains, "FAC");

const exact = await unit.exports.GET(new Request("https://app.dtsc-platform.com/api/enterprise/tenant/retail/invoices?view=collections&dateFrom=2026-11-09&dateTo=2026-11-09"), params);
assert.equal(exact.status, 200);
assert.equal(capturedWhere.invoice.invoiceDate.gte.toISOString(), "2026-11-08T23:00:00.000Z", "Kinshasa business day starts at 23:00 UTC");
assert.equal(capturedWhere.invoice.invoiceDate.lt.toISOString(), "2026-11-09T23:00:00.000Z");

const general = await unit.exports.GET(new Request("https://app.dtsc-platform.com/api/enterprise/tenant/retail/invoices"), params);
assert.equal(general.status, 200);
assert.equal(capturedWhere.siteId.in.length, 0, "Collection-only role cannot read the general invoicing register");
const forgedStore = await unit.exports.GET(new Request("https://app.dtsc-platform.com/api/enterprise/tenant/retail/invoices?view=collections&siteId=shop-b"), params);
assert.equal(forgedStore.status, 403, "Forged shop context must be denied server-side");
console.log("PASS #1080 — POS admin and store capability gates, one canonical job, invoice preview, cashier-only unpaid queue, scoped API");
