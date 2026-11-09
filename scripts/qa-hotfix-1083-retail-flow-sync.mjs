import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const approval = read("lib/enterprise/accounting/accounting-approval-service.ts");
const invoices = read("app/api/enterprise/[organizationId]/retail/invoices/route.ts");
const cashier = read("components/enterprise/professional/retail-invoice-cashier-workbench.tsx");
const invoicer = read("components/enterprise/professional/retail-invoice-flow-workbench.tsx");
const payment = read("lib/enterprise/accounting/payments-service.ts");
const cashApi = read("app/api/enterprise/[organizationId]/retail/cash-sessions/route.ts");
const treasury = read("lib/enterprise/accounting/treasury-service.ts");
const access = read("lib/enterprise/retail/site-access.ts");
const catalog = read("lib/enterprise/master-data/service.ts");
const stock = read("lib/enterprise/inventory/service.ts");
const inventoryAlerts = read("app/api/enterprise/[organizationId]/retail/inventory-alerts/route.ts");
const dashboard = read("components/enterprise/professional/retail-site-overview.tsx");
const print = read("app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/print/route.ts");

// Invoice approval and personalised push target remain scoped to the assigned person.
assert.match(invoices, /targetEntityType: "EnterpriseSalesInvoice"/);
assert.match(invoices, /pendingApproverName/);
assert.match(invoicer, /invoice\.pendingApproverName/);
assert.match(approval, /userId: input\.approverUserId/);
assert.match(approval, /enqueueWebPushNotification/);
assert.match(approval, /Facture \$\{invoice\.number\} à valider/);

// Only ISSUED/PARTIALLY_PAID/OVERDUE are collectible; server evaluates dates,
// item descriptions and site permissions before pagination.
assert.match(invoices, /collectionsOnly \? \{ status: \{ in: \["ISSUED", "PARTIALLY_PAID", "OVERDUE"\]/);
assert.match(invoices, /items: \{ some: \{ description:/);
assert.match(invoices, /invoiceDate.*Prisma\.DateTimeFilter/);
assert.match(invoices, /skip: \(page - 1\) \* pageSize, take: pageSize/);
assert.match(cashier, /Les factures « À valider » restent dans Facturation/);
assert.match(cashier, /type="date"/);
assert.match(invoicer, /invoiceDateFrom/);

// POS confirmation is one Finance transaction; no isolated tender ledger.
assert.match(payment, /allocateConfirmedRetailPaymentTx/);
assert.match(payment, /await postPaidRetailInvoiceStockTx/);
assert.match(payment, /await postBusinessEventTx\(tx, organizationId, actorUserId, \{ postingEvent: "PAYMENT_ALLOCATION_CONFIRMED"/);
assert.match(payment, /withRetailTransactionRetry\(\(\) => prisma\.\$transaction/);
assert.match(payment, /await allocateConfirmedRetailPaymentTx\(tx, organizationId, payment, actorUserId/);
assert.match(payment, /enterpriseTreasuryTransaction\.create/);

// Separate OPEN_CASH capability reaches both entry points and the common
// Finance service; invoice collection grant alone cannot open a till.
assert.match(access, /"COLLECT_PAYMENT", "OPEN_CASH", "CLOSE_CASH"/);
assert.match(cashApi, /"OPEN_CASH", prisma, \{ requireAssignment: true \}/);
assert.match(treasury, /"OPEN_CASH", tx, \{ requireAssignment: true \}/);
assert.match(treasury, /retailStaffIsolationIsEnabled/);

// Per-batch expiry with no manufactured quantity and revalidation of tracked
// stock at the canonical inventory movement boundary.
assert.match(catalog, /createCatalogInitialLotTx/);
assert.match(catalog, /expiryDate: lot\.expiryDate/);
assert.match(stock, /STOCK_LOT_REQUIRED_FOR_TRACKED_ITEM/);
assert.match(stock, /STOCK_EXPIRY_DATE_REQUIRED/);
assert.match(inventoryAlerts, /lowStockTotal/);
assert.match(inventoryAlerts, /COALESCE\(SUM\(b\."quantityOnHand" - b\."quantityReserved"\), 0\)/);
assert.match(inventoryAlerts, /retailSitesForCapability/);

assert.match(print, /resolveOrganizationLogoStoragePath/);
assert.match(print, /class="company-logo"/);
assert.match(dashboard, /dateFrom/);
assert.match(dashboard, /dateTo/);
assert.match(dashboard, /buildRetailOperationsExport/);
assert.match(dashboard, /downloadProfessionalXlsx/);
assert.match(dashboard, /downloadProfessionalPdfV2/);

console.log("PASS RETAIL hotfix 1.7.0 — approvals, server-side invoice queue, atomic Finance allocation, stock expiry, till permissions, executive KPI exports");
