import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const has = (path, pattern, message) =>
  assert.match(read(path), pattern, `${path}: ${message}`);

const retail = "components/enterprise/professional/retail-invoice-flow-workbench.tsx";
const cashier = "components/enterprise/professional/retail-invoice-cashier-workbench.tsx";
const payment = "components/enterprise/professional/retail-invoice-payment-dialog.tsx";
const invoiceRoute = "app/api/enterprise/[organizationId]/retail/invoices/route.ts";
const retailPage = "app/enterprise-modules/retail-page.tsx";
const retailEntry = "app/enterprise-modules/RETAIL_POS/page.tsx";

has(retail, /data\.checkoutReady && entry\.canCollect && \["ISSUED", "OVERDUE", "PARTIALLY_PAID"\]/, "collection link must require store capability and an issued/unpaid state");
has(retail, /Number\(entry\.invoice\.outstandingAmount\) > 0/, "collection link must not appear for settled invoices");
has(retail, /section=collections&siteId=.*invoiceId=.*invoiceNumber=/, "collection deep link must bind store and exact invoice");
has(retail, /mode === "checkout"[\s\S]*section=invoices/, "counter sale to invoice-register navigation retained");
has(retailEntry, /invoiceId\?: string; invoiceNumber\?: string/, "RETAIL_POS search parameters must accept invoice ID and search key");
has(retailPage, /getRetailPosSection\(options\?\.section, canManagePos, posCapabilities\)/, "section access must still be server-side");
has(retailPage, /targetInvoiceId=\{options\?\.invoiceId\} targetInvoiceNumber=\{options\?\.invoiceNumber\}/, "exact targeted ID and searchable invoice number must reach cashier view");
has("components/enterprise/professional/retail-pos-section-navigation.tsx", /id: "collections"[^\n]+requiredCapability: "COLLECT_PAYMENT"/, "collections entry must require COLLECT_PAYMENT");
has(cashier, /query\.set\("q", targetInvoiceNumber\)/, "cashier must search by invoice number using frozen canonical q filter");
has(cashier, /entry\.invoice\.id === targetInvoiceId && entry\.invoice\.number === targetInvoiceNumber/, "cashier must match returned ID and number, never substring alone");
has(cashier, /initialOpen=\{Boolean\(targetInvoiceId && entry\.invoice\.id === targetInvoiceId\)\}/, "cashier payment dialog must open only for a matching invoice");
has(payment, /initialOpen = false/, "manual cashiers must remain unchanged without deep link");
has(payment, /setOpen\] = useState\(initialOpen\)/, "direct link initializes the existing payment dialog");
has(payment, /\["ISSUED", "PARTIALLY_PAID", "OVERDUE"\]\.includes\(overview\.invoiceStatus\)/, "payment dialog must enforce invoice state");
has(invoiceRoute, /searchParams\.get\("q"\)/, "immutable invoice API must retain canonical invoice-number search");
has(invoiceRoute, /number: \{ contains: search, mode: "insensitive" \}/, "invoice search must retain server-side number filter");
assert.doesNotMatch(read(invoiceRoute), /searchParams\.get\("invoiceId"\)/, "ROUTES-05A frozen invoice handler must not gain new id filter");
has(invoiceRoute, /organizationId,[\s\S]*permittedSites/, "invoice query must remain tenant/store-scoped");
has(invoiceRoute, /collectibleSiteIds/, "collections must filter permitted store IDs");
has(invoiceRoute, /"ISSUED", "PARTIALLY_PAID", "OVERDUE"/, "backend must exclude draft/approved-only invoices");

const links = "components/enterprise/enterprise-finance-related-links.tsx";
has(links, /session\?\.activeContext !== "ORGANIZATION"/, "cross-module links must require active organization context");
has(links, /resolveEnterpriseModuleAccess\(\{ userId: session\.userId, organizationId, moduleCode: code, action: "read" \}\)/, "cross-module destinations must check effective backend rights");
for (const code of ["FINANCE_CLOSE", "FINANCE_STATEMENTS", "FINANCE_ASSETS", "FINANCE_INVENTORY", "REPORTS"]) {
  assert.ok(read(links).includes(`${code}:`), `missing related-module navigation for ${code}`);
}
has("components/enterprise/enterprise-finance-module-page.tsx", /<EnterpriseFinanceRelatedLinks organizationId=\{organizationId\} fromCode=\{moduleCode\}/, "Finance modules must render permissioned links");
has("components/enterprise/enterprise-module-workspace.tsx", /<EnterpriseFinanceRelatedLinks organizationId=\{organizationId\} fromCode="REPORTS"/, "Reports must render permissioned links");

const finance = "components/enterprise/professional/enterprise-finance-advanced-workspace.tsx";
has(finance, /FORM_GUIDANCE/, "financial creation dialogs must show business guidance");
has(finance, /aria-pressed=\{status === value\}/, "status rails must be keyboard-accessible");
has(finance, /t\("acquisitionCost"\)/, "capitalization value must have visible label");
has(finance, /name="inServiceDate" type="date"/, "asset capitalization must keep service date");
const inventory = "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx";
has(inventory, /definition\.code === "FINANCE_INVENTORY"/, "stock valuation must explain accounting and physical data boundaries");
has(inventory, /Live valuation: historical date snapshots are unavailable/, "no fabricated historical valuations");
has(inventory, /InventoryUnvaluedReceiptsPanel/, "real cost-entry workflow must remain available");

const reports = "components/enterprise/core-v2/enterprise-reports-workspace.tsx";
has(reports, /value\.set\("from", dateFrom\)/, "reports must submit from-date filter");
has(reports, /value\.set\("to", dateTo\)/, "reports must submit to-date filter");
has(reports, /aria-pressed=\{status === value\}/, "reports must provide accessible status filter");
has(reports, /<FullscreenEntityDetail/, "premium report detail must remain available");
has(reports, /downloadProfessionalPdfV2/, "real PDF export must remain available");

has(reports, /t\("reports\.filter\.statusRail"\)/, "Report status rail must use canonical translations");
assert.doesNotMatch(read(reports), /locale\s*===\s*["']en["']\s*\?\s*["'`]/, "Reports must not add local language ternaries");
for (const locale of ["fr", "en"]) {
  const translations = JSON.parse(read(`locales/enterprise-procurement.${locale}.json`));
  for (const key of ["reports.filter.search", "reports.filter.family", "reports.filter.from", "reports.filter.to", "reports.filter.clear", "reports.filter.statusRail", "reports.filter.allStatuses", "reports.filter.dateHelp"]) {
    assert.ok(typeof translations[key] === "string" && translations[key].trim(), `Missing report translation ${locale}/${key}`);
  }
}

const api = "app/api/enterprise/[organizationId]/reports/route.ts";
has(api, /isCivilDate\(from\)/, "report dates must validate civil date");
has(api, /from > to/, "inverted report intervals must be rejected");
has(api, /civilMidnightUtc\(followingCivilDate\(to\), timezone\)/, "inclusive last local date must use exclusive next-day boundary");
has(api, /enterpriseReportVisibilityWhere/, "report listings must remain tenant/visibility scoped");
console.log("PASS — RETAIL invoice collection + five Finance/Reports UX/API hotfix contracts");
