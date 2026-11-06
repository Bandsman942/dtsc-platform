import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const policySource = fs.readFileSync("lib/enterprise/retail/site-access.ts", "utf8");
class EnterpriseRetailError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
const db = {
  membership: { role: "MEMBER" },
  settings: { siteStaffIsolationEnabled: true },
  assignment: { roleCode: "INVOICER", isActive: true, permissionsJson: null },
};
const prisma = {
  organizationMember: { findFirst: async () => db.membership },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: db.settings }) },
  enterpriseRetailSiteAssignment: { findUnique: async () => db.assignment },
};
const code = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const unit = { exports: {} };
vm.runInNewContext(code, {
  module: unit, exports: unit.exports,
  require: (id) => id === "@/lib/prisma" ? { prisma } : id === "@/lib/enterprise/retail/errors" ? { EnterpriseRetailError } : require(id),
  Set, Promise,
});
const { siteStaffCapabilities, retailStaffIsolationIsEnabled, requireRetailSiteCapability } = unit.exports;
assert.equal(retailStaffIsolationIsEnabled(null), false, "Existing tenants must not be silently isolated");
assert.equal(retailStaffIsolationIsEnabled({ siteStaffIsolationEnabled: true }), true);
assert.deepEqual([...siteStaffCapabilities("INVOICER", null)].sort(), ["VIEW_STOCK", "VIEW_SALES", "PREPARE_INVOICE"].sort());
assert.equal(siteStaffCapabilities("CASHIER", null).includes("PREPARE_INVOICE"), false);
assert.equal(siteStaffCapabilities("MANAGER", null).includes("AUTHORIZE_TRANSFER"), false, "Transfer approval is owner-only unless explicitly granted");
assert.deepEqual([...siteStaffCapabilities("MANAGER", ["VIEW_STOCK"])], ["VIEW_STOCK"], "Overrides must not inherit other permissions");
assert.deepEqual([...siteStaffCapabilities("MANAGER", { privilege: "*" })], [], "Malformed stored permissions must fail closed");
const check = (capability, siteId = "shopA") => requireRetailSiteCapability("tenant", "staff", siteId, capability);
await assert.doesNotReject(check("PREPARE_INVOICE"));
await assert.rejects(check("COLLECT_PAYMENT"), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });
db.assignment = { roleCode: "CASHIER", isActive: true, permissionsJson: null };
await assert.doesNotReject(check("COLLECT_PAYMENT"));
await assert.rejects(check("COLLECT_PAYMENT", null), { code: "RETAIL_SITE_REQUIRED" });
db.assignment = null;
await assert.rejects(check("COLLECT_PAYMENT"), { code: "RETAIL_SITE_ACCESS_DENIED" });
db.assignment = { roleCode: "MANAGER", isActive: false, permissionsJson: ["COLLECT_PAYMENT"] };
await assert.rejects(check("COLLECT_PAYMENT"), { code: "RETAIL_SITE_ACCESS_DENIED" });
db.membership = { role: "OWNER" };
await assert.doesNotReject(check("COLLECT_PAYMENT", null));
db.membership = null;
await assert.rejects(check("COLLECT_PAYMENT"), { code: "RETAIL_SITE_ACCESS_DENIED" });
db.membership = { role: "MEMBER" }; db.settings = {};
await assert.doesNotReject(check("COLLECT_PAYMENT", null), "Legacy organization workflows remain unchanged until guarded cutover");

const api = fs.readFileSync("app/api/enterprise/[organizationId]/retail/site-assignments/route.ts", "utf8");
assert.match(api, /role: \{ in: \[\.\.\.RETAIL_OWNER_ROLES\] \}/);
assert.match(api, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS"/);
assert.match(api, /existing\.revision !== input\.revision/);
assert.match(api, /writeAuditLog\(/);
assert.match(fs.readFileSync("prisma/enterprise-retail-site-access.prisma", "utf8"), /@relation\(fields: \[organizationId, siteId\]/);
assert.match(fs.readFileSync("prisma/enterprise-retail-site-access.prisma", "utf8"), /@relation\(fields: \[organizationId, userId\]/);
assert.match(fs.readFileSync("app/enterprise-modules/retail-page.tsx", "utf8"), /RetailSiteStaffAccess/);
assert.match(fs.readFileSync("lib/enterprise/retail/service.ts", "utf8"), /requireRetailSiteCapability\(organizationId, actorUserId, warehouse\.siteId, "COLLECT_PAYMENT", tx\)/);
console.log("HOTFIX #1042 boutique staff: tenant-scoped assignments, owner-only CRUD, RBAC defaults/overrides and fail-closed policy contracts passed; strict activation deferred.");
