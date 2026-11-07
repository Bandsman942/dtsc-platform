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
  assignments: [{ siteId: "shopA", roleCode: "INVOICER", isActive: true, permissionsJson: null }],
};
const prisma = {
  organizationMember: { findFirst: async () => db.membership },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: db.settings }) },
  enterpriseRetailSiteAssignment: { findUnique: async () => db.assignment, findMany: async () => db.assignments },
};
const code = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const unit = { exports: {} };
vm.runInNewContext(code, {
  module: unit, exports: unit.exports,
  require: (id) => id === "@/lib/prisma" ? { prisma } : id === "@/lib/enterprise/retail/errors" ? { EnterpriseRetailError } : require(id),
  Set, Promise,
});
const { siteStaffCapabilities, retailStaffIsolationIsEnabled, requireRetailSiteCapability, retailInvoiceVisibleSites, retailStockTransferVisibleSites } = unit.exports;
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
await assert.rejects(requireRetailSiteCapability("tenant", "staff", "shopA", "COLLECT_PAYMENT", prisma, { requireAssignment: true }), { code: "RETAIL_SITE_ACCESS_DENIED" }, "Forced guard on the new checkout must not depend on legacy feature flag");
await assert.rejects(retailInvoiceVisibleSites("tenant", "staff"), { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
db.settings = { siteStaffIsolationEnabled: true, invoiceCheckoutEnabled: true };
assert.deepEqual(JSON.parse(JSON.stringify(await retailInvoiceVisibleSites("tenant", "staff"))), {
  isOwner: false, siteIds: ["shopA"], cancellableSiteIds: [], submittableSiteIds: ["shopA"], collectibleSiteIds: [],
});
db.assignments = [{ siteId: "shopA", roleCode: "CASHIER", isActive: true, permissionsJson: ["COLLECT_PAYMENT"] }];
await assert.rejects(retailInvoiceVisibleSites("tenant", "staff"), { code: "RETAIL_SITE_ACCESS_DENIED" }, "A role without VIEW_SALES cannot see invoices");
db.assignments = [{ siteId: "shopA", roleCode: "CASHIER", isActive: true, permissionsJson: ["VIEW_SALES", "COLLECT_PAYMENT"] }];
assert.deepEqual(JSON.parse(JSON.stringify(await retailInvoiceVisibleSites("tenant", "staff"))), {
  isOwner: false, siteIds: ["shopA"], cancellableSiteIds: [], submittableSiteIds: [], collectibleSiteIds: ["shopA"],
});
db.membership = { role: "OWNER" };
assert.deepEqual(JSON.parse(JSON.stringify(await retailInvoiceVisibleSites("tenant", "owner"))), {
  isOwner: true, siteIds: [], cancellableSiteIds: [], submittableSiteIds: [], collectibleSiteIds: [],
});

// Stock transfers do not depend on invoice checkout. Every company-wide
// transfer read must apply the same Retail site scope to rows and counters.
db.membership = { role: "MEMBER" };
db.settings = { siteStaffIsolationEnabled: true };
db.assignments = [
  { siteId: "shopA", roleCode: "INVOICER", isActive: true, permissionsJson: null },
  { siteId: "shopB", roleCode: "CASHIER", isActive: true, permissionsJson: null },
  { siteId: "shopC", roleCode: "MANAGER", isActive: true, permissionsJson: ["VIEW_STOCK"] },
];
assert.deepEqual(JSON.parse(JSON.stringify(await retailStockTransferVisibleSites("tenant", "staff"))), {
  isolationEnabled: true, isOwner: false, siteIds: ["shopA", "shopC"],
}, "Cashiers without VIEW_STOCK must not see other shops");
db.assignments = [{ siteId: "shopB", roleCode: "CASHIER", isActive: true, permissionsJson: null }];
await assert.rejects(retailStockTransferVisibleSites("tenant", "staff"), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });
db.settings = {};
assert.deepEqual(JSON.parse(JSON.stringify(await retailStockTransferVisibleSites("tenant", "staff"))), {
  isolationEnabled: false, isOwner: false, siteIds: [],
}, "The legacy tenant remains unchanged while isolation is OFF");
db.settings = { siteStaffIsolationEnabled: true };
db.membership = { role: "OWNER" };
assert.deepEqual(JSON.parse(JSON.stringify(await retailStockTransferVisibleSites("tenant", "owner"))), {
  isolationEnabled: false, isOwner: true, siteIds: [],
}, "Owner retains the consolidated cross-shop view");
db.membership = null;
await assert.rejects(retailStockTransferVisibleSites("tenant", "removed"), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });

const transferList = fs.readFileSync("app/api/enterprise/[organizationId]/stock-transfers/route.ts", "utf8");
assert.match(transferList, /retailStockTransferVisibleSites\(organizationId, session\.userId\)/);
assert.match(transferList, /AND: \[\s*baseWhere,/);
assert.match(transferList, /count\(\{ where: \{ AND: \[baseWhere, \{ status: "PENDING_APPROVAL" \}\] \} \}\)/);
assert.match(transferList, /count\(\{ where: \{ AND: \[baseWhere, \{ status: "COMPLETED" \}\] \} \}\)/);
const transferLots = fs.readFileSync("app/api/enterprise/[organizationId]/stock-transfers/lots/route.ts", "utf8");
assert.match(transferLots, /requireRetailSiteCapability\(organizationId, session\.userId, warehouse\.siteId, "VIEW_STOCK"\)/);
const inventoryService = fs.readFileSync("lib/enterprise/inventory/service.ts", "utf8");
assert.match(inventoryService, /requireTransferSiteAuthority\(tx, organizationId, actorUserId, source\.siteId\)/);
assert.match(inventoryService, /requireTransferSiteAuthority\(tx, organizationId, actorUserId, transfer\.sourceWarehouse\.siteId\)/);
assert.match(inventoryService, /requireTransferSiteAuthority\(tx, organizationId, actorUserId, transfer\.destinationWarehouse\.siteId\)/);
const expiryAlerts = fs.readFileSync("app/api/enterprise/[organizationId]/retail/inventory-alerts/route.ts", "utf8");
assert.match(expiryAlerts, /requireRetailSiteCapability\(organizationId, auth\.session\.userId, warehouse\?\.siteId, "VIEW_STOCK"\)/);

const api = fs.readFileSync("app/api/enterprise/[organizationId]/retail/site-assignments/route.ts", "utf8");
assert.match(api, /role: \{ in: \[\.\.\.RETAIL_OWNER_ROLES\] \}/);
assert.match(api, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS"/);
assert.match(api, /existing\.revision !== input\.revision/);
assert.match(api, /writeAuditLog\(/);
assert.match(fs.readFileSync("prisma/enterprise-retail-site-access.prisma", "utf8"), /@relation\(fields: \[organizationId, siteId\]/);
assert.match(fs.readFileSync("prisma/enterprise-retail-site-access.prisma", "utf8"), /@relation\(fields: \[organizationId, userId\]/);
assert.match(fs.readFileSync("app/enterprise-modules/retail-page.tsx", "utf8"), /RetailSiteStaffAccess/);
assert.match(fs.readFileSync("lib/enterprise/retail/service.ts", "utf8"), /requireRetailSiteCapability\(organizationId, actorUserId, warehouse\.siteId, "COLLECT_PAYMENT", tx\)/);
console.log("HOTFIX #1042 boutique staff: tenant-scoped assignments, owner-only CRUD, RBAC defaults/overrides, site-scoped stock transfers and expiry alert contracts passed; strict activation deferred.");

