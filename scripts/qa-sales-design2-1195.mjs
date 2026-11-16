import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const ui = read("components/enterprise/professional/enterprise-sales-operations-workspace.tsx");
const quotes = read("app/api/enterprise/[organizationId]/quotes/route.ts");
const orders = read("app/api/enterprise/[organizationId]/sales-orders/route.ts");
const print = read("lib/enterprise/crm-sales/print-documents.ts");
const quotePrint = read("app/api/enterprise/[organizationId]/quotes/[quoteId]/print/route.ts");
const orderPrint = read("app/api/enterprise/[organizationId]/sales-orders/[salesOrderId]/print/route.ts");
const exportUi = read("components/enterprise/professional/finance-design2-controls.tsx");
const fr = JSON.parse(read("locales/professional-erp-sales.fr.json"));
const en = JSON.parse(read("locales/professional-erp-sales.en.json"));
const docs = read("docs/ERP_PROFESSIONAL_SALES.md");

let checks = 0;
function check(title, source, patterns) {
  for (const pattern of patterns) assert.match(source, pattern, title);
  checks += 1;
  console.log("PASS", title);
}

check("Print routes delegate to the same read-only canonical renderer", quotePrint + orderPrint, [
  /printCommercialDocument\(req, organizationId, quoteId, "quote"\)/,
  /printCommercialDocument\(req, organizationId, salesOrderId, "order"\)/,
]);
check("Print checks current session, tenant and module READ permission", print, [
  /getSession\(\)/, /getEnterpriseCommonDomainAccess/, /moduleCode: "SALES_QUOTES_ORDERS"/,
  /action: "read"/, /id: recordId, organizationId, archivedAt: null/,
  /id: organizationId, status: "ACTIVE", deletedAt: null/,
]);
check("Print uses canonical quote / order / parties / fulfillment records", print, [
  /enterpriseQuote.findFirst/, /enterpriseSalesOrder.findFirst/, /enterpriseBusinessParty.findFirst/,
  /businessPartyId/, /fulfillments/, /quantityFulfilled/, /relatedReference/, /sourceReference/,
]);
check("Printable totals are persisted server values, not browser recomputation", print, [
  /subtotal: quote.subtotalAmount/, /discounts: quote.discountAmount/, /taxes: quote.taxAmount/,
  /total: quote.totalAmount/, /subtotal: order.subtotalAmount/, /total: order.totalAmount/,
]);
check("Print has A4 layout, FR-EN status, draft and invalid warnings", print, [
  /@page\{size:A4/, /table-wrap\{max-width:100%;overflow-x:auto/, /@media print/, /DRAFT/, /PENDING_APPROVAL/, /REJECTED/, /EXPIRED/, /CANCELLED/,
  /CONVERTED/, /IN_FULFILLMENT/, /PARTIALLY_FULFILLED/, /FULFILLED/, /CLOSED/, /lang=/,
]);
check("Print escapes customer-supplied content and blocks caching / embedding", print, [
  /replaceAll\("&", "&amp;"\)/, /safe\(line.description\)/, /safe\(organization.name\)/,
  /safe\(document.reference\)/, /"cache-control": "private, no-store/, /"content-security-policy"/,
  /frame-ancestors 'none'/, /filename.*downloadName/,
]);
assert.doesNotMatch(print, /enterpriseSalesInvoice\.create|enterprisePayment\.create|enterpriseJournalEntry\.create/, "Printing must never post financial documents");
checks++;
check("Server-side filtered quotes by customer and validated dates", quotes, [
  /financeBusinessDateRange/, /matchingParties/, /legalName/, /displayName/, /businessPartyId: \{ in: clientIds \}/,
  /createdAt: \{/, /dates.from/, /dates.to/, /SALES_SEARCH_TOO_BROAD/,
]);
check("Server-side filtered orders by customer and validated dates", orders, [
  /financeBusinessDateRange/, /matchingParties/, /legalName/, /displayName/, /businessPartyId: \{ in: clientIds \}/,
  /createdAt: \{/, /dates.from/, /dates.to/, /SALES_SEARCH_TOO_BROAD/,
]);
check("Design 2.0 register exposes all-status print, colored KPI, date and export controls", ui, [
  /data-sales-register/, /lg:\[&>div\]:grid-cols-5/,
  /printCommercial\("quote", quote.id\)/, /printCommercial\("order", order.id\)/,
  /FinanceDateFilter/, /FinanceExportControls/, /statusRail/, /data-horizontal-rail/,
]);
check("Product vs service fulfillment and active order status", ui, [
  /fulfillmentType: String\(form.get\("fulfillmentType"\)/, /SERVICE_DELIVERY/, /name="fulfillmentType"/,
  /IN_FULFILLMENT/, /idempotencyKey: fulfillmentKey/,
]);
check("Module does not fork invoices, payments, accounts or stock ledgers", ui, [
  /\/quotes/, /\/sales-orders/, /\/fulfill/, /FINANCE_RECEIVABLES/, /INVENTORY_LOGISTICS/,
  /quote\.revision/, /fulfillTarget\.revision/, /idempotencyKey: fulfillmentKey/,
]);
check("Shared premium exports preserve full filtered results, not just first page", exportUi, [
  /for \(let start = 2; start <= pages/, /downloadProfessionalCsv/, /downloadProfessionalXlsx/,
  /downloadProfessionalPdf/, /subtitleFr/, /subtitleEn/,
]);
for (const key of ["sales.printPreview", "sales.printHelp", "sales.statusRail", "sales.connectedModules", "sales.financeHandoffHelp"]) {
  assert.equal(typeof fr[key], "string", "Missing FR " + key);
  assert.equal(typeof en[key], "string", "Missing EN " + key);
}
checks++;
check("Sales documentation records print, cross-module and receipt/invoice separation", docs, [/aperçu A4/i, /factur/i, /stock/i]);

console.log("ERP SALES 1195: " + checks + " static contracts passed. These do not substitute for rendered browser acceptance or OWNER_E2E.");
