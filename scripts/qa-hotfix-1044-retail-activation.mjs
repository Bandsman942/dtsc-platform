import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const service = fs.readFileSync("lib/enterprise/retail/feature-activation.ts", "utf8");
const route = fs.readFileSync("app/api/enterprise/[organizationId]/retail/feature-activation/route.ts", "utf8");
const panel = fs.readFileSync("components/enterprise/professional/retail-feature-activation-panel.tsx", "utf8");
const page = fs.readFileSync("app/enterprise-modules/retail-page.tsx", "utf8");

class EnterpriseRetailError extends Error {
  constructor(code, status, details) { super(code); this.code = code; this.status = status; this.details = details; }
}
const current = {
  organizationId: "tenant-A",
  revision: 1,
  settingsJson: { otherPreference: "preserved", siteStaffIsolationEnabled: false, invoiceCheckoutEnabled: false },
  retail: true,
  staff: [
    { siteId: "store-A", roleCode: "INVOICER", permissionsJson: null },
    { siteId: "store-A", roleCode: "CASHIER", permissionsJson: null },
  ],
  financeReady: true,
  nonOwnerMembers: 1,
  invoices: 0, returns: 0, payments: 0,
};
const audit = [];
const prisma = {
  organization: { findFirst: async ({ where }) => where.id === current.organizationId && current.retail ? { id: where.id } : null },
  enterpriseRetailConfiguration: {
    findUnique: async ({ where }) => where.organizationId === current.organizationId ? {
      id: "retail-config", status: "ACTIVE", baseCurrencyCode: "CDF",
      settingsJson: current.settingsJson, revision: current.revision,
    } : null,
    updateMany: async ({ where, data }) => {
      if (where.organizationId !== current.organizationId || where.revision !== current.revision) return { count: 0 };
      current.settingsJson = { ...data.settingsJson };
      current.revision += data.revision.increment;
      return { count: 1 };
    },
  },
  enterpriseSite: { findMany: async () => [{ id: "store-A" }] },
  enterpriseWarehouse: { findMany: async () => [{ siteId: "store-A" }] },
  enterpriseFinancialAccount: { findMany: async () => [{ siteId: "store-A", currencyCode: "CDF" }] },
  enterpriseRetailSiteAssignment: { findMany: async () => current.staff },
  organizationMember: { count: async () => current.nonOwnerMembers },
  enterpriseRetailInvoiceCheckout: { count: async () => current.invoices },
  enterpriseRetailInvoiceReturnRequest: { count: async () => current.returns },
  enterpriseRetailInvoicePaymentProposal: { count: async () => current.payments },
  auditLog: {
    create: async ({ data }) => { audit.push(data); return data; },
    findMany: async () => audit.map((data, id) => ({ ...data, id: String(id), createdAt: new Date(), user: { name: "Shop owner" } })).reverse(),
    count: async () => audit.length,
  },
  $executeRaw: async () => 1,
  $transaction: async (fn) => fn(prisma),
};
const code = ts.transpileModule(service, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const unit = { exports: {} };
const Prisma = { sql: (strings) => strings.join("?"), TransactionIsolationLevel: { Serializable: "Serializable" } };
vm.runInNewContext(code, {
  module: unit, exports: unit.exports,
  require: (id) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "@/lib/prisma") return { prisma };
    if (id === "@/lib/enterprise/accounting/finance-readiness-service") return { resolveEnterpriseFinanceReadiness: async () => ({
      ready: current.financeReady, configuration: { functionalCurrencyCode: "CDF", readinessStatus: current.financeReady ? "READY" : "DRAFT" },
    }) };
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@/lib/enterprise/retail/site-access") return {
      RETAIL_OWNER_ROLES: new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]),
      siteStaffCapabilities: (role) => role === "INVOICER" ? ["VIEW_SALES", "PREPARE_INVOICE"] : role === "CASHIER" ? ["VIEW_SALES", "COLLECT_PAYMENT"] : [],
    };
    throw new Error(`Unmocked import: ${id}`);
  },
  Promise, Date, Math, Set, Object,
});
const { getRetailFeatureActivation, changeRetailFeatureActivation } = unit.exports;
const change = (feature, enabled, revision = current.revision) => changeRetailFeatureActivation({
  organizationId: "tenant-A", actorUserId: "owner", feature, enabled, revision, reason: "Owner decision after readiness review",
});

assert.equal((await getRetailFeatureActivation("tenant-A")).flags.siteStaffIsolationEnabled, false, "Existing tenants stay OFF");
await assert.rejects(getRetailFeatureActivation("tenant-B"), { code: "RETAIL_SECTOR_REQUIRED" }, "Cross-tenant reads are denied");
assert.equal((await getRetailFeatureActivation("tenant-A")).prerequisites.invoiceCheckoutEnabled.ready, false, "Invoicing depends on isolation");
await assert.rejects(change("invoiceCheckoutEnabled", true), { code: "RETAIL_FEATURE_ACTIVATION_NOT_READY" });
current.staff = [];
await assert.rejects(change("siteStaffIsolationEnabled", true), { code: "RETAIL_FEATURE_ACTIVATION_NOT_READY" }, "Missing view-capable staff cannot enable isolation");
current.staff.push({ siteId: "store-A", roleCode: "INVOICER", permissionsJson: null }, { siteId: "store-A", roleCode: "CASHIER", permissionsJson: null });
const first = await change("siteStaffIsolationEnabled", true);
assert.equal(first.revision, 2);
assert.equal(current.settingsJson.otherPreference, "preserved", "Unrelated settings must not be lost");
await assert.rejects(change("siteStaffIsolationEnabled", false, 1), { code: "RETAIL_FEATURE_ACTIVATION_CONFLICT" }, "Stale changes are rejected");
await assert.rejects(change("siteStaffIsolationEnabled", true), { code: "RETAIL_FEATURE_ACTIVATION_UNCHANGED" }, "No-op is rejected");
current.financeReady = false;
await assert.rejects(change("invoiceCheckoutEnabled", true), { code: "RETAIL_FEATURE_ACTIVATION_NOT_READY" }, "Finance blocks invoice activation");
current.financeReady = true;
await change("invoiceCheckoutEnabled", true);
assert.equal(current.settingsJson.invoiceCheckoutEnabled, true);
await assert.rejects(change("siteStaffIsolationEnabled", false), { code: "RETAIL_FEATURE_ISOLATION_DEPENDENCY" }, "Invoice requires isolation");
current.invoices = 1;
await assert.rejects(change("invoiceCheckoutEnabled", false), { code: "RETAIL_FEATURE_INVOICE_ROLLBACK_BLOCKED" }, "Open invoices block rollback");
current.invoices = 0;
current.returns = 1;
await assert.rejects(change("invoiceCheckoutEnabled", false), { code: "RETAIL_FEATURE_INVOICE_ROLLBACK_BLOCKED" }, "Open returns block rollback");
current.returns = 0;
current.payments = 1;
await assert.rejects(change("invoiceCheckoutEnabled", false), { code: "RETAIL_FEATURE_INVOICE_ROLLBACK_BLOCKED" }, "Pending payment blocks rollback");
current.payments = 0;
await change("invoiceCheckoutEnabled", false);
await assert.rejects(change("siteStaffIsolationEnabled", false), { code: "RETAIL_FEATURE_ISOLATION_ROLLBACK_UNSAFE" }, "Employees block legacy unscoped mode");
current.nonOwnerMembers = 0;
await change("siteStaffIsolationEnabled", false);
assert.equal(current.settingsJson.siteStaffIsolationEnabled, false);
assert.equal(audit.length, 4, "Exactly one audit per accepted transition");
assert.equal(audit[0].riskLevel, "CRITICAL");
assert.equal(audit[0].metadata.reason, "Owner decision after readiness review");
assert.equal(audit[0].organizationId, "tenant-A");
assert.equal((await getRetailFeatureActivation("tenant-A")).historyPagination.total, 4);

assert.match(route, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS"/, "Module entitlement is mandatory");
assert.match(route, /role: \{ in: \[\.\.\.RETAIL_OWNER_ROLES\] \}/, "Only active owners may toggle");
assert.match(route, /hasRecentStepUp\(auth\.session\)/, "Step-up required server-side");
assert.match(route, /writeAuditLog\(/, "Missing step-up is audited");
assert.match(route, /z\.enum\(RETAIL_ACTIVATION_FEATURES\)/, "Unexpected features are refused");
assert.match(route, /\.strict\(\)/, "Unexpected payload fields are refused");
assert.match(service, /FOR UPDATE/, "Concurrent toggles lock configuration row");
assert.match(service, /revision: \{ increment: 1 \}/, "Optimistic revision enforced");
assert.match(service, /await tx\.auditLog\.create/, "Audit and mutation share the transaction");
assert.match(page, /<RetailFeatureActivationPanel organizationId=\{organizationId\} locale=\{locale\}/);
assert.match(panel, /\/api\/auth\/step-up/, "UI confirms identity before mutation");
assert.match(panel, /translateRetailWorkspace/, "Localized FR\/EN labels");
assert.match(panel, /retailActivationInvalidPassword/, "Step-up failures must be translated instead of displaying raw server text");
assert.match(panel, /retailActivationInvalidCode/, "MFA errors must be translated separately from password errors");
assert.match(panel, /lg:grid-cols-2/, "Responsive two-card layout");
for (const language of ["fr", "en"]) {
  const dictionary = JSON.parse(fs.readFileSync(`locales/retail-workspace.${language}.json`, "utf8"));
  assert.ok(dictionary.retailActivationTitle && dictionary.retailActivationStepupRequired && dictionary.retailActivationInvoiceRollbackBlocked);
}

console.log("QA #1044: tenant scope, prerequisites, MFA guard, concurrency, rollback, audit, i18n, UI PASS");
