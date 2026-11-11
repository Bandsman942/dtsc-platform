import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function has(path, markers) { const source = read(path); for (const marker of markers) assert.ok(source.includes(marker), path + " missing " + marker); }
has("lib/enterprise/retail/offline-server.ts", [
  "prepareRetailInvoice", "FINANCE_DRAFT", "EnterpriseSalesInvoice",
  "RETAIL_OFFLINE_INVOICE_CHECKOUT_NOT_SUPPORTED", "OFFLINE_PRICING_CHANGED",
  "rawKind === \"INVOICE_DRAFT\"", "PREPARE_INVOICE",
]);
has("components/enterprise/professional/retail-offline-continuity.tsx", ["PENDING_SYNC", "invoiceDraftMode", "void syncPending()", "Enregistrer le brouillon hors connexion"]);
has("components/public/public-nav.tsx", ["onPointerEnter", "onPointerLeave", "onFocus", "aria-haspopup"]);
has("app/api/enterprise/[organizationId]/retail/payments/invoices/route.ts", ["search", "createdAt", "siteId", "collectibleSiteIds"]);
has("components/enterprise/professional/retail-payment-followup.tsx", ["Recherche intelligente", "canonicalPage", "dateFrom", "dateTo", "⋯"]);
has("app/api/enterprise/[organizationId]/retail/devices/route.ts", ["canManage", "retailSitesForCapability", "pageSize", "getRetailCustomerPaymentPermissions"]);
has("components/enterprise/professional/retail-device-readiness.tsx", ["Ajouter un équipement", "saveDevice", "testDevice", "Connexion physique non vérifiée"]);
has("lib/enterprise/retail/device-capabilities.ts", ["available: false, degraded: true, reason: \"EXTERNAL_BRIDGE\""]);
has("app/api/enterprise/[organizationId]/retail/inventory-alerts/route.ts", ["lowStockPagination", "dateFrom", "dateTo", "lowStockPage", "search"]);
has("components/enterprise/professional/retail-expiry-alerts-panel.tsx", ["Recherche intelligente", "lowStockPage", "copyLot", "pageCount"]);
has("lib/enterprise/retail/omnichannel.ts", ["filters:", "salesOrderId", "fulfillmentMode"]);
has("components/enterprise/professional/retail-omnichannel-panel.tsx", ["ordersPage", "ordersSearch", "ordersStatus", "setOrdersPage"]);
has("lib/enterprise/retail/self-service-onboarding.ts", ["missingTaxItems", "dynamicPricingRules", "configuredProfiles", "numbering"]);
has("components/enterprise/professional/retail-global-readiness.tsx", ["Diagnostics opérationnels", "Socle de vente prêt"]);
console.log("PASS — DTSC Retail five-lot candidate static interface and scope assertions");
