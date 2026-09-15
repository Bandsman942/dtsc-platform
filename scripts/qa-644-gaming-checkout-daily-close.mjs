import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const includesAll = (content, markers, label) => {
  for (const marker of markers) check(content.includes(marker), `${label}: missing ${marker}`);
};

const registry = readJson("lib/enterprise/module-registry-gaming.json");
const domain = read("lib/enterprise/gaming/domain.ts");
const access = read("lib/enterprise/gaming/access.ts");
const schemas = read("lib/enterprise/gaming/checkout-schemas.ts");
const facade = read("lib/enterprise/gaming/checkout.ts");
const common = read("lib/enterprise/gaming/checkout-common.ts");
const checkoutService = read("lib/enterprise/gaming/checkout-service.ts");
const commands = read("lib/enterprise/gaming/checkout-commands.ts");
const dailyClose = read("lib/enterprise/gaming/daily-close.ts");
const sessionCheckout = read("lib/enterprise/gaming/session-checkout-state.ts");
const refundService = read("lib/enterprise/accounting/customer-refund-service.ts");
const refundPosting = read("lib/enterprise/accounting/refund-posting-builder.ts");
const postingRegistry = read("lib/enterprise/accounting/posting-registry-final.ts");
const reversalService = read("lib/enterprise/accounting/reversal-service.ts");
const checkoutRoute = read("app/api/enterprise/[organizationId]/gaming/checkouts/route.ts");
const checkoutCommandRoute = read("app/api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/route.ts");
const receiptRoute = read("app/api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/receipt/route.ts");
const closeRoute = read("app/api/enterprise/[organizationId]/gaming/daily-closes/route.ts");
const closeDecisionRoute = read("app/api/enterprise/[organizationId]/gaming/daily-closes/[closeId]/route.ts");
const sessionRoute = read("app/api/enterprise/[organizationId]/gaming/sessions/[sessionId]/route.ts");
const checkoutPage = read("app/enterprise-modules/GAMING_CHECKOUT/page.tsx");
const closePage = read("app/enterprise-modules/GAMING_DAILY_CLOSE/page.tsx");
const checkoutWorkspace = read("components/enterprise/gaming/enterprise-gaming-checkout-workspace.tsx");
const closeWorkspace = read("components/enterprise/gaming/enterprise-gaming-daily-close-workspace.tsx");
const checkoutCopy = read("components/enterprise/gaming/gaming-checkout-i18n.ts");
const closeCopy = read("components/enterprise/gaming/gaming-daily-close-i18n.ts");
const prismaSchema = read("prisma/enterprise-gaming.prisma");
const migration = read("prisma/migrations/20260915011000_gaming_checkout_daily_close/migration.sql");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regression = read("scripts/qa-regression-checks.mjs");

const checkoutModule = registry.modules.find((item) => item.code === "GAMING_CHECKOUT");
const closeModule = registry.modules.find((item) => item.code === "GAMING_DAILY_CLOSE");
check(registry.version >= 6, "gaming registry version must include #644");
for (const [module, code, routePath, workspaceKey, prefix] of [
  [checkoutModule, "GAMING_CHECKOUT", "/enterprise-modules/GAMING_CHECKOUT", "ENTERPRISE_GAMING_CHECKOUT", "enterprise.gaming.checkout."],
  [closeModule, "GAMING_DAILY_CLOSE", "/enterprise-modules/GAMING_DAILY_CLOSE", "ENTERPRISE_GAMING_DAILY_CLOSE", "enterprise.gaming.close."],
]) {
  check(module?.implementationStatus === "BETA", `${code} must be BETA`);
  check(module?.routeKind === "DEDICATED_CORE", `${code} must use DEDICATED_CORE`);
  check(module?.routePath === routePath, `${code} route path missing`);
  check(module?.workspaceKey === workspaceKey, `${code} workspace key missing`);
  check(module?.accessPolicy === "POSITION_PERMISSION", `${code} must use POSITION_PERMISSION`);
  check(module?.permissionPrefixes?.includes(prefix), `${code} permission prefix missing`);
  check(module?.minimumPlan === "BUSINESS", `${code} minimum plan must remain BUSINESS`);
}
for (const dependency of ["GAMING_SESSIONS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS", "FINANCE_TREASURY", "CATALOG"]) {
  check(checkoutModule?.dependencies?.includes(dependency), `checkout dependency missing ${dependency}`);
}
for (const dependency of ["GAMING_CHECKOUT", "FINANCE_TREASURY", "FINANCE_CASH"]) {
  check(closeModule?.dependencies?.includes(dependency), `daily close dependency missing ${dependency}`);
}
for (const code of ["GAMING_DASHBOARD", "GAMING_TOURNAMENTS", "GAMING_REPORTS"]) {
  const item = registry.modules.find((candidate) => candidate.code === code);
  check(item?.implementationStatus === "PLANNED", `${code} must remain PLANNED after #644`);
  check(item?.routeKind === "HIDDEN", `${code} must remain HIDDEN after #644`);
  check(item?.accessPolicy === "EXPLICIT_DENY", `${code} must remain fail-closed after #644`);
}

includesAll(domain, [
  "GAMING_CHECKOUT_PERMISSIONS",
  '"enterprise.gaming.checkout.read"',
  '"enterprise.gaming.checkout.create"',
  '"enterprise.gaming.checkout.update"',
  '"enterprise.gaming.checkout.manage"',
  "GAMING_CLOSE_PERMISSIONS",
  '"enterprise.gaming.close.read"',
  '"enterprise.gaming.close.create"',
  '"enterprise.gaming.close.update"',
  '"enterprise.gaming.close.manage"',
  '"TO_CHECKOUT"',
  '"PAID"',
  '"REFUND_PENDING"',
  '"REFUNDED"',
], "checkout domain contract");
includesAll(access, [
  "getEnterpriseGamingCheckoutAccess",
  'moduleCode: "GAMING_CHECKOUT"',
  "getEnterpriseGamingDailyCloseAccess",
  'moduleCode: "GAMING_DAILY_CLOSE"',
], "checkout access contract");
includesAll(schemas, [
  "gamingCheckoutPrepareSchema",
  "gamingCheckoutCommandSchema",
  'action: z.literal("ADD_PAYMENT")',
  "const revision = z.coerce.number().int().positive();",
  'action: z.literal("REQUEST_REFUND")',
  'action: z.literal("APPROVE_REFUND")',
  "gamingDailyCloseCreateSchema",
  "declaredAmount: signedMoney",
  "varianceReason",
  "gamingDailyCloseDecisionSchema",
  'z.enum(["VALIDATE", "REJECT"])',
], "checkout schemas");

includesAll(prismaSchema, [
  "model EnterpriseGamingCheckout",
  "salesInvoiceId",
  "model EnterpriseGamingDailyClose",
  "timezone",
  "endedSessionCount",
  "paidSessionCount",
  "pendingCheckoutCount",
  "refundedCheckoutCount",
  "model EnterpriseGamingDailyCloseLine",
  "financialAccountId",
  "currencyCode",
  "inboundAmount",
  "refundAmount",
  "expectedAmount",
  "declaredAmount",
  "differenceAmount",
], "checkout persistence");
includesAll(migration, [
  'CREATE TABLE "EnterpriseGamingCheckout"',
  'CREATE TABLE "EnterpriseGamingDailyClose"',
  'CREATE TABLE "EnterpriseGamingDailyCloseLine"',
  'GamingCheckout_org_session_key',
  'GamingCheckout_org_invoice_key',
  'GamingCheckout_org_idempotency_key',
  'EnterpriseGamingCheckout_organizationId_id_key',
  'EnterpriseGamingDailyClose_organizationId_id_key',
  'GamingDailyClose_org_date_global_active_key',
  'GamingDailyClose_org_date_site_active_key',
  'EnterpriseGamingDailyCloseLine_organizationId_id_key',
  'GamingDailyCloseLine_scope_key',
  'EnterpriseGamingCheckout_status_check',
  'EnterpriseGamingDailyClose_status_check',
], "checkout migration");
check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "#644 migration must remain additive");

includesAll(facade, [
  'from "@/lib/enterprise/gaming/checkout-common"',
  'from "@/lib/enterprise/gaming/checkout-service"',
  'from "@/lib/enterprise/gaming/checkout-commands"',
  'from "@/lib/enterprise/gaming/daily-close"',
], "checkout service split");

includesAll(common, [
  "ensureGamingWalkInPartyTx",
  'migrationKey = "SYSTEM:GAMING:WALK_IN_CUSTOMER"',
  'roleCode: "CUSTOMER"',
  "restockGamingCheckoutTx",
  'movementType: "RETURN_IN"',
  'sourceEntityType: "EnterpriseGamingCheckout"',
  "syncGamingCheckoutPaidState",
  'status: "PAID"',
  'action: "CHECKOUT_PAID"',
  "getGamingCheckoutReceipt",
  "paymentAllocations",
  "paidAmount",
  "refundedAmount",
], "checkout canonical common primitives");
check(!common.includes("EnterpriseGamingCustomer"), "checkout must not create a parallel Gaming customer master");
check(!common.includes("EnterpriseGamingPayment"), "checkout must not create a parallel Gaming payment master");

includesAll(checkoutService, [
  "assertAccountingApprovalCandidate",
  "createAccountingApprovalAssignment",
  "pg_advisory_xact_lock",
  "Prisma.TransactionIsolationLevel.Serializable",
  'status: "PENDING_APPROVAL"',
  "enterpriseSalesInvoice.create",
  "enterpriseCatalogItem.findFirst",
  'itemType: "SERVICE"',
  'priceType: "SALE"',
  "price.taxIncluded",
  "enterpriseInventoryItem.findMany",
  "lotTracking",
  "GAMING_CHECKOUT_LOT_SELECTION_REQUIRED",
  "enterpriseWarehouse.findFirst",
  "GAMING_CHECKOUT_WAREHOUSE_SITE_MISMATCH",
  "ensureGamingWalkInPartyTx",
  'movementType: "SALE_FULFILLMENT"',
  'direction: "OUT"',
  'sourceEntityType: "EnterpriseGamingCheckout"',
  'status: "TO_CHECKOUT"',
  "GAMING_CHECKOUT_IDEMPOTENCY_CONFLICT",
], "checkout preparation");
check(!checkoutService.includes("enterprisePayment.create"), "checkout preparation must not create a parallel/direct payment");
check(!checkoutService.includes("EnterpriseGamingCatalog"), "checkout must reuse shared Catalog");
check(!checkoutService.includes("EnterpriseGamingInventory"), "checkout must reuse shared Inventory");

includesAll(commands, [
  "createEnterprisePayment",
  "submitPaymentForAssignedApproval",
  "approvePaymentAssignedApproval",
  "transitionEnterprisePayment",
  "allocateEnterprisePayment",
  'paymentType: "CUSTOMER_PAYMENT"',
  'direction: "INBOUND"',
  "GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING",
  "stableKey",
  "syncGamingCheckoutPaidState",
  "cancelPendingAccountingApprovals",
  "restockGamingCheckoutTx",
  'action: "CHECKOUT_CANCELLED"',
  'paymentType: "REFUND"',
  'direction: "OUTBOUND"',
  "reverseCustomerPaymentAllocationsForRefund",
  "createExactSalesCreditNoteForRefund",
  "approveAndPostSalesCreditNote",
  "confirmCustomerRefundPayment",
  'action: "CHECKOUT_REFUNDED"',
  "GAMING_CHECKOUT_REFUND_SELF_APPROVAL_FORBIDDEN",
], "checkout payment/refund commands");
check(!commands.includes("enterpriseTreasuryTransaction.create"), "Gaming command layer must not create treasury rows directly");
check(!commands.includes("enterpriseCashMovement.create"), "Gaming command layer must not create cash rows directly");

includesAll(refundService, [
  "reverseCustomerPaymentAllocationsForRefund",
  "reverseJournalEntryTx",
  'authorization: "DOMAIN_INVERSE"',
  "createExactSalesCreditNoteForRefund",
  "REFUND_HISTORICAL_TOTAL_MISMATCH",
  "confirmCustomerRefundPayment",
  'transactionType: "CUSTOMER_REFUND"',
  'movementType: "CUSTOMER_REFUND"',
  'postingEvent: "CUSTOMER_REFUND_CONFIRMED"',
], "canonical refund inverse path");
includesAll(reversalService, [
  'JournalReversalAuthorization = "USER" | "APPROVED_PERIODIC_TEMPLATE" | "SYSTEM_CLOSING" | "DOMAIN_INVERSE"',
], "domain inverse reversal authorization");
includesAll(refundPosting, [
  "buildCustomerRefundPosting",
  'paymentType: "REFUND"',
  'direction: "OUTBOUND"',
  'accountMappingKey: "CUSTOMER_ADVANCES"',
], "customer refund posting builder");
includesAll(postingRegistry, [
  "buildCustomerRefundPosting",
  "CUSTOMER_REFUND_CONFIRMED: buildCustomerRefundPosting",
], "refund posting registry");

includesAll(sessionCheckout, [
  "promoteEndedGamingSessionToCheckout",
  'session.status !== "ENDED"',
  'status: "TO_CHECKOUT"',
  'action: "READY_TO_CHECKOUT"',
  "Prisma.TransactionIsolationLevel.Serializable",
], "END to checkout state promotion");
includesAll(sessionRoute, [
  "promoteEndedGamingSessionToCheckout",
  'parsed.data.action === "END"',
  'status: "TO_CHECKOUT"',
  "readyToCheckout",
], "session checkout route integration");

includesAll(dailyClose, [
  "safeTimezone",
  "businessWindow",
  "zonedDateToUtc",
  "pg_advisory_xact_lock",
  'status: { in: ["SUBMITTED", "VALIDATED"] }',
  "endedAt: { gte: start, lt: end }",
  "paymentDate: { gte: start, lt: end }",
  "candidateCheckoutRefs",
  "financialCheckouts",
  "financialCheckoutRefs",
  'payment.paymentType === "CUSTOMER_PAYMENT"',
  'payment.paymentType === "REFUND"',
  "inboundAmount.minus(refundAmount)",
  "currencyCode: account.currencyCode",
  "GAMING_CLOSE_VARIANCE_REASON_REQUIRED",
  "GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN",
], "daily close reconciliation");
check(!dailyClose.includes("exchangeRate"), "daily close must not silently convert currencies");
check(!dailyClose.includes("functionalCurrency"), "daily close must not aggregate through functional currency");

includesAll(checkoutRoute, [
  "getEnterpriseGamingCheckoutAccess",
  "getEnterpriseGamingSessionAccess",
  'moduleCode: "CATALOG"',
  'moduleCode: "INVENTORY_LOGISTICS"',
  'moduleCode: "FINANCE_RECEIVABLES"',
  "gamingCheckoutPrepareSchema",
  "prepareGamingCheckout",
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
  "writeApiLog",
], "checkout collection API");
includesAll(checkoutCommandRoute, [
  "gamingCheckoutCommandSchema",
  "getEnterpriseGamingCheckoutAccess",
  'moduleCode: "FINANCE_RECEIVABLES"',
  'moduleCode: "FINANCE_PAYMENTS"',
  'moduleCode: "INVENTORY_LOGISTICS"',
  "commandGamingCheckout",
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
  "writeApiLog",
], "checkout command API");
includesAll(receiptRoute, [
  "getGamingCheckoutReceipt",
  'moduleCode: "FINANCE_RECEIVABLES"',
  'moduleCode: "FINANCE_PAYMENTS"',
  "writeApiLog",
], "checkout receipt API");
includesAll(closeRoute, [
  "getEnterpriseGamingDailyCloseAccess",
  'moduleCode: "FINANCE_PAYMENTS"',
  'moduleCode: "FINANCE_TREASURY"',
  'moduleCode: "FINANCE_CASH"',
  "gamingDailyCloseCreateSchema",
  "createGamingDailyClose",
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
], "daily close API");
includesAll(closeDecisionRoute, [
  "getEnterpriseGamingDailyCloseAccess",
  "gamingDailyCloseDecisionSchema",
  "decideGamingDailyClose",
  'action: "manage"',
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
], "daily close decision API");

includesAll(checkoutPage, [
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "GAMING_CHECKOUT"',
  "EnterpriseGamingCheckoutWorkspace",
  "capabilities.canRead",
  "AppShell",
], "checkout page");
includesAll(closePage, [
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "GAMING_DAILY_CLOSE"',
  "EnterpriseGamingDailyCloseWorkspace",
  "capabilities.canRead",
  "AppShell",
], "daily close page");
includesAll(checkoutWorkspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleMetrics",
  "ModuleToolbar",
  "BusinessList",
  "FullscreenEntityDetail",
  "ProfessionalTabs",
  "useProfessionalCollection",
  "/gaming/checkouts",
  "/approval-candidates?moduleCode=FINANCE_RECEIVABLES",
  "/approval-candidates?moduleCode=FINANCE_PAYMENTS",
  "/financial-accounts",
  "itemType=PRODUCT",
  "/warehouses",
  'action: "ADD_PAYMENT"',
  'action: "REQUEST_REFUND"',
  'reasonSubmit(event, modal === "cancel" ? "CANCEL" : "APPROVE_REFUND")',
  'className="h-[92dvh]',
], "checkout workspace UX");
includesAll(closeWorkspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleMetrics",
  "ModuleToolbar",
  "BusinessList",
  "FullscreenEntityDetail",
  "ProfessionalTabs",
  "useProfessionalCollection",
  "/gaming/daily-closes",
  "/financial-accounts",
  "/sites",
  "differenceAmount",
  "refundAmount",
  'className="h-[92dvh]',
], "daily close workspace UX");
check(!/MAX_STATIONS\s*=\s*5/i.test(checkoutWorkspace + closeWorkspace), "#644 UI must not introduce a five-station limit");
includesAll(checkoutCopy, ["Encaissement Gaming", "Gaming checkout", "Paiements", "Payments", "Reçu Gaming réconcilié", "Reconciled Gaming receipt"], "checkout FR EN copy");
includesAll(closeCopy, ["Clôture Gaming", "Gaming daily close", "Écart", "Difference", "Remboursements", "Refunds"], "daily close FR EN copy");
includesAll(docs, ["#644", "GAMING_CHECKOUT", "GAMING_DAILY_CLOSE", "EnterpriseSalesInvoice", "EnterprisePayment", "EnterpriseFinancialAccount", "Inventory", "remboursement", "devise"], "Gaming #644 documentation");
check(regression.includes('await import("./qa-644-gaming-checkout-daily-close.mjs");'), "qa:regression must execute #644 Gaming checkout QA");

if (errors.length) {
  console.error("Gaming Checkout / Daily Close #644 QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Gaming Checkout / Daily Close #644 QA passed.");
