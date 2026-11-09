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
const { siteStaffCapabilities, retailStaffIsolationIsEnabled, requireRetailSiteCapability, retailInvoiceVisibleSites, retailStockTransferVisibleSites, retailSitesForCapability, retailFinanceReadSiteScope } = unit.exports;
assert.equal(retailStaffIsolationIsEnabled(null), false, "Existing tenants must not be silently isolated");
assert.equal(retailStaffIsolationIsEnabled({ siteStaffIsolationEnabled: true }), true);
assert.deepEqual([...siteStaffCapabilities("INVOICER", null)].sort(), ["VIEW_STOCK", "VIEW_SALES", "PREPARE_INVOICE"].sort());
assert.equal(siteStaffCapabilities("CASHIER", null).includes("PREPARE_INVOICE"), false);
assert.equal(siteStaffCapabilities("MANAGER", null).includes("AUTHORIZE_TRANSFER"), false, "Transfer approval is owner-only unless explicitly granted");
assert.equal(siteStaffCapabilities("MANAGER", null).includes("MANAGE_STOCK"), false, "Stock mutations require an explicit, configurable grant");
assert.deepEqual([...siteStaffCapabilities("MANAGER", ["VIEW_STOCK"])], ["VIEW_STOCK"], "Overrides must not inherit other permissions");
assert.deepEqual([...siteStaffCapabilities("MANAGER", ["MANAGE_STOCK"])], ["MANAGE_STOCK"], "Explicit stock permission must be configurable");
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
await assert.rejects(check("COLLECT_PAYMENT", null), { code: "RETAIL_SITE_REQUIRED" }, "A staff member with an assignment cannot bypass store scope while the cutover flag is off");
await assert.rejects(requireRetailSiteCapability("tenant", "staff", "shopA", "COLLECT_PAYMENT", prisma, { requireAssignment: true }), { code: "RETAIL_SITE_ACCESS_DENIED" }, "Forced guard on the new checkout must not depend on legacy feature flag");
await assert.rejects(retailInvoiceVisibleSites("tenant", "staff"), { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
db.settings = { siteStaffIsolationEnabled: true, invoiceCheckoutEnabled: true };
assert.deepEqual(JSON.parse(JSON.stringify(await retailInvoiceVisibleSites("tenant", "staff"))), {
  isOwner: false, siteIds: ["shopA"], cancellableSiteIds: [], submittableSiteIds: ["shopA"], collectibleSiteIds: [],
});
db.assignments = [{ siteId: "shopA", roleCode: "CASHIER", isActive: true, permissionsJson: ["COLLECT_PAYMENT"] }];
assert.deepEqual(JSON.parse(JSON.stringify(await retailInvoiceVisibleSites("tenant", "staff"))), {
  isOwner: false, siteIds: [], cancellableSiteIds: [], submittableSiteIds: [], collectibleSiteIds: ["shopA"],
}, "A collection-only cashier sees the payment queue, but not the general invoice register");
db.assignments = [{ siteId: "shopA", roleCode: "CASHIER", isActive: true, permissionsJson: ["VIEW_SALES", "COLLECT_PAYMENT"] }];
assert.deepEqual(JSON.parse(JSON.stringify(await retailInvoiceVisibleSites("tenant", "staff"))), {
  isOwner: false, siteIds: [], cancellableSiteIds: [], submittableSiteIds: [], collectibleSiteIds: ["shopA"],
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
assert.deepEqual(JSON.parse(JSON.stringify(await retailSitesForCapability("tenant", "staff", "VIEW_SALES"))), {
  isolationEnabled: true, isOwner: false, siteIds: ["shopA", "shopB"],
}, "Historical POS sales and returns must have a VIEW_SALES store scope");
assert.deepEqual(JSON.parse(JSON.stringify(await retailSitesForCapability("tenant", "staff", "COLLECT_PAYMENT"))), {
  isolationEnabled: true, isOwner: false, siteIds: ["shopB"],
}, "Refund accounts and decisions must have an independent COLLECT_PAYMENT scope");
await assert.rejects(retailSitesForCapability("tenant", "staff", "MANAGE_STOCK"), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });
assert.deepEqual(JSON.parse(JSON.stringify(await retailStockTransferVisibleSites("tenant", "staff"))), {
  isolationEnabled: true, isOwner: false, siteIds: ["shopA", "shopC"], manageableSiteIds: [],
}, "Cashiers without VIEW_STOCK must not see other shops");
db.assignments = [
  { siteId: "shopA", roleCode: "MANAGER", isActive: true, permissionsJson: ["VIEW_STOCK", "MANAGE_STOCK"] },
  { siteId: "shopB", roleCode: "MANAGER", isActive: true, permissionsJson: ["VIEW_STOCK"] },
];
assert.deepEqual(JSON.parse(JSON.stringify(await retailStockTransferVisibleSites("tenant", "staff"))), {
  isolationEnabled: true, isOwner: false, siteIds: ["shopA", "shopB"], manageableSiteIds: ["shopA"],
}, "Write access must be independently scoped from stock visibility");
db.assignments = [{ siteId: "shopB", roleCode: "CASHIER", isActive: true, permissionsJson: null }];
await assert.rejects(retailStockTransferVisibleSites("tenant", "staff"), { code: "RETAIL_SITE_ACCESS_DENIED", status: 403 });
db.settings = {};
await assert.rejects(retailStockTransferVisibleSites("tenant", "staff"), { code: "RETAIL_SITE_ACCESS_DENIED" }, "Existing assignments protect inventory even before tenant-wide activation");
db.assignments = [];
assert.deepEqual(JSON.parse(JSON.stringify(await retailStockTransferVisibleSites("tenant", "staff"))), {
  isolationEnabled: false, isOwner: false, siteIds: [], manageableSiteIds: [],
}, "A genuinely unassigned legacy tenant keeps the previous behavior while isolation is off");
db.settings = { siteStaffIsolationEnabled: true };
db.membership = { role: "OWNER" };
assert.deepEqual(JSON.parse(JSON.stringify(await retailStockTransferVisibleSites("tenant", "owner"))), {
  isolationEnabled: false, isOwner: true, siteIds: [], manageableSiteIds: [],
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
assert.match(inventoryService, /requireRetailSiteCapability\(organizationId, actorUserId, warehouse\.siteId, "MANAGE_STOCK", tx\)/);
assert.match(inventoryService, /requireInventoryStockAuthorityTx\(tx, organizationId, actorUserId, input\.warehouseId\)/);
assert.match(inventoryService, /requireInventoryStockAuthorityTx\(tx, organizationId, actorUserId, count\.warehouseId\)/);
const adjustmentsService = fs.readFileSync("lib/enterprise/inventory/adjustment-service.ts", "utf8");
assert.match(adjustmentsService, /requireInventoryStockAuthorityTx\(tx, organizationId, actorUserId, input\.warehouseId\)/);
assert.match(adjustmentsService, /requireInventoryStockAuthorityTx\(tx, organizationId, actorUserId, adjustment\.warehouseId\)/);
const staffInterface = fs.readFileSync("components/enterprise/professional/retail-site-staff-access.tsx", "utf8");
assert.match(staffInterface, /MANAGE_STOCK: "Gérer les mouvements/);
assert.match(staffInterface, /MANAGE_STOCK: "Manage stock movements/);
const expiryAlerts = fs.readFileSync("app/api/enterprise/[organizationId]/retail/inventory-alerts/route.ts", "utf8");
assert.match(expiryAlerts, /retailSitesForCapability\(organizationId, auth\.session\.userId, "VIEW_STOCK"\)/);
assert.match(expiryAlerts, /requireRetailSiteCapability\(organizationId, auth\.session\.userId, warehouse\?\.siteId, "VIEW_STOCK", prisma, \{ requireAssignment: true \}\)/);
assert.match(expiryAlerts, /warehouse: \{ siteId: \{ in: scope\.siteIds \} \}/);
const inventoryList = fs.readFileSync("app/api/enterprise/[organizationId]/inventory/route.ts", "utf8");
assert.match(inventoryList, /retailInventoryVisibleSites\(organizationId, session\.userId\)/);
assert.match(inventoryList, /balances: \{ some: balancesScope \}/);
assert.match(inventoryList, /warehouse: \{ siteId: \{ in: scope\.siteIds \} \}/);
const movementsList = fs.readFileSync("app/api/enterprise/[organizationId]/stock-movements/route.ts", "utf8");
assert.match(movementsList, /retailInventoryVisibleSites\(organizationId, session\.userId\)/);
assert.match(movementsList, /warehouse: \{ siteId: \{ in: scope\.siteIds \} \}/);
const countsList = fs.readFileSync("app/api/enterprise/[organizationId]/inventory-counts/route.ts", "utf8");
assert.match(countsList, /warehouseId: \{ in: scopedWarehouseIds \}/);
assert.match(countsList, /AND: \[baseWhere,/);
const adjustmentsList = fs.readFileSync("app/api/enterprise/[organizationId]/stock-adjustments/route.ts", "utf8");
assert.match(adjustmentsList, /warehouseId: \{ in: scopedWarehouseIds \}/);
assert.match(adjustmentsList, /status: "PENDING_APPROVAL", \.\.\.siteScope/);
const valuation = fs.readFileSync("app/api/enterprise/[organizationId]/inventory-valuation/route.ts", "utf8");
assert.match(valuation, /if \(scope\.isolationEnabled\)/);

const api = fs.readFileSync("app/api/enterprise/[organizationId]/retail/site-assignments/route.ts", "utf8");
assert.match(api, /role: \{ in: \[\.\.\.RETAIL_OWNER_ROLES\] \}/);
assert.match(api, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS"/);
assert.match(api, /existing\.revision !== input\.revision/);
assert.match(api, /writeAuditLog\(/);
assert.match(fs.readFileSync("prisma/enterprise-retail-site-access.prisma", "utf8"), /@relation\(fields: \[organizationId, siteId\]/);
assert.match(fs.readFileSync("prisma/enterprise-retail-site-access.prisma", "utf8"), /@relation\(fields: \[organizationId, userId\]/);
assert.match(fs.readFileSync("app/enterprise-modules/retail-page.tsx", "utf8"), /RetailSiteStaffAccess/);
assert.match(fs.readFileSync("lib/enterprise/retail/service.ts", "utf8"), /requireRetailSiteCapability\(organizationId, actorUserId, warehouse\.siteId, "COLLECT_PAYMENT", tx\)/);
// The legacy reservations and availability endpoints must never return
// unfiltered multi-store records or totals after staff isolation is enabled.
const retailAvailability = fs.readFileSync("app/api/enterprise/[organizationId]/retail/inventory/availability/route.ts", "utf8");
assert.match(retailAvailability, /retailInventoryVisibleSites\(organizationId, auth\.session\.userId\)/);
assert.match(retailAvailability, /availability\.stores\.filter\(\(store\) => scope\.siteIds\.includes\(store\.siteId\)\)/);
assert.match(retailAvailability, /stores\.reduce\(\(sum, store\) => sum\.plus\(store\.quantityAvailable\)/);
const retailReservations = fs.readFileSync("app/api/enterprise/[organizationId]/retail/inventory/reservations/route.ts", "utf8");
assert.match(retailReservations, /retailInventoryVisibleSites\(organizationId, auth\.session\.userId\)/);
assert.match(retailReservations, /warehouseId: \{ in: allowedWarehouseIds \}/);
const reservationService = fs.readFileSync("lib/enterprise/inventory/reservations.ts", "utf8");
assert.match(reservationService, /requireInventoryStockAuthorityTx\(tx, organizationId, actorUserId, input\.warehouseId\)/);
assert.match(reservationService, /requireInventoryStockAuthorityTx\(tx, organizationId, actorUserId, reservation\.warehouseId\)/);
assert.ok(reservationService.indexOf("requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, input.warehouseId)") < reservationService.indexOf("idempotencyKey: input.idempotencyKey"), "Authorization must precede reservation idempotency lookup");
assert.match(reservationService, /INVENTORY_RESERVATION_IDEMPOTENCY_COLLISION/);

// Finance read permission must never become a cross-store Retail data bypass.
// A revoked last assignment returns [] (deny checkout documents), not null
// (Finance-wide scope). Finance-only operators outside RETAIL isolation keep
// their normal Finance RBAC.
db.membership = { role: "MEMBER" };
db.settings = { siteStaffIsolationEnabled: true, invoiceCheckoutEnabled: true };
db.assignments = [
  { siteId: "shopA", roleCode: "MANAGER", isActive: true, permissionsJson: ["VIEW_SALES", "COLLECT_PAYMENT"] },
  { siteId: "shopB", roleCode: "MANAGER", isActive: false, permissionsJson: ["VIEW_SALES", "COLLECT_PAYMENT"] },
];
assert.deepEqual(JSON.parse(JSON.stringify(await retailFinanceReadSiteScope("tenant", "staff", "VIEW_SALES"))), ["shopA"]);
assert.deepEqual(JSON.parse(JSON.stringify(await retailFinanceReadSiteScope("tenant", "staff", "COLLECT_PAYMENT"))), ["shopA"]);
db.assignments[0].isActive = false;
assert.deepEqual(JSON.parse(JSON.stringify(await retailFinanceReadSiteScope("tenant", "revoked", "VIEW_SALES"))), []);
db.assignments = [];
assert.deepEqual(JSON.parse(JSON.stringify(await retailFinanceReadSiteScope("tenant", "finance-only", "VIEW_SALES"))), [], "Unassigned Finance users cannot bypass active RETAIL isolation");
db.membership = { role: "OWNER" };
assert.equal(await retailFinanceReadSiteScope("tenant", "owner", "VIEW_SALES"), null);
db.membership = { role: "MEMBER" };
db.settings = {};
db.assignments = [{ siteId: "shopA", roleCode: "CASHIER", isActive: false, permissionsJson: null }];
assert.deepEqual(JSON.parse(JSON.stringify(await retailFinanceReadSiteScope("tenant", "legacy", "COLLECT_PAYMENT"))), [], "Revocation must not reopen Finance access after a legacy cutover flag is disabled");
const financeInvoicesRoute = fs.readFileSync("app/api/enterprise/[organizationId]/sales-invoices/route.ts", "utf8");
assert.match(financeInvoicesRoute, /retailFinanceReadSiteScope\(organizationId, auth\.session\.userId, "VIEW_SALES"\)/);
assert.match(financeInvoicesRoute, /retailCheckout: \{ is: \{ siteId: \{ in: retailScope \} \} \}/);
assert.match(financeInvoicesRoute, /canCreateCredit: capabilities\.canCreate && !retailCheckout/);
const financePaymentsRoute = fs.readFileSync("app/api/enterprise/[organizationId]/payments/route.ts", "utf8");
assert.match(financePaymentsRoute, /retailFinanceReadSiteScope\(organizationId, auth\.session\.userId, "COLLECT_PAYMENT"\)/);
assert.match(financePaymentsRoute, /financialAccountId: \{ in: accountIds \|\| \[\] \}/);
assert.match(financePaymentsRoute, /retailInvoiceProposals: \{ some: \{ checkout: \{ siteId: \{ in: retailScope \} \} \} \}/);
assert.equal((financePaymentsRoute.match(/AND: \[sitePaymentScope\]/g) || []).length, 4, "Both list and all 3 Finance metrics must be scoped");
const financeReceivablesRoute = fs.readFileSync("app/api/enterprise/[organizationId]/receivables/route.ts", "utf8");
assert.match(financeReceivablesRoute, /retailFinanceReadSiteScope\(organizationId, auth\.session\.userId, "VIEW_SALES"\)/);
assert.match(financeReceivablesRoute, /salesInvoice: \{ retailCheckout: \{ is: \{ siteId: \{ in: retailScope \} \} \} \}/);
assert.equal((financeReceivablesRoute.match(/AND: \[siteReceivableScope\]/g) || []).length, 3, "Finance receivables list and 2 ageing totals must obey the same store scope");
console.log("HOTFIX #1042 boutique staff: tenant-scoped assignments, owner-only CRUD, RBAC defaults/overrides, site-scoped stock transfers and expiry alert contracts passed; strict activation deferred.");
