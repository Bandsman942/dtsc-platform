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
  "lib/enterprise/retail/sale-execution.ts",
  "lib/enterprise/retail/offline-server.ts",
  "lib/enterprise/retail/offline-client.ts",
  "lib/enterprise/inventory/reservations.ts",
  "app/api/enterprise/[organizationId]/retail/offline/snapshot/route.ts",
  "app/api/enterprise/[organizationId]/retail/offline/sync/route.ts",
  "app/api/enterprise/[organizationId]/retail/inventory/availability/route.ts",
  "app/api/enterprise/[organizationId]/retail/inventory/reservations/route.ts",
]) check(exists(file), `Missing Shop 2 iteration 4 foundation: ${file}`);

const sw = read("public/sw.js");
check(sw.includes('url.pathname.startsWith("/api/")'), "Service worker must explicitly recognize API requests");
check(sw.includes('request.mode === "navigate"'), "Service worker must treat navigation separately");
check(!sw.includes("caches.put(request") || sw.includes("isStaticAsset") || sw.includes("PUBLIC_PATHS"), "Private requests must not be blindly cached");

const retailSchema = read("prisma/enterprise-retail-offline-omnichannel.prisma");
for (const model of ["EnterpriseRetailOfflineSnapshot", "EnterpriseRetailOfflineSyncOperation", "EnterpriseRetailCountryPackActivation", "EnterpriseRetailOnboardingRun"]) check(retailSchema.includes(`model ${model}`), `Missing iteration 4 Retail model ${model}`);
check(retailSchema.includes("@@unique([organizationId, operationUuid])"), "Offline replay UUID must be tenant-scoped and unique");
check(!retailSchema.includes("quantityOnHand"), "Offline Retail schema must not create a second stock balance");
check(!retailSchema.includes("model EnterpriseRetailSalesOrder"), "Retail must not create a parallel sales-order master");

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
for (const marker of ["AES-GCM", "indexedDB", "CryptoKey", "PENDING_SYNC", "CONFLICT", "REJECTED", "crypto.randomUUID()", "ciphertext"]) check(offlineClient.includes(marker), `Encrypted offline client contract missing ${marker}`);
check(!offlineClient.includes("localStorage.setItem"), "Offline sale payloads must not be stored in plaintext localStorage");

const reservations = read("lib/enterprise/inventory/reservations.ts");
for (const marker of ["TransactionIsolationLevel.Serializable", "quantityReserved", "enterpriseInventoryReservation", "enterpriseSalesOrderItem", "INVENTORY_RESERVATION_INSUFFICIENT"]) check(reservations.includes(marker), `Inventory reservation service missing ${marker}`);

const salesSchema = read("prisma/enterprise-crm-sales.prisma");
for (const model of ["EnterpriseSalesOrder", "EnterpriseSalesOrderItem", "EnterpriseFulfillment", "EnterpriseFulfillmentItem"]) check(salesSchema.includes(`model ${model}`), `Common Sales/Fulfillment source missing ${model}`);
check(exists("app/api/enterprise/[organizationId]/sales-orders/[salesOrderId]/fulfill/route.ts"), "Omnichannel must reuse the common fulfillment route");

const readiness = JSON.parse(read("lib/enterprise/sector-onboarding-readiness.json"));
const retail = readiness.profiles.find((profile) => profile.sectorCode === "COMMERCE_RETAIL");
check(retail?.shop2ProgramStatus === "ITERATION_4_IN_PROGRESS", "Iteration 4 branch must declare ITERATION_4_IN_PROGRESS");
check(retail?.commercializationStatus === "COMMERCIAL_READY", "Global commercial certification must not be promoted before final evidence");

if (failures.length) {
  console.error("Shop 2 iteration 4 global readiness QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 iteration 4 global readiness QA passed.");
