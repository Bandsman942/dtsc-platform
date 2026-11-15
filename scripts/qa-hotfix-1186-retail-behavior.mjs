import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { z } = require("zod");
const build = (path, deps) => {
  const source = fs.readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Promise, Date, Map, Set,
    require: (name) => name in deps ? deps[name] : require(name) }, { filename: path });
  return mod.exports;
};
class RetailError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
const state = {
  memberRole: "MEMBER", active: true, memberActive: true,
  roleCode: "MANAGER", config: { siteStaffIsolationEnabled: true, invoiceCheckoutEnabled: true },
  permissions: ["VIEW_SALES", "PREPARE_INVOICE", "COLLECT_PAYMENT", "REQUEST_INVOICE_RETURN", "APPROVE_INVOICE_RETURN"],
};
const reader = {
  organizationMember: { findFirst: async ({ where }) => where.organizationId === "tenant" &&
    where.userId === "alice" && state.memberActive ? { role: state.memberRole } : null },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: state.config }) },
  enterpriseRetailSiteAssignment: {
    findUnique: async ({ where }) => {
      const key = where.organizationId_siteId_userId;
      if (key.organizationId !== "tenant" || key.siteId !== "boutique-A" || key.userId !== "alice") return null;
      return { isActive: state.active, roleCode: state.roleCode, permissionsJson: state.permissions };
    },
  },
};
const access = build("lib/enterprise/retail/site-access.ts", {
  "zod": { z }, "@/lib/prisma": { prisma: reader }, "@/lib/enterprise/retail/errors": { EnterpriseRetailError: RetailError },
});
const allowed = (capability, siteId = "boutique-A", userId = "alice") =>
  access.retailSelfApprovalAllowed("tenant", userId, siteId, capability, reader);
assert.equal(await allowed("SELF_APPROVE_INVOICE"), false, "Owner delegation is opt-in");
assert.equal(await allowed("SELF_APPROVE_PAYMENT"), false, "Payment delegation is independent");
assert.equal(await allowed("SELF_APPROVE_INVOICE_RETURN"), false, "Manager return delegation is off");
state.permissions.push("SELF_APPROVE_INVOICE");
assert.equal(await allowed("SELF_APPROVE_INVOICE"), true, "Invoice delegation in assigned store");
assert.equal(await allowed("SELF_APPROVE_PAYMENT"), false, "Invoice delegation does not grant payment");
state.permissions.push("SELF_APPROVE_PAYMENT", "SELF_APPROVE_INVOICE_RETURN");
assert.equal(await allowed("SELF_APPROVE_PAYMENT"), true);
assert.equal(await allowed("SELF_APPROVE_INVOICE_RETURN"), true);
assert.equal(await allowed("SELF_APPROVE_INVOICE", "boutique-B"), false, "Cross-store denied");
assert.equal(await allowed("SELF_APPROVE_PAYMENT", "boutique-A", "bob"), false, "Other staff denied");
state.active = false;
assert.equal(await allowed("SELF_APPROVE_INVOICE"), false, "Revocation denies old assignments");
state.active = true;
state.config = { siteStaffIsolationEnabled: false, invoiceCheckoutEnabled: true };
assert.equal(await allowed("SELF_APPROVE_INVOICE"), false, "Isolation feature gate required");
state.config = { siteStaffIsolationEnabled: true, invoiceCheckoutEnabled: false };
assert.equal(await allowed("SELF_APPROVE_PAYMENT"), false, "Finance checkout feature gate required");
state.config = { siteStaffIsolationEnabled: true, invoiceCheckoutEnabled: true };
state.roleCode = "INVOICER";
assert.equal(await allowed("SELF_APPROVE_INVOICE_RETURN"), false, "Returns exception manager-only");
state.roleCode = "MANAGER";
state.permissions = state.permissions.filter((x) => x !== "PREPARE_INVOICE");
assert.equal(await allowed("SELF_APPROVE_INVOICE"), false, "Invoice preparer prerequisite");
state.permissions = state.permissions.filter((x) => x !== "COLLECT_PAYMENT");
assert.equal(await allowed("SELF_APPROVE_PAYMENT"), false, "Cashier prerequisite");
state.permissions = state.permissions.filter((x) => x !== "APPROVE_INVOICE_RETURN");
assert.equal(await allowed("SELF_APPROVE_INVOICE_RETURN"), false, "Manager return decision prerequisite");
state.permissions = ["INVALID_CAPABILITY", "SELF_APPROVE_INVOICE"];
assert.equal(await allowed("SELF_APPROVE_INVOICE"), false, "Malformed stored policy fails closed");
state.memberRole = "OWNER";
assert.equal(await allowed("SELF_APPROVE_INVOICE"), false, "Owner is not a self-assigned store operator");
state.memberRole = "MEMBER"; state.memberActive = false;
assert.equal(await allowed("SELF_APPROVE_INVOICE"), false, "Inactive member denied");

const bilingual = build("lib/enterprise/audit-event-i18n.ts", {});
assert.equal(bilingual.auditActionLabel("ENTERPRISE_RETAIL_INVOICE_APPROVE", "fr"), "Facture approuvée");
assert.equal(bilingual.auditActionLabel("ENTERPRISE_RETAIL_INVOICE_APPROVE", "en"), "Invoice approved");
assert.equal(bilingual.auditActionLabel("RETAIL_SITE_ASSIGNMENT_UPDATED", "fr"), "Autorisations d’une boutique modifiées");
assert.equal(bilingual.auditEntityLabel("EnterprisePayment", "fr"), "Encaissement / paiement");
assert.equal(bilingual.auditValueLabel("HIGH", "fr"), "Élevé");
assert.equal(bilingual.auditValueLabel("FAILED", "en"), "Failed");
assert.equal(bilingual.auditSearchCode("facture", "fr"), "INVOICE");
assert.equal(bilingual.auditSearchCode("invoice", "en"), "invoice");
console.log("HOTFIX #1186 behavioral QA PASS: 19 store-permission cases and 8 FR/EN audit cases, in isolated deterministic fixtures.");
