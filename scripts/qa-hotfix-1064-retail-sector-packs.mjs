import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const adapters = read("lib/enterprise/retail/subtype-registry.ts");
const policy = read("lib/enterprise/retail/extension-policy.ts");
const registry = read("lib/enterprise/business-subtype-registry.ts");
const retailRegistry = JSON.parse(read("lib/enterprise/module-registry-retail.json"));
const templates = read("lib/enterprise-sector-templates.ts");
const provisioning = read("lib/enterprise/retail/provisioning.ts");
const reconciliation = read("lib/enterprise/module-subscription-reconciliation.ts");
const consoleRoute = read("app/api/admin/client-organizations/[id]/retail-extensions/route.ts");
const consolePanel = read("components/admin/retail-sector-packs-panel.tsx");
const consoleOrganizations = read("components/admin/client-organizations-panel.tsx");
const companyCreation = read("app/api/admin/client-organizations/route.ts");
const companyUpdate = read("app/api/admin/client-organizations/[id]/route.ts");
const ownerToggle = read("app/api/enterprise/[organizationId]/modules/[moduleId]/route.ts");
const entitlements = read("lib/billing/entitlements.ts");
const audit = read("lib/enterprise/module-access.ts");

assert.match(policy, /RETAIL_CORE_MODULE_CODES = \["RETAIL_POS", "RETAIL_DAILY_CLOSE"\]/);
assert.match(policy, /RETAIL_OPTIONAL_EXTENSION_MODULE_CODES = \["MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"\]/);
assert.match(adapters, /moduleCodes: RETAIL_OPTIONAL_EXTENSION_MODULE_CODES/);
assert.doesNotMatch(adapters, /moduleCodes: RETAIL_MODULE_CODES/);
assert.match(adapters, /retailSubtypeAllowsModule/);
assert.match(templates, /getRetailExtensionPreference/);
assert.match(templates, /const shouldEnable = explicitPackChoice \?\? templateModule\.defaultEnabled/);
assert.match(provisioning, /!existingConfiguration && resolvedSubtype === null/);
assert.match(provisioning, /getRetailExtensionPreference/);
assert.match(policy, /retailExtensionShouldBeEnabled/);
assert.match(reconciliation, /retailExtensionShouldBeEnabled\(/);
assert.match(reconciliation, /persistRetailExtensionChoice\(/);
assert.match(reconciliation, /RETAIL_EXTENSION_PENDING_OPERATIONS/);
assert.match(reconciliation, /isEnterpriseModuleBusinessSubtypeCompatible/);
assert.match(reconciliation, /withRetailExtensionPreference/);
assert.match(reconciliation, /!isRetailOptionalExtensionModule\(definition\.code\)/);
assert.match(ownerToggle, /!isRetailOptionalExtensionModule\(enterpriseModule\.moduleCode\)/);
assert.match(entitlements, /businessSubtypeCode/);
assert.match(audit, /ENTITLEMENT_DENIED/);
assert.match(companyCreation, /sector\?\.code === RETAIL_SECTOR_CODE && !businessSubtypeCode/);
assert.match(companyUpdate, /reconcileOrganizationModulesWithSubscription\(id\)/);
assert.match(consoleRoute, /requireConsoleCapability\(CONSOLE_CAPABILITIES\.ORGANIZATIONS_MANAGE\)/);
assert.match(consoleRoute, /hasRecentStepUp/);
assert.match(consoleRoute, /isSameOriginRequest/);
assert.match(consoleRoute, /await rateLimit/);
assert.match(consoleRoute, /z\.discriminatedUnion\("operation"/);
assert.match(consoleRoute, /persistBusinessSubtypeSelection/);
assert.match(consoleRoute, /Prisma\.TransactionIsolationLevel\.Serializable/);
assert.match(consoleRoute, /DTSC_RETAIL_EXTENSION_DISABLED/);
assert.match(consoleRoute, /DTSC_RETAIL_CLASSIFICATION_CHANGED/);
assert.match(consoleRoute, /writeAuditLog/);
assert.match(consoleRoute, /Cache-Control.*private, no-store/);
assert.match(consolePanel, /data-dtsc-retail-packs/);
assert.match(consolePanel, /data-retail-extension/);
assert.match(consolePanel, /"\/api\/auth\/step-up"/);
assert.match(consolePanel, /classificationPending/);
assert.match(consolePanel, /focus-visible:ring-2/);
assert.match(consolePanel, /grid-cols-1 gap-3 lg:grid-cols-2/);
assert.match(consoleOrganizations, /RetailSectorPacksPanel/);
assert.match(consoleOrganizations, /organization\.sectorCode === "COMMERCE_RETAIL"/);

const retailCodes = new Set(retailRegistry.modules.map((item) => item.code));
for (const code of ["RETAIL_POS", "RETAIL_DAILY_CLOSE", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS"]) {
  assert(retailCodes.has(code), `Missing real Retail service ${code}`);
}
for (const item of retailRegistry.modules) assert.equal(item.applicableSectors[0], "COMMERCE_RETAIL");

const plannedCodes = [
  "SUPERMARKET_GROCERY", "FASHION_ACCESSORIES", "ELECTRONICS_PHONES",
  "BEAUTY_COSMETICS", "HARDWARE_DIY", "AUTO_PARTS", "BOOKS_STATIONERY",
  "FURNITURE_APPLIANCES", "FRESH_FOOD",
];
for (const code of plannedCodes) {
  const index = registry.indexOf(`code: "${code}"`);
  assert(index >= 0, `Missing planned sub-sector ${code}`);
  const slice = registry.slice(index, index + 800);
  assert.match(slice, /implementationStatus: "PLANNED"/, `Sub-sector ${code} must not be active`);
}
for (const locale of ["fr","en"]) {
  const values = Object.values(JSON.parse(read(`locales/retail-workspace.${locale}.json`)));
  assert(!values.some((value) => typeof value === "string" && /\bshop\b/i.test(value)), `Generic retail workspace ${locale} still exposes Shop branding`);
}
console.log("PASS #1064: Retail Core, historical compatibility, optional packs, subscription governance, admin security, i18n and planned status");
