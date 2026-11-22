import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const settingsCode = read("lib/enterprise/retail/operating-settings.ts");
const compiled = ts.transpileModule(settingsCode, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
class EnterpriseRetailError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
vm.runInNewContext(compiled, {
  exports, module: { exports },
  require: (id) => {
    if (id === "zod") return require("zod");
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@prisma/client") return { Prisma: {} };
    throw new Error("Unexpected import " + id);
  },
});
const { readRetailOperatingSettings, mergeRetailOperatingSettings, retailInvoiceFooterSnapshot, readRetailInvoiceFooterSnapshot } = exports;
const original = { invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: true, anotherFeature: "preserved" };
const defaults = readRetailOperatingSettings(original);
assert.equal(defaults.directCheckoutEnabled, false, "Legacy tenants remain cashier-separated");
assert.equal(defaults.quickPrintEnabled, false);
assert.equal(defaults.simplifiedNavigationEnabled, false);
const enabled = { ...defaults, directCheckoutEnabled: true, quickPrintEnabled: true,
  simplifiedNavigationEnabled: true, footerLinesFr: ["Vérifiez les marchandises", "Droits légaux conservés"] };
const root = mergeRetailOperatingSettings(original, enabled);
assert.equal(root.anotherFeature, "preserved", "Other settings are never overwritten");
const direct = readRetailOperatingSettings(root);
assert.equal(direct.directCheckoutEnabled, true);
assert.equal(direct.quickPrintEnabled, true);
const separate = { ...enabled, directCheckoutEnabled: false, defaultPaper: "A4" };
const withStore = mergeRetailOperatingSettings(root, separate, "site-B");
assert.equal(readRetailOperatingSettings(withStore, "site-A").directCheckoutEnabled, true);
assert.equal(readRetailOperatingSettings(withStore, "site-B").directCheckoutEnabled, false);
const newerCompany = mergeRetailOperatingSettings(withStore, { ...enabled, quickPrintEnabled: false });
assert.equal(readRetailOperatingSettings(newerCompany, "site-B").quickPrintEnabled, false, "Unmodified store settings retain inheritance");
const reverted = mergeRetailOperatingSettings(withStore, enabled, "site-B");
assert.equal(readRetailOperatingSettings(reverted, "site-B").directCheckoutEnabled, true);
assert.equal(Boolean(reverted.retailSiteOperatingOverrides["site-B"]), false, "Company values clear redundant store overrides");
const historical = retailInvoiceFooterSnapshot(root, "site-A");
assert.deepEqual(Array.from(readRetailInvoiceFooterSnapshot(historical, "fr")), enabled.footerLinesFr);
assert.deepEqual(Array.from(readRetailInvoiceFooterSnapshot(historical, "en")), []);
assert.throws(() => readRetailOperatingSettings({ retailOperatingSettings: { directCheckoutEnabled: "yes" } }), /RETAIL_OPERATING_SETTINGS_INVALID/);
assert.throws(() => readRetailOperatingSettings({ retailSiteOperatingOverrides: { "site-B": { defaultPaper: "INVOICE" } } }, "site-B"), /RETAIL_OPERATING_SETTINGS_INVALID/);

const service = read("lib/enterprise/retail/direct-checkout.ts");
const route = read("app/api/enterprise/[organizationId]/retail/direct-checkout/route.ts");
const options = read("app/api/enterprise/[organizationId]/retail/direct-checkout/options/route.ts");
const admin = read("app/api/enterprise/[organizationId]/retail/operating-settings/route.ts");
const flow = read("components/enterprise/professional/retail-invoice-flow-workbench.tsx");
const finance = read("lib/enterprise/accounting/payments-service.ts");
const prep = read("lib/enterprise/retail/invoice-checkout.ts");
const print = read("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/print/handler.ts");
const migration = read("prisma/migrations/20261122130000_retail_direct_checkout_1216/migration.sql");
const prisma = read("prisma/enterprise-retail-direct-checkout.prisma");
const page = read("components/enterprise/enterprise-administration-module.tsx");
const run = (name, code, rules) => { for (const rule of rules) assert.match(code, rule, name); console.log("PASS", name); };
run("Server route is mutation-protected", route, [/authorizeRetailRequest/, /retailDirectCashCheckoutSchema\.safeParse/, /writeApiLog/]);
run("Direct checkout requires scoped self approvals and live CASH session", service, [
  /"PREPARE_INVOICE", "ISSUE_INVOICE", "COLLECT_PAYMENT", "OPEN_CASH"/,
  /hasRetailSelfApprovalGrant/, /cashierUserId: actorUserId/, /status: "OPEN"/,
  /methodType: z\.literal\("CASH"\)/, /readRetailOperatingSettings/,
]);
run("Durable retry and lock do not invent financial balances", service, [
  /requestFingerprint/, /randomUUID/, /lockUntil/, /findUniqueOrThrow/, /upsert/, /"COMPLETED"/,
  /prepareRetailInvoice/, /proposeRetailInvoicePayment/, /transitionEnterprisePayment/, /tx\.auditLog\.create/,
  /submitSalesInvoiceForAssignedApproval/, /decideSalesInvoiceAssignedApproval/,
  /submitPaymentForAssignedApproval/, /approvePaymentAssignedApproval/,
  /transitionSalesInvoice/,
]);
assert.doesNotMatch(service, /enterpriseCashMovement\.create|enterpriseTreasuryTransaction\.create|enterpriseStockMovement\.create|postBusinessEventTx/,
  "No direct CASH / treasury / inventory / posting dual-write");
run("Finance remains the single accounting boundary", finance, [
  /enterpriseCashMovement\.create/, /enterpriseTreasuryTransaction\.create/, /allocateConfirmedRetailPaymentTx/,
  /postPaidRetailInvoiceStockTx/, /TransactionIsolationLevel\.Serializable/,
]);
run("Invoice caps CASH before creating a draft and freezes footer", prep, [
  /checkoutExpectations\.cashTendered\.lessThan\(calculatedTotal\)/, /checkoutExpectations\.expectedGrandTotal/, /invoiceFooterSnapshot: retailInvoiceFooterSnapshot/,
]);
run("Store options and strict configurable mode", options, [/requireRetailSiteCapability/, /hasRetailSelfApprovalGrant/, /cashierUserId: auth\.session\.userId/, /directAllowed/]);
run("Only owner can configure and each change is audited inside transaction", admin, [
  /RETAIL_OWNER_ROLES/, /hasRecentStepUp/, /FOR UPDATE/, /revision: \{ increment: 1 \}/, /tx\.auditLog\.create/,
]);
run("Client only pays net, prints after completion", flow, [
  /data-retail-direct-cash/, /cashTendered/, /cashChange/, /copy\.directFinal/, /value\?\.status !== "COMPLETED"/, /popup\.location\.replace/,
]);
run("Printed footers come from the historical invoice", print, [/readRetailInvoiceFooterSnapshot\(checkout\.invoiceFooterSnapshot, locale\)/, /escapeHtml\(line\)/, /autoPrint/]);
run("Available inside Enterprise Administration", page, [/COMMERCE_RETAIL/, /RetailOperatingSettingsPanel/]);
run("Migration and Prisma indexes are additive", migration, [/ADD COLUMN "invoiceFooterSnapshot" JSONB/, /CREATE TABLE "EnterpriseRetailDirectCheckoutAttempt"/, /idempotencyKey_key/]);
run("Model is scoped and idempotent", prisma, [/organizationId/, /actorUserId/, /@@unique\(\[organizationId, idempotencyKey\]\)/]);
console.log("QA #1216: operating mode settings behavior, CASH security and source-of-truth contracts PASS. Owner E2E remains distinct.");
