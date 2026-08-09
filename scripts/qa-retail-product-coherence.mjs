import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function containsAll(source, markers) {
  return markers.every((marker) => source.includes(marker));
}

function before(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

const contract = read("docs/CUSTOMER_FACING_LANGUAGE_CONTRACT.md");
const language = read("lib/customer-facing-language.ts");
const retailPage = read("app/enterprise-modules/retail-page.tsx");
const activeCustomer = read("components/enterprise/professional/retail-active-customer-bar.tsx");
const paymentFollowup = read("components/enterprise/professional/retail-payment-followup.tsx");
const commercial = read("components/enterprise/professional/retail-commercial-workspace.tsx");
const deviceReadiness = read("components/enterprise/professional/retail-device-readiness.tsx");
const globalReadiness = read("components/enterprise/professional/retail-global-readiness.tsx");
const offline = read("components/enterprise/professional/retail-offline-continuity.tsx");
const omnichannel = read("components/enterprise/professional/retail-omnichannel-panel.tsx");
const ownership = read("docs/ERP_CANONICAL_ENTITY_OWNERSHIP.md");
const relationMatrix = read("docs/ERP_CROSS_MODULE_RELATION_MATRIX.md");

check(containsAll(contract, [
  "langage du métier",
  "Termes interdits",
  "Fallback obligatoire",
  "français et en anglais",
  "Séparation entre diagnostic et message client",
]), "Customer-facing language contract must define business language, forbidden technical wording, FR/EN, fallback and diagnostic separation.");

for (const marker of [
  "customerFacingError",
  "customerFacingStatusLabel",
  "customerFacingCapabilityLabel",
  "customerFacingDeviceType",
  "customerFacingFulfillmentMode",
  "customerFacingPromotionType",
  "customerFacingPromotionStackMode",
  "customerFacingSalesChannel",
  "customerFacingReturnType",
  "customerFacingProductCondition",
  "customerFacingStockDisposition",
  "customerFacingRefundMethod",
  "customerFacingFinancialAccountType",
  "customerFacingStoredValueType",
  "customerFacingPaymentMethod",
  "customerFacingPaymentStatus",
  "GIFT_CARD",
  "STORE_CREDIT",
  "PENDING_PROVIDER",
  "PENDING_APPROVAL",
  "PENDING_SYNC",
  "TENANT_CONFIGURATION_REQUIRED",
]) check(language.includes(marker), `Customer-facing language mapping is missing ${marker}.`);

check(before(retailPage, "<EnterpriseRetailShopWorkspace", "<RetailOfflineContinuity"), "The core Shop workspace must render before offline tools.");
check(before(retailPage, "<EnterpriseRetailShopWorkspace", "<RetailOmnichannelPanel"), "The core Shop workspace must render before customer order tools.");
check(before(retailPage, "<EnterpriseRetailShopWorkspace", "<RetailGlobalReadiness"), "The core Shop workspace must render before setup/readiness tools.");
check((retailPage.match(/<details/g) || []).length >= 2, "Retail POS secondary tools must use progressive disclosure instead of stacking every panel before the core workflow.");
check(retailPage.includes("RetailPaymentFollowup"), "Retail POS must integrate the permission-aware payment follow-up surface.");

check(activeCustomer.includes("useAppLocale"), "Active customer UI must use the shared locale context.");
check(activeCustomer.includes("customerFacingError"), "Active customer UI must sanitize customer-visible errors.");
check(activeCustomer.includes("customerFacingStoredValueType"), "Active customer UI must translate stored-value types.");
check(activeCustomer.includes("customerFacingStatusLabel"), "Active customer UI must translate loyalty and stored-value statuses.");
check(activeCustomer.includes("/retail/customers/${active.id}"), "Active customer UI must load customer benefits from the existing customer history API.");
check(activeCustomer.includes("Fidélité & avoirs client"), "Active customer UI must expose customer value with business wording.");
check(activeCustomer.includes("<details"), "Customer value must remain progressively disclosed instead of expanding the checkout by default.");
check(!activeCustomer.includes("rattaché côté serveur"), "Active customer UI must not explain server-side implementation to the client.");
check(!activeCustomer.includes("attached server-side"), "Active customer UI must not explain server-side implementation to the client.");
for (const forbidden of [">GIFT_CARD<", ">STORE_CREDIT<", ">ACTIVE<", ">SUSPENDED<", ">EXHAUSTED<"]) {
  check(!activeCustomer.includes(forbidden), `Active customer value UI still renders a raw enum: ${forbidden}`);
}

for (const marker of [
  "canManagePayments",
  "canRefundPayments",
  "customerFacingError",
  "customerFacingPaymentMethod",
  "customerFacingPaymentStatus",
  "[touch-action:pan-x]",
  "<details",
]) check(paymentFollowup.includes(marker), `Payment follow-up UI must include ${marker}.`);
for (const forbidden of ["providerId", "providerReference", "failureCode", "failureMessage", "payload", "webhook", "credentialReference", "secretReference"]) {
  check(!paymentFollowup.includes(forbidden), `Payment follow-up UI must not load or render sensitive/internal field ${forbidden}.`);
}
for (const forbidden of [">INITIATED<", ">AUTHORIZED<", ">CAPTURED<", ">FAILED<", ">VOIDED<", ">REFUNDED<", ">CARD<", ">BANK_TRANSFER<"]) {
  check(!paymentFollowup.includes(forbidden), `Payment follow-up UI still renders a raw enum: ${forbidden}`);
}
check(!paymentFollowup.includes("provider diagnostics"), "Payment follow-up customer copy must not explain provider diagnostics.");
check(!paymentFollowup.includes("diagnostics opérateur"), "Payment follow-up customer copy must not explain operator diagnostics.");

for (const marker of [
  "useAppLocale",
  "customerFacingError",
  "customerFacingStatusLabel",
  "customerFacingPromotionType",
  "customerFacingPromotionStackMode",
  "customerFacingSalesChannel",
  "customerFacingReturnType",
  "customerFacingProductCondition",
  "customerFacingStockDisposition",
  "customerFacingRefundMethod",
  "customerFacingFinancialAccountType",
]) check(commercial.includes(marker), `Retail commercial UI must use ${marker}.`);

for (const forbidden of [
  "Canonical sale prices",
  "Prix de vente canoniques",
  "Retail price conditions",
  "Conditions de prix Retail",
  "canonical price applies at the POS",
  "prix canonique s’applique au POS",
  "dedicated Retail domain",
  "domaine Retail dédié",
  "retired legacy PROMOTIONS source",
  "ancienne source PROMOTIONS retirée",
  "without bypassing Finance or Inventory",
  "sans contourner Finance ni le stock",
  ">Fixed<",
  ">Quantity<",
  ">Buy X Get Y<",
  ">Bundle<",
  ">Exclusive<",
  ">Stackable<",
  ">Return<",
  ">Exchange<",
  ">Sellable<",
  ">Restock<",
  ">Scrap<",
  ">Original tender<",
  ">Bank transfer<",
  ">Unit price<",
]) check(!commercial.includes(forbidden), `Retail commercial customer UI still contains raw or technical wording: ${forbidden}`);

check(!commercial.includes("caught instanceof Error ? caught.message"), "Retail commercial UI must not pass backend error messages directly to customers.");
check(!commercial.includes("condition.catalogPriceId}"), "Retail pricing rules must not fall back to an internal price identifier in customer UI.");
check(commercial.includes('href="/enterprise-modules/CATALOG"'), "Retail pricing UI must deep-link to the Catalog source of truth.");
check(commercial.includes('href="/enterprise-modules/FINANCE_TREASURY"'), "Retail refund UI must deep-link to Treasury for refund accounts.");
check(commercial.includes("[touch-action:pan-x]"), "Retail commercial tab/filter rails must preserve touch-first horizontal navigation.");

check(deviceReadiness.includes("customerFacingDeviceType"), "POS device UI must translate internal device types to business labels.");
check(!deviceReadiness.includes("device.deviceType.replaceAll"), "POS device UI must not render raw enum-derived device types.");

for (const marker of ["customerFacingCapabilityLabel", "customerFacingStatusLabel", "customerFacingReadinessDetail", "customerFacingError"]) {
  check(globalReadiness.includes(marker), `Shop setup UI must use ${marker}.`);
}
check(!globalReadiness.includes("JSON.stringify(item.detail"), "Shop setup UI must not render raw readiness payloads.");
check(!globalReadiness.includes("COMMERCIAL_READY_GLOBAL"), "Customer Shop setup UI must not expose internal commercial maturity codes.");
check(!globalReadiness.includes('"Country pack"'), "Customer Shop setup UI must use commercial country-configuration wording.");

check(offline.includes("customerFacingError"), "Offline sales UI must sanitize client-visible errors.");
check(offline.includes("customerFacingStatusLabel(entry.status"), "Offline sales history must translate internal synchronization statuses.");
for (const forbidden of [
  "AES-GCM · IndexedDB",
  "server reconciliation",
  "rapprochement serveur",
  "Encrypted local draft",
  "Brouillon local chiffré",
  "Local reconciliation history",
  "Historique local de rapprochement",
  "Chiffrer le brouillon de vente",
]) check(!offline.includes(forbidden), `Offline customer UI still contains technical wording: ${forbidden}`);

for (const marker of ["customerFacingError", "customerFacingFulfillmentMode", "customerFacingStatusLabel"]) {
  check(omnichannel.includes(marker), `Customer order UI must use ${marker}.`);
}
for (const forbidden of [
  "Canonical CRM customer",
  "Client CRM canonique",
  "server reprices on submit",
  "repricing serveur à l’envoi",
  "Authoritative pricing is server-side",
  "Le prix autoritatif est calculé côté serveur",
  "Cross-channel status",
  "Statut cross-channel",
  "Mode de fulfillment et magasins",
]) check(!omnichannel.includes(forbidden), `Customer order UI still contains technical wording: ${forbidden}`);

check(containsAll(ownership, ["EnterpriseBusinessParty", "EnterpriseCatalogItem", "EnterpriseSalesOrder", "EnterpriseStockMovement", "EnterpriseJournalEntry"]), "Canonical ERP entity ownership contract must remain present while Retail UX is refactored.");
check(containsAll(relationMatrix, ["Commande", "livraison", "mouvement", "facture"]), "ERP cross-module relation matrix must remain available during Retail consolidation.");

if (failures.length) {
  console.error("Retail product coherence QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Retail product coherence QA passed.");
