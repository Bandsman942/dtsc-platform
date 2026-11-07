import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const decimal = (value) => new Prisma.Decimal(value);
const state = { existing: null, checkout: null, invoiceCreated: false, movements: [], updated: false, settings: {} };
const tx = {
  enterpriseRetailInvoiceCheckout: {
    findFirst: async ({ where }) => where.idempotencyKey ? state.existing : where.salesInvoiceId && where.salesInvoiceId !== "finance-invoice" ? null : state.checkout,
    update: async () => { state.updated = true; },
  },
  organization: {
    findFirst: async () => ({ id: "tenant", timezone: "Africa/Kinshasa" }),
    findUnique: async () => ({ timezone: "Africa/Kinshasa" }),
  },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: state.settings }) },
  enterpriseWarehouse: { findFirst: async () => ({ id: "warehouse" }) },
  enterpriseCatalogItem: { findMany: async () => [{ id: "product", name: "Produit", currency: "CDF", trackInventory: true }] },
  enterpriseInventoryItem: { findMany: async () => [{ id: "inventory", catalogItemId: "product" }] },
  enterpriseInventoryBalance: { findMany: async () => [{ id: "balance", inventoryItemId: "inventory", storageLocationId: null, stockLotId: null, quantityOnHand: decimal(4), quantityReserved: decimal(0) }] },
  enterpriseInventoryReservation: { findMany: async () => [] },
  enterpriseStockLot: { findMany: async () => [] },
  enterpriseFinancialAccount: { findFirst: async () => state.account },
  enterpriseCashSession: { findFirst: async () => state.cashSession },
};
const prisma = {
  enterpriseRetailInvoiceCheckout: { findFirst: async () => state.existing },
  $transaction: async (callback) => callback(tx),
};
const serviceSource = fs.readFileSync("lib/enterprise/retail/invoice-checkout.ts", "utf8");
const compiled = ts.transpileModule(serviceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const unit = { exports: {} };
vm.runInNewContext(compiled, {
  module: unit, exports: unit.exports, Promise, Set, Map, Date,
  require: (id) => {
    if (id === "@/lib/prisma") return { prisma };
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@/lib/enterprise/retail/constants") return { RETAIL_SECTOR_CODE: "COMMERCE_RETAIL" };
    if (id === "@/lib/enterprise/retail/commercial-engine") return { resolveRetailCommercialPricingDecisions: async () => [{ catalogItemId: "product", lineTotal: decimal(10) }] };
    if (id === "@/lib/enterprise/retail/inventory-policy") return { assertRetailLotPolicyTx: async () => {} };
    if (id === "@/lib/enterprise/retail/site-access") return { requireRetailSiteCapability: async () => {} };
    if (id === "@/lib/enterprise/inventory/service") return { applyStockMovementTx: async (_tx, _org, _actor, movement) => { state.movements.push(movement); } };
    if (id === "@/lib/enterprise/accounting/receivables-service") return { createSalesInvoiceTx: async () => { state.invoiceCreated = true; return {}; } };
    return require(id);
  },
});

const { prepareRetailInvoice, retailInvoicePrepareSchema, postPaidRetailInvoiceStockTx, assertRetailInvoicePaymentScopeTx } = unit.exports;
const input = {
  idempotencyKey: "client-retry-001", siteId: "site", warehouseId: "warehouse", currencyCode: "CDF",
  lines: [{ catalogItemId: "product", quantity: 2 }],
};
assert.equal(retailInvoicePrepareSchema.safeParse(input).success, true);
assert.equal(retailInvoicePrepareSchema.safeParse({ ...input, lines: [{ catalogItemId: "product", quantity: -2 }] }).success, false);
state.existing = { id: "checkout", idempotencyKey: input.idempotencyKey, requestFingerprint: require("node:crypto").createHash("sha256").update(JSON.stringify(input)).digest("hex"), invoice: { id: "finance-invoice" } };
const repeated = await prepareRetailInvoice("tenant", "owner", input);
assert.equal(repeated.idempotent, true, "Retry returns the same canonical invoice");
assert.equal(state.invoiceCreated, false, "Retry cannot issue a second Finance invoice");
await assert.rejects(prepareRetailInvoice("tenant", "owner", { ...input, currencyCode: "USD" }), { code: "RETAIL_INVOICE_IDEMPOTENCY_COLLISION" });
state.existing = null;
await assert.rejects(prepareRetailInvoice("tenant", "owner", input), { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
assert.equal(state.invoiceCreated, false, "Owner-only draft is disabled for existing tenants");

const checkout = {
  id: "checkout", siteId: "shop-A", salesInvoiceId: "finance-invoice", warehouseId: "warehouse", stockPostedAt: null,
  invoice: { id: "finance-invoice", status: "ISSUED", outstandingAmount: decimal(20) },
  lines: [{ id: "line", inventoryItemId: "inventory", stockLotId: null, invoiceItemId: "finance-line", invoiceItem: { quantity: decimal(2) } }],
};
state.checkout = checkout;
await assert.rejects(postPaidRetailInvoiceStockTx(tx, "tenant", "finance-invoice", "cashier"), { code: "RETAIL_INVOICE_NOT_FULLY_PAID" });
assert.equal(state.movements.length, 0, "No stock exit before confirmed full payment allocation");
checkout.invoice = { ...checkout.invoice, status: "PAID", outstandingAmount: decimal(0) };
await postPaidRetailInvoiceStockTx(tx, "tenant", "finance-invoice", "cashier");
assert.equal(state.movements.length, 1, "One stock exit after full settlement");
assert.equal(state.movements[0].movementType, "SALE_FULFILLMENT");
assert.equal(state.movements[0].sourceEntityType, "EnterpriseSalesInvoice");
assert.equal(state.movements[0].sourceEntityId, "finance-invoice");
assert.equal(state.movements[0].quantity, 2);
assert.equal(state.updated, true);
checkout.stockPostedAt = new Date();
await postPaidRetailInvoiceStockTx(tx, "tenant", "finance-invoice", "cashier");
assert.equal(state.movements.length, 1, "Repeated posting must be idempotent");

// Cross-store payments are forbidden at the *Finance allocation service*
// even when a caller skips Retail UI and submits the receivable UUID directly.
state.account = { siteId: "shop-B", currencyCode: "CDF" };
state.cashSession = { id: "cash-A" };
const payment = { financialAccountId: "account-B", cashSessionId: "cash-A", methodType: "CASH", currencyCode: "CDF" };
await assert.rejects(assertRetailInvoicePaymentScopeTx(tx, "tenant", "finance-invoice", "finance-operator", payment), { code: "RETAIL_INVOICE_FINANCIAL_ACCOUNT_SITE_MISMATCH" });
state.account = { siteId: "shop-A", currencyCode: "CDF" };
state.cashSession = null;
await assert.rejects(assertRetailInvoicePaymentScopeTx(tx, "tenant", "finance-invoice", "finance-operator", payment), { code: "RETAIL_INVOICE_CASH_SESSION_SITE_MISMATCH" });
state.cashSession = { id: "cash-A" };
await assert.doesNotReject(assertRetailInvoicePaymentScopeTx(tx, "tenant", "finance-invoice", "finance-operator", payment));
await assert.doesNotReject(assertRetailInvoicePaymentScopeTx(tx, "tenant", "ordinary-invoice", "finance-operator", payment));

const financeService = fs.readFileSync("lib/enterprise/accounting/payments-service.ts", "utf8");
assert.match(financeService, /postPaidRetailInvoiceStockTx\(tx, organizationId, receivable\.salesInvoiceId, actorUserId\)/);
assert.match(financeService, /assertRetailInvoicePaymentScopeTx\(tx, organizationId, receivable\.salesInvoiceId, actorUserId, payment\)/);
assert.match(financeService, /if \(outstanding\.isZero\(\)\) \{/);
assert.match(financeService, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
const route = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/route.ts", "utf8");
assert.match(route, /retailInvoiceVisibleSites/);
assert.match(route, /auth\.visibility\.siteIds\.includes\(siteId\)/);
assert.match(route, /requireRetailSiteCapability\(organizationId, auth\.session\.userId, parsed\.data\.siteId, "PREPARE_INVOICE", prisma, \{ requireAssignment: true \}\)/);
assert.match(route, /checkoutReady \}/);
assert.match(route, /siteId: siteId \|\| \{ in: auth\.visibility\.siteIds \}/);
assert.match(route, /enterpriseSite\.findMany/);
assert.match(route, /authorizeRetailRequest\(req, organizationId, "RETAIL_POS"/);
assert.match(route, /writeAuditLog\(/);
assert.match(route, /canCancel: entry\.invoice\.status === "DRAFT"/);
assert.match(route, /auth\.visibility\.cancellableSiteIds\.includes\(entry\.siteId\)/);
assert.match(route, /canSubmit: entry\.invoice\.status === "DRAFT" && entry\.invoice\.createdByUserId === auth\.session\.userId/);
assert.match(route, /canCollect: \["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID"\]/);
const cancelRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/transition/route.ts", "utf8");
assert.match(cancelRoute, /z\.literal\("CANCEL"\)/, "Retail must not expose direct approval, issuance or refund shortcuts");
assert.match(cancelRoute, /z\.literal\("SUBMIT"\)/);
assert.doesNotMatch(cancelRoute, /z\.literal\("(APPROVE|ISSUE|VOID|REFUND)"\)/);
assert.match(cancelRoute, /parsed\.data\.action === "CANCEL" \? "CANCEL_UNPAID_INVOICE" : "PREPARE_INVOICE"/);
assert.match(cancelRoute, /checkout\.invoice\.status !== "DRAFT"/);
assert.match(cancelRoute, /checkout\.invoice\.revision !== parsed\.data\.revision/);
assert.match(cancelRoute, /transitionSalesInvoice\(organizationId, invoiceId, auth\.session\.userId, parsed\.data\)/);
assert.match(cancelRoute, /submitSalesInvoiceForAssignedApproval\(organizationId, invoiceId, auth\.session\.userId, parsed\.data, \{ retailInvoiceSiteId: checkout\.siteId \}\)/);
assert.match(cancelRoute, /writeAuditLog\(/);
const candidatesRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/invoices/approval-candidates/route.ts", "utf8");
assert.match(candidatesRoute, /retailInvoiceVisibleSites/);
assert.match(candidatesRoute, /listRetailInvoiceFinanceApprovers/);
assert.match(candidatesRoute, /visibility\.siteIds\.includes\(parsed\.data\)/);
const financeApprovals = fs.readFileSync("lib/enterprise/accounting/accounting-approval-service.ts", "utf8");
assert.match(financeApprovals, /assertRetailInvoiceFinanceApproverTx\(tx,/);
assert.match(financeApprovals, /input\.targetEntityType !== "EnterpriseSalesInvoice"/);
const invoiceOrchestration = fs.readFileSync("lib/enterprise/accounting/accounting-invoice-approval-orchestration.ts", "utf8");
assert.match(invoiceOrchestration, /invoice\.createdByUserId !== actorUserId/);
assert.match(invoiceOrchestration, /retailInvoiceSiteId: options\.retailInvoiceSiteId/);

const approvalState = { linkedSite: "shop-A", allowCandidate: true, isAssigned: true, settings: { invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: true } };
const approvalDb = {
  enterpriseRetailInvoiceCheckout: { findFirst: async ({ where }) => where.siteId === approvalState.linkedSite ? { id: "checkout" } : null },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: approvalState.settings }) },
  organizationMember: {
    findFirst: async () => ({ role: "MEMBER" }),
    findMany: async () => [{ userId: "approver", role: "MANAGER", positionTitle: null, user: { name: "Finance approver", email: "finance@example.test" } }],
  },
  enterpriseRetailSiteAssignment: { findUnique: async () => approvalState.isAssigned ? { isActive: true, roleCode: "INVOICER", permissionsJson: null } : null },
};
const approvalSource = fs.readFileSync("lib/enterprise/retail/invoice-approval.ts", "utf8");
const approvalCompiled = ts.transpileModule(approvalSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const approvalModule = { exports: {} };
vm.runInNewContext(approvalCompiled, {
  module: approvalModule, exports: approvalModule.exports, Promise, Set, Map,
  require: (id) => {
    if (id === "@/lib/prisma") return { prisma: approvalDb };
    if (id === "@/lib/enterprise/retail/errors") return { EnterpriseRetailError };
    if (id === "@/lib/enterprise/module-access") return { resolveEnterpriseModuleAccess: async ({ userId, action }) => ({ allowed: approvalState.allowCandidate && userId === "approver" && action === "approve" }) };
    if (id === "@/lib/enterprise/retail/site-access") return {
      RETAIL_OWNER_ROLES: new Set(["OWNER"]), retailStaffIsolationIsEnabled: (settings) => settings?.siteStaffIsolationEnabled === true,
      requireRetailSiteCapability: async () => { if (!approvalState.isAssigned) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403); },
    };
    return require(id);
  },
});
const { assertRetailInvoiceFinanceApproverTx } = approvalModule.exports;
const approvalInput = { organizationId: "tenant", invoiceId: "finance-invoice", siteId: "shop-A", requesterUserId: "invoicer", approverUserId: "approver" };
await assert.doesNotReject(assertRetailInvoiceFinanceApproverTx(approvalDb, approvalInput));
await assert.rejects(assertRetailInvoiceFinanceApproverTx(approvalDb, { ...approvalInput, siteId: "shop-B" }), { code: "RETAIL_INVOICE_NOT_FOUND" });
await assert.rejects(assertRetailInvoiceFinanceApproverTx(approvalDb, { ...approvalInput, approverUserId: "invoicer" }), { code: "RETAIL_INVOICE_SELF_APPROVAL_FORBIDDEN" });
approvalState.allowCandidate = false;
await assert.rejects(assertRetailInvoiceFinanceApproverTx(approvalDb, approvalInput), { code: "RETAIL_INVOICE_APPROVER_NOT_ELIGIBLE" });
approvalState.allowCandidate = true; approvalState.isAssigned = false;
await assert.rejects(assertRetailInvoiceFinanceApproverTx(approvalDb, approvalInput), { code: "RETAIL_SITE_ACCESS_DENIED" });
approvalState.isAssigned = true; approvalState.settings = { invoiceCheckoutEnabled: false, siteStaffIsolationEnabled: true };
await assert.rejects(assertRetailInvoiceFinanceApproverTx(approvalDb, approvalInput), { code: "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE" });
const invoiceUI = fs.readFileSync("components/enterprise/professional/retail-invoice-flow-workbench.tsx", "utf8");
assert.match(invoiceUI, /retail\/invoices/);
assert.match(invoiceUI, /data\?\.checkoutReady/);
assert.match(invoiceUI, /disabled=\{!chosenWarehouse \|\| !lines\.length \|\| submitting\}/);
assert.match(invoiceUI, /"en"/);
assert.match(invoiceUI, /"fr"/);
assert.match(invoiceUI, /data\.checkoutReady && \(entry\.canCancel \|\| entry\.canSubmit \|\| entry\.canCollect\)/);
assert.match(invoiceUI, /RetailInvoicePaymentDialog/);
assert.match(invoiceUI, /<Dialog open=\{Boolean\(cancelTarget\)\}/);
assert.match(invoiceUI, /cancelReason\.trim\(\)\.length < 4/);
assert.match(invoiceUI, /<Dialog open=\{Boolean\(submitTarget\)\}/);
assert.match(invoiceUI, /retail\/invoices\/approval-candidates\?siteId=/);
assert.match(fs.readFileSync("app/enterprise-modules/retail-page.tsx", "utf8"), /RetailInvoiceFlowWorkbench/);
assert.match(fs.readFileSync("app\/api\/enterprise\/[organizationId]\/retail\/products\/search\/route.ts", "utf8"), /requireRetailSiteCapability\(organizationId, auth\.session\.userId, warehouse\.siteId, "VIEW_STOCK"\)/);
assert.match(fs.readFileSync("app\/api\/enterprise\/[organizationId]\/retail\/stock-lots\/route.ts", "utf8"), /requireRetailSiteCapability\(organizationId, auth\.session\.userId, warehouse\.siteId, "VIEW_STOCK"\)/);
assert.doesNotMatch(fs.readFileSync("app\/api\/enterprise\/[organizationId]\/retail\/stock-lots\/route.ts", "utf8"), /balances: \{ where: \{ organizationId, warehouseId, storageLocationId: null \}/, "Lot availability must cover every location in the selected warehouse");
assert.match(fs.readFileSync(".github/workflows/quality-gates.yml", "utf8"), /qa-hotfix-1042-retail-invoice-finance\.mjs/);
const schema = fs.readFileSync("prisma/enterprise-retail-invoice-checkout.prisma", "utf8");
assert.match(schema, /@@unique\(\[organizationId, idempotencyKey\]\)/);
assert.match(schema, /@relation\(fields: \[organizationId, salesInvoiceId\], references: \[organizationId, id\]/);
assert.doesNotMatch(schema, /grandTotal|amountPaid|outstandingAmount|financialAccountId/, "Retail must not create a competing financial ledger");
console.log("HOTFIX #1042 Finance bridge: retry/collision, opt-in guard, no early stock, full-payment posting, store-level invoice read/write/collection scope, Design 2.0 and canonical Finance schema passed.");
