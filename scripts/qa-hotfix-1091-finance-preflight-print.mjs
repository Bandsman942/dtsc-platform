import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const paymentService = read("lib/enterprise/accounting/payments-service.ts");
const paymentRoute = read("app/api/enterprise/[organizationId]/payments/route.ts");
const paymentTransition = read("app/api/enterprise/[organizationId]/payments/[paymentId]/transition/route.ts");
const paymentUi = read("components/enterprise/professional/enterprise-finance-payments-workspace.tsx");
const invoiceUi = read("components/enterprise/professional/enterprise-finance-invoices-workspace.tsx");
const receivablesRoute = read("app/api/enterprise/[organizationId]/receivables/route.ts");
const printRoute = read("app/api/enterprise/[organizationId]/sales-invoices/[invoiceId]/print/route.ts");
const unvaluedRoute = read("app/api/enterprise/[organizationId]/inventory-unvalued-receipts/route.ts");
const unvaluedPanel = read("components/enterprise/professional/inventory-unvalued-receipts-panel.tsx");
const advancedFinanceUi = read("components/enterprise/professional/enterprise-advanced-finance-workspace.tsx");
const receiptValuationRoute = read("app/api/enterprise/[organizationId]/stock-movements/[movementId]/value-receipt/route.ts");
const inventoryAccountingService = read("lib/enterprise/accounting/inventory-accounting-service.ts");
const messages = read("components/enterprise/professional/finance-professional-ui.ts");

const has = (text, pattern, reason) => assert.match(text, pattern, reason);

// The list must not claim comprehensive readiness before expensive preflight;
// detail GET verifies facts without mutating stock or ledger.
has(paymentRoute, /recordId && recordId === item\.id && item\.status === "APPROVED"/, "Detailed preflight only");
has(paymentRoute, /inspectEnterprisePaymentConfirmation\(/, "Server preflight shared with detail");
has(paymentRoute, /canConfirm = Boolean\(capabilities\.canWrite[\s\S]*preflight\?\.ready/, "Confirm UI requires preflight");
has(paymentService, /export async function inspectEnterprisePaymentConfirmation\(/, "Public read-only preflight function");
for (const code of [
  "RETAIL_INVENTORY_COST_LAYER_REQUIRED", "RETAIL_INVOICE_PAYMENT_EXCEEDS_OUTSTANDING",
  "RETAIL_INVOICE_FINANCIAL_ACCOUNT_SITE_MISMATCH", "RETAIL_INVOICE_STOCK_INSUFFICIENT",
  "FINANCE_CONFIGURATION_NOT_READY", "PAYMENT_SELF_CONFIRMATION_FORBIDDEN",
]) {
  assert.ok(paymentService.includes(code), `Missing preflight blocker ${code}`);
  assert.ok(messages.includes(code), `Missing localized user message ${code}`);
}
has(paymentService, /enterpriseInventoryCostLayer\.findMany\(/, "Check real cost layers, not physical stock quantity alone");
has(paymentService, /getPostingPeriod\(tx, organizationId, payment\.paymentDate/, "Account for financial period");
has(paymentService, /resolveEnterpriseFinanceReadiness\(/, "Check accounting mappings and journals");
assert.doesNotMatch(paymentService.slice(paymentService.indexOf("export async function inspectEnterprisePaymentConfirmation("),paymentService.indexOf("export async function allocateEnterprisePayment(")), /enterpriseInventoryCostLayer\.(create|update|upsert)|enterpriseInventoryBalance\.(create|update|upsert)/, "Preflight cannot fabricate valuation or mutate inventory");
has(paymentUi, /function openPaymentDetail\(/, "Detail must refresh with preflight");
has(paymentUi, /PAYMENT_CONFIRMATION_PREFLIGHT_REQUIRED/, "No false-green list preview");
has(paymentUi, /blockerItems\.join\(", "\)/, "Named affected stock items");
has(messages, /const safeServerMessage = extractSafeFinanceClientMessage\(error\);[\s\S]*if \(status === 409\)/, "Safe business message must be shown before generic conflict");
has(paymentTransition, /ENTERPRISE_PAYMENT_\$\{parsed\.data\.action\}_DENIED/, "Trace failed confirmations");

has(paymentRoute, /linkedSalesInvoiceId: invoiceByPayment\.get/, "Linked canonical invoice ID on every payment list tab");
has(paymentRoute, /enterprisePaymentAllocation\.findMany\(/, "Existing reconciled payment allocations resolve invoice");
has(paymentUi, /printLinkedInvoice\(/, "Payment preview link");
has(paymentUi, /paymentId=\$\{paymentId\}/, "Payment print grant explicitly binds to its payment");
has(printRoute, /authorizeFinanceRequest\(req, organizationId, "FINANCE_PAYMENTS", "view"\)/, "Payment-based print still RBAC checked");
has(printRoute, /if \(!intent && !linkedReceivable\)/, "No arbitrary invoice print via payment ID");
has(printRoute, /retailFinanceReadSiteScope\(organizationId, userId, "COLLECT_PAYMENT"\)/, "Payment print enforces site scope");
has(printRoute, /"DOCUMENT NON ÉMIS — NE VAUT PAS FACTURE DÉFINITIVE"/, "Provisional documents watermark");
has(printRoute, /"DOCUMENT ANNULÉ — SANS VALEUR DE PAIEMENT"/, "Cancelled documents watermark");

for (const endpoint of ["sales-invoices", "receivables"]) assert.ok(invoiceUi.includes(endpoint));
has(invoiceUi, /record\.salesInvoiceId/, "Receivable/overdue printing resolves canonical invoice ID");
has(invoiceUi, /tab === "ageing"[\s\S]*<FinanceRecordList/, "Due dates must show drill-down list, not just summary buckets");
has(invoiceUi, /<FinancePaginationControls pagination=\{collection\.pagination\}/, "Pagination retained across due-date filters");
has(receivablesRoute, /retailFinanceReadSiteScope\(/, "Existing site isolation on receivables API");
assert.doesNotMatch(printRoute, /organizationId: (null|undefined)/, "Print remains tenant-scoped");

// Historical receipts are valued with their ACTUAL acquisition cost through
// the existing atomic canonical posting, never by duplicating stock movements.
has(unvaluedRoute, /authorizeFinanceRequest\\(req, organizationId, "FINANCE_INVENTORY", "view"\\)/, "Unvalued queue needs Finance Inventory permissions");
has(unvaluedRoute, /retailInventoryVisibleSites\\(/, "No cross-shop stock valuation exposure");
has(unvaluedRoute, /NOT EXISTS \\([\\s\\S]*EnterpriseInventoryCostLayer/, "Only genuinely unvalued receipts");
has(unvaluedRoute, /LIMIT \\$\\{pageSize\\} OFFSET \\$\\{offset\\}/, "Server-side pagination of unvalued receipts");
has(unvaluedPanel, /financeMutation\\(/, "Valuation UI submits actual movement, not placeholder");
has(unvaluedPanel, /evidenceChecked/, "Human acquisition-cost attestation");
has(advancedFinanceUi, /<InventoryUnvaluedReceiptsPanel/, "New valuation action is discoverable");
has(receiptValuationRoute, /"FINANCE_INVENTORY", "post"/, "Posting remains behind Finance Inventory RBAC");
has(inventoryAccountingService, /sourceMovementId: movement.id/, "Reuses original stock movement without double receipt");
has(inventoryAccountingService, /postBusinessEventTx/, "Valuation and journal posting remain atomic and idempotent");

for (const locale of ["fr", "en"]) {
  const i18n = JSON.parse(read(`locales/enterprise-finance.${locale}.json`));
  for (const key of ["affectedStockItems", "allDueDates", "detailsLabel", "noLinkedCustomerInvoice", "printInvoicePreview", "inventoryUnvaluedTitle", "inventoryUnvaluedPost", "inventoryUnvaluedProofRequired"]) {
    assert.equal(typeof i18n[key], "string", `${locale} missing ${key}`);
  }
}
console.log("HOTFIX #1091: Finance readiness, localized errors, multi-flow invoice preview and isolation contracts OK.");
