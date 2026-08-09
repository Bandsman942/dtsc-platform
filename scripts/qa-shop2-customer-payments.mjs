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
check(exists("prisma/migrations/20260808203000_shop2_async_operator_payload/migration.sql"), "Async operator payload migration is missing");
check(schema.includes("businessPartyId"), "Retail customer profile must reference the canonical business party");
check(!schema.includes("model EnterpriseRetailCustomerMaster"), "Retail must not create a duplicate customer master");
check(schema.includes("lookupHash"), "Stored value must persist a lookup hash");
check(!schema.includes("bearerCode"), "Stored value bearer codes must never be stored in plaintext");
check(schema.includes("requestPayloadJson"), "Async provider operations must preserve a safe server-side request payload until confirmation");
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
for (const marker of ["RetailPaymentProviderAdapter", "verifyWebhook", "reconcile?", "registerRetailPaymentProviderAdapter", 'code: "MANUAL"']) check(adapter.includes(marker), `Provider-neutral adapter contract missing ${marker}`);
check(!adapter.includes("MOCK_PROVIDER"), "Production provider registry must not ship a fake provider");

const orchestration = read("lib/enterprise/retail/operator-orchestration.ts");
for (const marker of [
  "PENDING_MOBILE_MONEY",
  "PENDING_TELCO_TOPUP",
  "createConnectedMobileMoneyOperation",
  "createConnectedTelcoTopupOperation",
  "finalizeConfirmedRetailOperatorOperation",
  "reconcileRetailProviderOperations",
  "PROVIDER_TIMEOUT",
  "requestPayloadJson",
  "adapter.initiate",
  "adapter.reconcile",
]) check(orchestration.includes(marker), `Async operator orchestration missing ${marker}`);
check(orchestration.includes('operation.status !== "CONFIRMED"'), "Business effects must remain blocked before provider confirmation");
check(orchestration.includes('status: "SUCCESS"'), "Telco success must only be materialized by the confirmed-operation finalizer");

const webhook = read("app/api/enterprise/[organizationId]/retail/webhooks/[providerId]/route.ts");
for (const marker of ["req.text()", "adapter.verifyWebhook", "createHash(\"sha256\")", "processRetailWebhookEvent", "resolveRetailProviderOperationForWebhook", "finalizeConfirmedRetailOperatorOperation"]) check(webhook.includes(marker), `Webhook route missing ${marker}`);
check(!webhook.includes("await req.json()"), "Webhook verification must use the raw request body");

const mobileMoneyRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/route.ts");
for (const marker of ["createConnectedMobileMoneyOperation", 'mode: "CONNECTED"', 'mode: "MANUAL"']) check(mobileMoneyRoute.includes(marker), `Mobile Money connected/manual split missing ${marker}`);
const telcoRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/route.ts");
for (const marker of ["createConnectedTelcoTopupOperation", 'mode: "CONNECTED"', 'mode: "MANUAL"']) check(telcoRoute.includes(marker), `Telco connected/manual split missing ${marker}`);
const providerDecisionRoute = read("app/api/enterprise/[organizationId]/retail/provider-operations/[operationId]/route.ts");
check(providerDecisionRoute.includes("finalizeConfirmedRetailOperatorOperation"), "Authorized provider confirmation must materialize its business effect exactly once");
check(exists("app/api/enterprise/[organizationId]/retail/provider-operations/reconcile/route.ts"), "Provider reconciliation endpoint is missing");
const reconciliationRoute = read("app/api/enterprise/[organizationId]/retail/provider-operations/reconcile/route.ts");
for (const marker of ["canReconcileProviders", "reconcileRetailProviderOperations", "ENTERPRISE_RETAIL_PROVIDER_RECONCILIATION_RUN"]) check(reconciliationRoute.includes(marker), `Provider reconciliation route missing ${marker}`);

const activeCustomer = read("app/api/enterprise/[organizationId]/retail/active-customer/route.ts");
const customerBar = read("components/enterprise/professional/retail-active-customer-bar.tsx");
const retailPage = read("app/enterprise-modules/retail-page.tsx");
const salesRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
for (const marker of ["HttpOnly", "sameSite", "getRetailActiveCustomerIdFromCookieHeader"]) check((activeCustomer + salesRoute).toLowerCase().includes(marker.toLowerCase()), `Active customer context missing ${marker}`);
check(customerBar.includes("/business-parties"), "Quick create must use the canonical CRM business-party API");
check(customerBar.includes("/retail/customers?search="), "POS customer search must use server-side paginated search");
check(retailPage.includes("RetailActiveCustomerBar"), "POS page must visibly render the active customer context");
check(salesRoute.includes("customerContextSource"), "Sale audit must record the customer context source");

const customerHistoryPath = "app/api/enterprise/[organizationId]/retail/customers/[businessPartyId]/route.ts";
check(exists(customerHistoryPath), "Retail customer purchase/return history route is missing");
const customerHistory = exists(customerHistoryPath) ? read(customerHistoryPath) : "";
for (const marker of ["EnterpriseBusinessParty", "enterpriseRetailSale", "enterpriseRetailReturn", "enterpriseRetailLoyaltyAccount", "enterpriseRetailStoredValueAccount"]) check(customerHistory.includes(marker) || customerHistory.toLowerCase().includes(marker.toLowerCase()), `Customer history route missing ${marker}`);

const receiptPath = "app/api/enterprise/[organizationId]/retail/sales/[saleId]/receipt/route.ts";
check(exists(receiptPath), "Consent-aware digital receipt route is missing");
const receipt = exists(receiptPath) ? read(receiptPath) : "";
for (const marker of ["RETAIL_RECEIPT_CONTACT", 'format !== "html"', "window.print()", "providerSecretsDisclosed: false", "enterpriseRetailLoyaltyEntry", "enterpriseRetailStoredValueEntry", "promotionRedemptions"]) check(receipt.includes(marker), `Retail receipt contract missing ${marker}`);
check(!receipt.includes("credentialReference"), "Receipt must never expose provider credential references");
check(!receipt.includes("webhookSecretReference"), "Receipt must never expose webhook secret references");

const deviceCapabilitiesPath = "lib/enterprise/retail/device-capabilities.ts";
const deviceReadinessPath = "components/enterprise/professional/retail-device-readiness.tsx";
check(exists(deviceCapabilitiesPath), "POS device capability layer is missing");
check(exists(deviceReadinessPath), "POS device readiness UI is missing");
const deviceCapabilities = exists(deviceCapabilitiesPath) ? read(deviceCapabilitiesPath) : "";
for (const marker of ["WEBUSB", "WEBBLUETOOTH", "WEBSERIAL", "MANUAL_FALLBACK", "BROWSER_API_UNAVAILABLE"]) check(deviceCapabilities.toUpperCase().includes(marker), `Device capability layer missing ${marker}`);
check(retailPage.includes("RetailDeviceReadiness"), "POS page must surface device readiness without blocking checkout");

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

const nativeGuide = read("lib/user-guides/retail-telco-mobile-money-guides.ts");
for (const marker of ["Client CRM canonique au POS", "Fidélité transactionnelle", "Cartes-cadeaux et avoirs", "Mode MANUAL ou CONNECTED", "UNKNOWN n’est jamais assimilé à un succès", "Consent-aware JSON/printable receipt"]) check(nativeGuide.includes(marker), `Native Retail user guide missing iteration 3 marker: ${marker}`);
for (const doc of ["docs/SHOP_2_0_ITERATION_3_ARCHITECTURE.md", "docs/SHOP_2_0_CUSTOMER_PAYMENTS_USER_GUIDE_FR.md", "docs/SHOP_2_0_CUSTOMER_PAYMENTS_USER_GUIDE_EN.md"]) check(exists(doc), `Iteration 3 documentation missing ${doc}`);

const readiness = JSON.parse(read("lib/enterprise/sector-onboarding-readiness.json"));
const retail = readiness.profiles.find((profile) => profile.sectorCode === "COMMERCE_RETAIL");
const iteration3OrLater = new Set(["ITERATION_3_IN_PROGRESS", "ITERATION_4_IN_PROGRESS", "COMPLETE"]);
check(iteration3OrLater.has(retail?.shop2ProgramStatus), "Shop 2 iteration 3 guarantees must remain active in iteration 3 or any later programme state");
check(["COMMERCIAL_READY", "COMMERCIAL_READY_GLOBAL"].includes(retail?.commercializationStatus), "Iteration 3 guarantees must remain compatible with the current or globally certified commercial status");

for (const route of [
  "app/api/enterprise/[organizationId]/retail/customers/route.ts",
  customerHistoryPath,
  "app/api/enterprise/[organizationId]/retail/loyalty/programs/route.ts",
  "app/api/enterprise/[organizationId]/retail/loyalty/earn/route.ts",
  "app/api/enterprise/[organizationId]/retail/loyalty/redeem/route.ts",
  "app/api/enterprise/[organizationId]/retail/stored-value/route.ts",
  "app/api/enterprise/[organizationId]/retail/stored-value/redeem/route.ts",
  "app/api/enterprise/[organizationId]/retail/stored-value/refund/route.ts",
  "app/api/enterprise/[organizationId]/retail/payments/route.ts",
  "app/api/enterprise/[organizationId]/retail/provider-integrations/route.ts",
  "app/api/enterprise/[organizationId]/retail/provider-operations/route.ts",
  "app/api/enterprise/[organizationId]/retail/provider-operations/reconcile/route.ts",
  "app/api/enterprise/[organizationId]/retail/devices/route.ts",
  "app/api/enterprise/[organizationId]/retail/webhooks/[providerId]/route.ts",
  receiptPath,
]) check(exists(route), `Missing iteration 3 route ${route}`);

if (failures.length) {
  console.error("Shop 2 iteration 3 customer/payments QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 iteration 3 customer/payments QA passed.");
