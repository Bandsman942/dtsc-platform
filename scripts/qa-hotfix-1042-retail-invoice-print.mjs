import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/print/route.ts");
const workbench = read("components/enterprise/professional/retail-invoice-flow-workbench.tsx");

class NextResponse {
  constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.headers = init.headers || {}; }
  static json(body, init) { return new NextResponse(body, init); }
}
const amount = (value) => ({ toFixed: () => String(value), toString: () => String(value), valueOf: () => value });
const checkout = {
  id: "checkout-a", siteId: "site-a", preparedByUserId: "invoicer-a",
  site: { id: "site-a", name: "Boutique <Nord>", addressLine1: "Avenue des Écoles", city: "Kinshasa", countryCode: "CD", timezone: "Africa/Kinshasa" },
  invoice: {
    id: "invoice-a", status: "DRAFT", number: "FAC-001", businessPartyId: "customer-a", invoiceDate: new Date("2026-11-07T10:15:00Z"), currencyCode: "CDF",
    subtotal: amount(6000), discountTotal: amount(100), taxTotal: amount(200), grandTotal: amount(6100), amountPaid: amount(0), outstandingAmount: amount(6100),
    items: [{ description: "Lait <script>alert('x')</script>", quantity: amount(2), unitPrice: amount(3000), totalAmount: amount(6000) }],
  },
};
let visible = true;
let auditCount = 0;
const prisma = {
  enterpriseRetailInvoiceCheckout: { findFirst: async () => checkout },
  organization: { findFirst: async () => ({ name: "Boutiques & Fils", timezone: "Africa/Kinshasa", logoUrl: "company-logos/tenant/logo.png" }) },
  enterpriseBusinessParty: { findFirst: async () => ({ displayName: "Client <VIP>", legalName: "client" }) },
  user: { findUnique: async () => ({ name: "Agent A" }) },
};
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: unit.exports,
  URL,
  Intl,
  require(name) {
    if (name === "next/server") return { NextResponse };
    if (name === "@/lib/audit") return { writeApiLog: async () => { auditCount++; } };
    if (name === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError: class extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } } };
    if (name === "@/lib/enterprise/retail/http") return {
      authorizeRetailRequest: async () => ({ ok: true, session: { userId: "invoicer-a" } }),
      retailErrorResponse: (error) => NextResponse.json({ error: error.code || "FAILED" }, { status: error.status || 500 }),
    };
    if (name === "@/lib/enterprise/retail/site-access") return {
      retailInvoiceVisibleSites: async () => ({ isOwner: false, siteIds: visible ? ["site-a"] : ["site-b"], collectibleSiteIds: [] }),
    };
    if (name === "@/lib/enterprise/organization-logo-storage") return { resolveOrganizationLogoStoragePath: () => "company-logos/tenant/logo.png" };
    if (name === "@/lib/prisma") return { prisma };
    throw Error(`Unexpected import: ${name}`);
  },
});

const invoke = (paper, lang) => unit.exports.GET(
  { url: `https://app.dtsc-platform.com/api/enterprise/tenant/retail/invoices/invoice-a/print?paper=${paper}&lang=${lang}` },
  { params: Promise.resolve({ organizationId: "tenant", invoiceId: "invoice-a" }) },
);
const a4 = await invoke("a4", "fr");
assert.equal(a4.status, 200);
assert.match(a4.headers["content-type"], /text\/html/);
assert.equal(a4.headers["cache-control"], "private, no-store");
assert.equal(auditCount, 1);
assert.match(a4.body, /@page\{size:A4/);
assert.match(a4.body, /Boutiques &amp; Fils/);
assert.match(a4.body, /<img class="company-logo" src="\/api\/enterprise\/tenant\/logo"/);
assert.match(a4.body, /Boutique &lt;Nord&gt;/);
assert.match(a4.body, /Client &lt;VIP&gt;/);
assert.match(a4.body, /Lait &lt;script&gt;/);
assert.doesNotMatch(a4.body, /<script>/);
assert.match(a4.body, /BROUILLON.*NE VAUT PAS FACTURE/);
assert.match(a4.body, /Reste dû/);
const thermal = await invoke("thermal", "en");
assert.equal(thermal.status, 200);
assert.match(thermal.body, /@page\{size:80mm auto/);
assert.match(thermal.body, /DRAFT.*NOT AN ISSUED INVOICE/);
assert.match(thermal.body, /Outstanding/);

visible = false;
const rejected = await invoke("a4", "fr");
assert.equal(rejected.status, 404);
assert.equal(rejected.body.error, "RETAIL_INVOICE_NOT_FOUND");
assert.equal(auditCount, 2, "Cross-store invoice attempt cannot be audited as an authorized print");

visible = true;
checkout.invoice.status = "ISSUED";
const collectionPrint = unit.exports.GET(
  { url: "https://app.dtsc-platform.com/api/enterprise/tenant/retail/invoices/invoice-a/print" },
  { params: Promise.resolve({ organizationId: "tenant", invoiceId: "invoice-a" }) },
);
assert.equal((await collectionPrint).status, 200);

assert.match(workbench, /copy\.printA4/);
assert.match(workbench, /copy\.printThermal/);
assert.match(workbench, /\/print\?paper=a4&lang=/);
assert.match(workbench, /\/print\?paper=thermal&lang=/);

console.log("PASS #1042: printable Finance invoice A4/80mm FR/EN, escaped customer content, draft watermark and cross-store 404");
