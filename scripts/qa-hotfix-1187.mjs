import assert from "node:assert/strict";
import fs from "node:fs";
let passed = 0;
function check(path, tokens) {
  const text = fs.readFileSync(path, "utf8");
  for (const token of tokens) {
    assert.ok(text.includes(token), "Missing contract in " + path + ": " + token);
    passed += 1;
  }
}
check("app/api/enterprise/[organizationId]/retail/site-assignments/route.ts", [
  "isRetailEnterpriseProprietor", "organization.ownerUserId === userId", 'role: true', 'status: "ACTIVE"',
  "canGrantSelfApproval:", "RETAIL_SITE_SELF_APPROVAL_OWNER_ONLY",
]);
check("components/enterprise/professional/retail-site-staff-access.tsx", [
  "canSelectDelegation", "updateCapability", "SELF_APPROVE_INVOICE",
  "SELF_APPROVE_PAYMENT", "SELF_APPROVE_INVOICE_RETURN", 'next.add("PREPARE_INVOICE")',
  'next.add("COLLECT_PAYMENT")', 'next.delete("SELF_APPROVE_INVOICE")',
]);
check("lib/enterprise/retail/commercial-engine.ts", [
  "invoiceCheckoutFx", "resolveExchangeRateDetails", "FINANCE_EXCHANGE_RATE_REQUIRED",
  "RETAIL_INVOICE_FUNCTIONAL_CURRENCY_REQUIRED", "originalUnitPrice", "invoiceFx",
  "taxIncluded", "serviceUnitPrice",
]);
check("lib/enterprise/retail/invoice-checkout.ts", [
  "invoiceCheckoutFx: true", "snapshotExchangeRate", "EnterpriseSalesInvoiceItem",
  "RETAIL_INVOICE_EXCHANGE_RATE_STALE", "requestFingerprint", "RETAIL_INVOICE_PRICING_MISMATCH",
]);
check("app/api/enterprise/[organizationId]/retail/invoice-fx-preview/route.ts", [
  "authorizeRetailRequest", "retailPricingPreviewSchema", "invoiceCheckoutFx: true",
  "RETAIL_FINANCE_PROMOTION_LEDGER_REQUIRED", "serializeRetailPricingPreview",
]);
check("app/api/enterprise/[organizationId]/retail/invoice-currency/route.ts", [
  "authorizeRetailRequest", "enterpriseFinanceConfiguration", "functionalCurrencyCode",
]);
check("components/enterprise/professional/retail-invoice-flow-workbench.tsx", [
  "invoice-fx-preview", "invoice-currency", "invoiceFx", "originalUnitPrice",
  "pricing?.grandTotal", "const currencyCode = invoiceCurrency",
]);
check("app/api/enterprise/[organizationId]/purchases/route.ts", [
  "pendingAssignedApproval", 'targetEntityType: "EnterprisePurchase"',
  "approverUserId: session.userId", 'status: "PENDING"', 'createdAt.lt = end',
  "PURCHASE_DATE_RANGE_INVALID",
]);
check("components/enterprise/core-v2/enterprise-purchases-workspace.tsx", [
  "startReview", "decidePurchase", "PREPARE_REVIEW", "reviewedVersionId",
  "FinanceDateFilter", "FinanceExportControls", "data-purchase-review",
  "reviewChecked", "ShieldX",
]);
const manifest = JSON.parse(fs.readFileSync("docs/routing/routes-05a-retail-manifest.json", "utf8"));
assert.equal(manifest.routes.length, 24, "All original consolidated Retail handlers remain in the manifest");
passed++;
assert.ok(manifest.routes.some((entry) => entry.handlerPath.endsWith("/pricing/preview/handler.ts")));
passed++;
console.log("HOTFIX #1187 " + passed + "/" + passed + " static source checks passed; dynamic, CI and E2E still mandatory.");
