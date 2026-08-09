import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

for (const file of [
  "prisma/enterprise-retail-offline-omnichannel.prisma",
  "prisma/enterprise-inventory-reservations.prisma",
  "prisma/migrations/20260808220000_shop2_offline_omnichannel_foundations/migration.sql",
  "prisma/migrations/20260808233000_shop2_omnichannel_order_context/migration.sql",
  "lib/enterprise/retail/sale-execution.ts",
  "lib/enterprise/retail/offline-server.ts",
  "lib/enterprise/retail/offline-client.ts",
  "lib/enterprise/inventory/reservations.ts",
  "lib/enterprise/crm-sales/orders.ts",
  "lib/enterprise/retail/omnichannel.ts",
  "lib/enterprise/retail/country-packs.ts",
  "lib/enterprise/retail/self-service-onboarding.ts",
  "components/enterprise/professional/retail-offline-continuity.tsx",
  "components/enterprise/professional/retail-omnichannel-panel.tsx",
  "components/enterprise/professional/retail-global-readiness.tsx",
  "app/api/enterprise/[organizationId]/retail/offline/snapshot/route.ts",
  "app/api/enterprise/[organizationId]/retail/offline/sync/route.ts",
  "app/api/enterprise/[organizationId]/retail/inventory/availability/route.ts",
  "app/api/enterprise/[organizationId]/retail/inventory/reservations/route.ts",
  "app/api/enterprise/[organizationId]/retail/omnichannel/orders/route.ts",
  "app/api/enterprise/[organizationId]/retail/country-packs/route.ts",
  "app/api/enterprise/[organizationId]/retail/onboarding/route.ts",
]) check(exists(file), `Missing Shop 2 iteration 4 capability: ${file}`);

const sw = read("public/sw.js");
check(sw.includes('url.pathname.startsWith("/api/")'), "Service worker must explicitly recognize API requests");
check(sw.includes('request.mode === "navigate"'), "Service worker must treat navigation separately");
check(!sw.includes("caches.put(request") || sw.includes("isStaticAsset") || sw.includes("PUBLIC_PATHS"), "Private requests must not be blindly cached");

const retailSchema = read("prisma/enterprise-retail-offline-omnichannel.prisma");
for (const model of ["EnterpriseRetailOfflineSnapshot", "EnterpriseRetailOfflineSyncOperation", "EnterpriseRetailCountryPackActivation", "EnterpriseRetailOnboardingRun", "EnterpriseRetailOrderOrchestration"]) check(retailSchema.includes(`model ${model}`), `Missing iteration 4 Retail model ${model}`);
check(retailSchema.includes("@@unique([organizationId, operationUuid])"), "Offline replay UUID must be tenant-scoped and unique");
check(retailSchema.includes("@@unique([organizationId, idempotencyKey])"), "Omnichannel orchestration must be tenant-scoped and idempotent");
check(!retailSchema.includes("quantityOnHand"), "Offline/omnichannel Retail schema must not create a second stock balance");
check(!retailSchema.includes("model EnterpriseRetailSalesOrder"), "Retail must not create a parallel sales-order master");
const orchestrationBlock = retailSchema.slice(retailSchema.indexOf("model EnterpriseRetailOrderOrchestration"));
for (const forbidden of ["totalAmount", "subtotalAmount", "taxAmount", "currency", "quantityOrdered"]) check(!orchestrationBlock.includes(forbidden), `Retail omnichannel context must not duplicate canonical order field ${forbidden}`);

const inventoryReservation = read("prisma/enterprise-inventory-reservations.prisma");
check(inventoryReservation.includes("model EnterpriseInventoryReservation"), "Reservation must live in common Inventory");
check(inventoryReservation.includes("salesOrderId"), "Inventory reservation must reference the canonical sales order");
check(inventoryReservation.includes("inventoryItemId"), "Inventory reservation must reference the canonical inventory item");
check(inventoryReservation.includes("@@unique([organizationId, idempotencyKey])"), "Inventory reservations must be idempotent per tenant");

const saleExecution = read("lib/enterprise/retail/sale-execution.ts");
for (const marker of ["prepareCommercialRetailSaleV2", "createRetailSale", "finalizeRetailSaleAccounting", "autoEarnRetailLoyaltyForSale"]) check(saleExecution.includes(marker), `Canonical sale execution missing ${marker}`);
const saleRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
check(saleRoute.includes("executeCanonicalRetailSale"), "Online POS must use the same canonical sale execution used by replay");

const offlineServer = read("lib/enterprise/retail/offline-server.ts");
for (const marker of [
  "OFFLINE_SNAPSHOT_TTL_MS",
  'OFFLINE_ALLOWED_TENDERS = new Set(["CASH"])',
  "ACTIVE_PROMOTIONS_REQUIRE_ONLINE",
  "DYNAMIC_PRICING_REQUIRES_ONLINE",
  "serviceValuesFromPreview",
  "OFFLINE_PRICING_CHANGED",
  "OFFLINE_TENDER_NOT_ALLOWED",
  "OFFLINE_COMMERCIAL_CONTEXT_NOT_ALLOWED",
  "executeCanonicalRetailSale",
  'status: "SYNCED"',
  '"CONFLICT"',
  '"REJECTED"',
]) check(offlineServer.includes(marker), `Offline server contract missing ${marker}`);
check(!offlineServer.includes("primaryEmail"), "Offline snapshot must not include customer email");
check(!offlineServer.includes("primaryPhone"), "Offline snapshot must not include customer phone");
check(!offlineServer.includes("credentialReference"), "Offline snapshot/replay must not include provider credentials");

const offlineClient = read("lib/enterprise/retail/offline-client.ts");
for (const marker of ["AES-GCM", "indexedDB", "CryptoKey", "transactionDone", "PENDING_SYNC", "CONFLICT", "REJECTED", "crypto.randomUUID()", "ciphertext"]) check(offlineClient.includes(marker), `Encrypted offline client contract missing ${marker}`);
check(!offlineClient.includes("localStorage.setItem"), "Offline sale payloads must not be stored in plaintext localStorage");
const offlineUi = read("components/enterprise/professional/retail-offline-continuity.tsx");
for (const marker of ["saveRetailOfflineSnapshot", "enqueueRetailOfflineSale", "syncPending", "CASH", "PENDING_SYNC", "customerFacingError", "customerFacingStatusLabel", "Vente hors connexion"]) check(offlineUi.includes(marker), `Visible offline continuity UI missing ${marker}`);
for (const forbidden of ["server reconciliation", "rapprochement serveur", "AES-GCM · IndexedDB"]) check(!offlineUi.includes(forbidden), `Customer offline UI must not expose technical wording: ${forbidden}`);

const reservations = read("lib/enterprise/inventory/reservations.ts");
for (const marker of ["TransactionIsolationLevel.Serializable", "quantityReserved", "enterpriseInventoryReservation", "enterpriseSalesOrderItem", "INVENTORY_RESERVATION_INSUFFICIENT"]) check(reservations.includes(marker), `Inventory reservation service missing ${marker}`);

const salesSchema = read("prisma/enterprise-crm-sales.prisma");
for (const model of ["EnterpriseSalesOrder", "EnterpriseSalesOrderItem", "EnterpriseFulfillment", "EnterpriseFulfillmentItem"]) check(salesSchema.includes(`model ${model}`), `Common Sales/Fulfillment source missing ${model}`);
check(exists("app/api/enterprise/[organizationId]/sales-orders/[salesOrderId]/fulfill/route.ts"), "Omnichannel must reuse the common fulfillment route");
const commonOrders = read("lib/enterprise/crm-sales/orders.ts");
for (const marker of ["createEnterpriseDirectSalesOrder", "EnterpriseSalesOrder", "enterpriseSalesOrder.create", "SALES_ORDER_CONFIRMED", "deterministicOrderReference"]) check(commonOrders.includes(marker), `Canonical direct order service missing ${marker}`);
const omnichannel = read("lib/enterprise/retail/omnichannel.ts");
for (const marker of ["CLICK_COLLECT", "PICKUP_OTHER_STORE", "SHIP_FROM_STORE", "CUSTOMER_DELIVERY", "createEnterpriseDirectSalesOrder", "createEnterpriseInventoryReservation", "releaseEnterpriseInventoryReservation", "EnterpriseRetailOrderOrchestration", "RESERVATION_FAILED"]) check(omnichannel.includes(marker), `Omnichannel orchestration missing ${marker}`);
const omnichannelUi = read("components/enterprise/professional/retail-omnichannel-panel.tsx");
for (const marker of ["/retail/customers?search=", "/retail/products/search", "/retail/omnichannel/orders", "customerFacingError", "customerFacingFulfillmentMode", "customerFacingStatusLabel", "Commandes, retraits & livraisons", "Prix vérifié automatiquement"]) check(omnichannelUi.includes(marker), `Omnichannel POS UI missing ${marker}`);
for (const forbidden of ["Canonical CRM customer", "Client CRM canonique", "Cross-channel status", "Statut cross-channel", "server reprices on submit", "repricing serveur à l’envoi"]) check(!omnichannelUi.includes(forbidden), `Customer omnichannel UI must not expose technical wording: ${forbidden}`);

const countryPacks = read("lib/enterprise/retail/country-packs.ts");
for (const marker of ["CD_RETAIL_CORE_V1", "EVIDENCE_REQUIRED", "NOT_CERTIFIED", "TENANT_CONFIGURATION_REQUIRED", "evidenceSatisfied"]) check(countryPacks.includes(marker), `Country-pack governance missing ${marker}`);
check(!countryPacks.includes("taxRate:"), "Country packs must not hardcode tax rates into Retail Core");
const onboarding = read("lib/enterprise/retail/self-service-onboarding.ts");
for (const marker of ["COUNTRY_PACK", "FUNCTIONAL_CURRENCY", "SITE", "WAREHOUSE", "CASH_ACCOUNT", "CATALOG", "INVENTORY_LINKS", "TEAM", "ACCOUNTING", "RETAIL_CONFIGURATION", "getRetailAccountingReadiness"]) check(onboarding.includes(marker), `Self-service onboarding readiness missing ${marker}`);
for (const forbidden of ["enterpriseFinancialAccount.create", "enterpriseSite.create", "enterpriseWarehouse.create", "enterpriseInventoryBalance.create"]) check(!onboarding.includes(forbidden), `Self-service onboarding must not invent canonical tenant data through ${forbidden}`);
const readinessUi = read("components/enterprise/professional/retail-global-readiness.tsx");
for (const marker of ["Mise en service du Shop", "Configuration pays", "Prêt à vendre", "customerFacingCapabilityLabel", "customerFacingStatusLabel", "customerFacingReadinessDetail", "/retail/onboarding", "/retail/country-packs"]) check(readinessUi.includes(marker), `Visible country/onboarding readiness UI missing ${marker}`);
for (const forbidden of ["Activate proven core only", "Operational evidence", "COMMERCIAL_READY_GLOBAL", "Country pack"]) check(!readinessUi.includes(forbidden), `Customer onboarding UI must not expose governance wording: ${forbidden}`);

const retailPage = read("app/enterprise-modules/retail-page.tsx");
for (const marker of ["RetailOfflineContinuity", "RetailOmnichannelPanel", "RetailGlobalReadiness"]) check(retailPage.includes(marker), `RETAIL_POS page must mount ${marker}`);

const readiness = JSON.parse(read("lib/enterprise/sector-onboarding-readiness.json"));
const retail = readiness.profiles.find((profile) => profile.sectorCode === "COMMERCE_RETAIL");
check(retail?.shop2ProgramStatus === "COMPLETE", "Completed Shop 2 program must declare COMPLETE after production certification evidence");
check(retail?.commercializationStatus === "COMMERCIAL_READY", "Technical completion must not silently promote global commercial certification");

if (failures.length) {
  console.error("Shop 2 iteration 4 global readiness QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 global readiness QA passed: technical invariants remain enforced while customer-facing Retail surfaces use business language and global commercial claims stay evidence-gated by country.");
