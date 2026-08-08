import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const schema = read("prisma/enterprise-retail-customer-payments.prisma");
for (const model of [
  "EnterpriseRetailCustomerProfile",
  "EnterpriseRetailLoyaltyProgram",
  "EnterpriseRetailLoyaltyAccount",
  "EnterpriseRetailLoyaltyEntry",
  "EnterpriseRetailStoredValueAccount",
  "EnterpriseRetailStoredValueEntry",
  "EnterpriseRetailProviderIntegration",
  "EnterpriseRetailProviderOperation",
  "EnterpriseRetailPaymentTransaction",
  "EnterpriseRetailWebhookEvent",
  "EnterpriseRetailDeviceProfile",
]) check(schema.includes(`model ${model}`), `Missing Shop 2 iteration 3 model ${model}`);
check(exists("prisma/migrations/20260808190000_shop2_customer_loyalty_payments/migration.sql"), "Iteration 3 additive migration is missing");
check(schema.includes("businessPartyId"), "Retail customer profile must reference the canonical business party");
check(!schema.includes("model EnterpriseRetailCustomerMaster"), "Retail must not create a duplicate customer master");
check(schema.includes("lookupHash"), "Stored value must persist a lookup hash");
check(!schema.includes("bearerCode"), "Stored value bearer codes must never be stored in plaintext");
for (const marker of ["@@unique([organizationId, idempotencyKey])", "@@unique([organizationId, providerId, externalEventId])"]) check(schema.includes(marker), `Tenant-scoped idempotency contract missing ${marker}`);

const service = read("lib/enterprise/retail/customer-payments.ts");
for (const marker of [
  "TransactionIsolationLevel.Serializable",
  "FOR UPDATE",
  "hashStoredValueCode",
  "generateStoredValueCode",
  "RETAIL_STORED_VALUE_INSUFFICIENT",
  "RETAIL_LOYALTY_BALANCE_INSUFFICIENT",
  "RETAIL_PAYMENT_TRANSITIONS",
  "RETAIL_PROVIDER_OPERATION_TRANSITIONS",
  "processRetailWebhookEvent",
  "externalEventId",
  "signatureVerified",
]) check(service.includes(marker), `Transactional customer/payment service missing ${marker}`);
check(!service.includes("credentialValue"), "Provider credentials must not be stored as raw values");
check(!service.includes("webhookSecretValue"), "Webhook secrets must not be stored as raw values");

const adapter = read("lib/enterprise/retail/payment-provider-adapter.ts");
for (const marker of ["RetailPaymentProviderAdapter", "verifyWebhook", "registerRetailPaymentProviderAdapter", 'code: "MANUAL"']) check(adapter.includes(marker), `Provider-neutral adapter contract missing ${marker}`);
check(!adapter.includes("MOCK_PROVIDER"), "Production provider registry must not ship a fake provider");

const webhook = read("app/api/enterprise/[organizationId]/retail/webhooks/[providerId]/route.ts");
for (const marker of ["req.text()", "adapter.verifyWebhook", "createHash(\"sha256\")", "processRetailWebhookEvent"]) check(webhook.includes(marker), `Webhook route missing ${marker}`);
check(!webhook.includes("await req.json()"), "Webhook verification must use the raw request body");

const activeCustomer = read("app/api/enterprise/[organizationId]/retail/active-customer/route.ts");
const customerBar = read("components/enterprise/professional/retail-active-customer-bar.tsx");
const retailPage = read("app/enterprise-modules/retail-page.tsx");
const salesRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
for (const marker of ["HttpOnly", "sameSite", "getRetailActiveCustomerIdFromCookieHeader"]) check((activeCustomer + salesRoute).toLowerCase().includes(marker.toLowerCase()), `Active customer context missing ${marker}`);
check(customerBar.includes("/business-parties"), "Quick create must use the canonical CRM business-party API");
check(customerBar.includes("/retail/customers?search="), "POS customer search must use server-side paginated search");
check(retailPage.includes("RetailActiveCustomerBar"), "POS page must visibly render the active customer context");
check(salesRoute.includes("customerContextSource"), "Sale audit must record the customer context source");

const loyaltyHooks = read("lib/enterprise/retail/loyalty-sale-hooks.ts");
for (const marker of ["autoEarn === true", "loyalty:auto-earn:", "loyalty:return-reversal:", "REVERSAL", "FOR UPDATE"]) check(loyaltyHooks.includes(marker), `Loyalty sale lifecycle missing ${marker}`);

const constants = read("lib/enterprise/retail/constants.ts");
for (const marker of [
  "INITIATED", "AUTHORIZED", "CAPTURED", "FAILED", "VOIDED", "REFUNDED",
  "PENDING_PROVIDER", "UNKNOWN", "RECONCILED",
  "enterprise.retail.loyalty.redeem", "enterprise.retail.stored_value.redeem", "enterprise.retail.providers.reconcile", "enterprise.retail.devices.manage",
]) check(constants.includes(marker), `Iteration 3 state/RBAC contract missing ${marker}`);
const sellerBlock = constants.slice(constants.indexOf("SELLER:"), constants.indexOf("CASHIER:"));
const cashierBlock = constants.slice(constants.indexOf("CASHIER:"), constants.indexOf("MOBILE_MONEY_AGENT:"));
check(!sellerBlock.includes("enterprise.retail.customer.create"), "SELLER must not see quick customer creation without canonical CRM write authority");
check(!cashierBlock.includes("enterprise.retail.customer.create"), "CASHIER must not see quick customer creation without canonical CRM write authority");

const readiness = JSON.parse(read("lib/enterprise/sector-onboarding-readiness.json"));
const retail = readiness.profiles.find((profile) => profile.sectorCode === "COMMERCE_RETAIL");
check(retail?.shop2ProgramStatus === "ITERATION_3_IN_PROGRESS", "Shop 2 readiness must identify iteration 3 while this branch is under development");
check(retail?.commercializationStatus === "COMMERCIAL_READY", "Iteration 3 must not prematurely promote Shop to COMMERCIAL_READY_GLOBAL");

for (const route of [
  "app/api/enterprise/[organizationId]/retail/customers/route.ts",
  "app/api/enterprise/[organizationId]/retail/loyalty/programs/route.ts",
  "app/api/enterprise/[organizationId]/retail/loyalty/earn/route.ts",
  "app/api/enterprise/[organizationId]/retail/loyalty/redeem/route.ts",
  "app/api/enterprise/[organizationId]/retail/stored-value/route.ts",
  "app/api/enterprise/[organizationId]/retail/stored-value/redeem/route.ts",
  "app/api/enterprise/[organizationId]/retail/stored-value/refund/route.ts",
  "app/api/enterprise/[organizationId]/retail/payments/route.ts",
  "app/api/enterprise/[organizationId]/retail/provider-integrations/route.ts",
  "app/api/enterprise/[organizationId]/retail/provider-operations/route.ts",
  "app/api/enterprise/[organizationId]/retail/devices/route.ts",
  "app/api/enterprise/[organizationId]/retail/webhooks/[providerId]/route.ts",
]) check(exists(route), `Missing iteration 3 route ${route}`);

if (failures.length) {
  console.error("Shop 2 iteration 3 customer/payments QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 iteration 3 customer/payments QA passed.");
