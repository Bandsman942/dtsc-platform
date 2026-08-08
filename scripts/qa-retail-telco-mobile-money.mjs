import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const registry = JSON.parse(read("lib/enterprise/module-registry-retail.json"));
const expectedCodes = ["RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"];
const definitions = new Map(registry.modules.map((module) => [module.code, module]));

for (const code of expectedCodes) {
  const definition = definitions.get(code);
  check(Boolean(definition), `Missing retail registry definition: ${code}`);
  if (!definition) continue;
  check(definition.implementationStatus === "ACTIVE", `${code} must be ACTIVE`);
  check(definition.routeKind === "DEDICATED_CORE", `${code} must use DEDICATED_CORE`);
  check(definition.minimumPlan === "BUSINESS", `${code} must require BUSINESS`);
  check(Array.isArray(definition.applicableSectors) && definition.applicableSectors.includes("COMMERCE_RETAIL"), `${code} must be restricted to COMMERCE_RETAIL`);
  check(definition.accessPolicy === "POSITION_PERMISSION", `${code} must use POSITION_PERMISSION`);
  check(definition.qaContract === "enterprise-retail-telco-mobile-money", `${code} must expose the Retail QA contract`);
}
check(!definitions.get("RETAIL_POS")?.legacyCodes?.includes("SALES"), "Legacy SALES must not become an alias of RETAIL_POS");
check(!definitions.get("RETAIL_DAILY_CLOSE")?.dependencies?.includes("MOBILE_MONEY_AGENCY"), "Retail Core daily close must not require the optional Mobile Money extension");

const moduleRegistry = read("lib/enterprise/module-registry.ts");
check(moduleRegistry.includes("module-registry-retail.json"), "Canonical registry must merge the Retail registry");
check(moduleRegistry.includes("...retailRegistryData.modules"), "Retail definitions must be appended to the canonical registry");

const prismaSchema = read("prisma/enterprise-retail.prisma");
for (const model of ["EnterpriseRetailConfiguration", "EnterpriseRetailProvider", "EnterpriseRetailSale", "EnterpriseRetailSaleLine", "EnterpriseRetailTender", "EnterpriseMobileMoneyTransaction", "EnterpriseTelcoTopup", "EnterpriseRetailDailyClose", "EnterpriseRetailDailyCloseLine"]) {
  check(prismaSchema.includes(`model ${model}`), `Missing Prisma model ${model}`);
}
check(prismaSchema.includes("idempotencyKey"), "Retail write models must be idempotent");
check(prismaSchema.includes('profileCode              String   @default("RETAIL_CORE")'), "New Retail configurations must default to RETAIL_CORE");
check(exists("prisma/migrations/20260808091500_shop2_retail_core_default/migration.sql"), "Shop 2 Retail Core default migration is missing");
if (exists("prisma/migrations/20260808091500_shop2_retail_core_default/migration.sql")) {
  const coreMigration = read("prisma/migrations/20260808091500_shop2_retail_core_default/migration.sql");
  check(coreMigration.includes("SET DEFAULT 'RETAIL_CORE'"), "Retail Core migration must only establish the new default profile");
  check(!/UPDATE\s+"EnterpriseRetailConfiguration"/i.test(coreMigration), "Retail Core migration must not rewrite existing tenant profile values");
}

const profileContract = read("lib/enterprise/retail/profile-contract.ts");
for (const marker of ["RETAIL_CORE_PROFILE_CODE", "RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE", "requiredExtensions", "MOBILE_MONEY", "TELCO"]) {
  check(profileContract.includes(marker), `Retail profile contract missing ${marker}`);
}
check(profileContract.includes("RETAIL_CORE_PROFILE_CODE = \"RETAIL_CORE\""), "Retail Core profile code must be canonical");

const service = read("lib/enterprise/retail/service.ts");
check(service.includes('movementType: "SALE_FULFILLMENT"'), "POS must use SALE_FULFILLMENT inventory movement");
check(service.includes('movementType: "RETURN_IN"'), "POS reversal must use RETURN_IN inventory movement");
check(service.includes("enterpriseTreasuryTransaction.create"), "Retail settlement must feed common treasury");
check(service.includes("enterpriseCashMovement.create"), "Cash settlement must feed common cash movements");
check(service.includes("PENDING_VALIDATION"), "Daily close must require validation");
check(service.includes("RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN"), "Daily close must forbid self validation");
check(service.includes("Prisma.TransactionIsolationLevel.Serializable"), "Sensitive Retail operations must use serializable transactions");
check(!service.includes("EnterpriseCoreRecord"), "Retail must never write EnterpriseCoreRecord");

const createSaleStart = service.indexOf("export async function createRetailSale");
const createSaleEnd = service.indexOf("export async function reverseRetailSale");
const createRetailSaleBlock = createSaleStart >= 0 && createSaleEnd > createSaleStart ? service.slice(createSaleStart, createSaleEnd) : "";
check(Boolean(createRetailSaleBlock), "POS sale implementation block must be discoverable for performance QA");
for (const marker of ["catalogItemIds", "tenderAccountIds", "catalogById", "inventoryByCatalogId", "accountById", "enterpriseCashSession.findMany"]) {
  check(createRetailSaleBlock.includes(marker), `POS sale batch-loading contract missing ${marker}`);
}
check(!createRetailSaleBlock.includes("enterpriseCatalogItem.findFirst"), "POS sale must not perform per-line catalog lookups inside the transaction");
check(!createRetailSaleBlock.includes("enterpriseInventoryItem.findFirst"), "POS sale must not perform per-line inventory lookups inside the transaction");
check(!createRetailSaleBlock.includes("assertFinancialAccount("), "POS sale must not perform per-tender account lookups after batch loading");
check(!createRetailSaleBlock.includes("assertOpenCashSession("), "POS sale must not perform per-tender cash-session lookups after batch loading");

const provisioning = read("lib/enterprise/retail/provisioning.ts");
const providerContracts = [
  ['providerCode: "MPESA"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "ORANGE_MONEY"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "AIRTEL_MONEY"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "AFRIMONEY"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "VODACOM"', 'providerType: "TELCO"'],
  ['providerCode: "ORANGE"', 'providerType: "TELCO"'],
  ['providerCode: "AIRTEL"', 'providerType: "TELCO"'],
  ['providerCode: "AFRICELL"', 'providerType: "TELCO"'],
];
for (const [provider, type] of providerContracts) {
  check(provisioning.includes(provider), `Retail provisioning missing ${provider}`);
  check(provisioning.includes(type), `Retail provisioning missing ${type}`);
}
check(provisioning.includes("enterpriseRetailConfiguration.upsert"), "Runtime onboarding must upsert Retail configuration");
check(provisioning.includes("enterpriseRetailProvider.upsert"), "Specialized Retail onboarding must still be able to upsert providers");
check(provisioning.includes("existingProfile || RETAIL_CORE_PROFILE_CODE"), "New Retail tenants must start on RETAIL_CORE while existing recognized profiles are preserved");
check(provisioning.includes("profileCode === RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE"), "Default operators must only be activated for the specialized Telco/Mobile Money profile");
check(provisioning.includes("enterpriseFinanceConfiguration.findUnique"), "Retail provisioning must prefer the Finance functional currency when available");
check(provisioning.includes("Prisma.TransactionIsolationLevel.Serializable"), "Provisioning must be serializable");
check(!provisioning.includes("mobileMoneyFloatAccountId:"), "Onboarding must never invent Mobile Money float mappings");
check(!provisioning.includes("telcoFloatAccountId:"), "Onboarding must never invent Telco account mappings");

const templateApplication = read("lib/enterprise/sector-template-application.ts");
check(templateApplication.includes("syncRetailOnboardingProvisioning"), "Canonical sector-template application must provision Retail runtime data");

const guardrails = read("lib/enterprise/retail/commercial-guardrails.ts");
for (const marker of ["normalizeRetailPhone", "RETAIL_PRICE_OVERRIDE_FORBIDDEN", "RETAIL_PRICE_OVERRIDE_REASON_REQUIRED", "RETAIL_EXTERNAL_REFERENCE_REQUIRED", "RETAIL_EXTERNAL_REFERENCE_DUPLICATE", "getRetailMetricsByCurrency", "moduleCode?: RetailModuleCode"]) {
  check(guardrails.includes(marker), `Commercial Shop guardrail missing ${marker}`);
}
check(guardrails.includes("floatAccountId: null"), "Mobile Money operation route guard must force provider-mapped float");
check(guardrails.includes("operatorFloatAccountId: null"), "Telco route guard must force provider-mapped float");

const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
for (const marker of ["metricsByCurrency", "readyForFirstSale", "readyForMobileMoney", "readyForTelco", "cashSession", "includePos", "includeMobileMoney", "includeTelco", "includeClose", "isRetailBusinessProfileCode"]) {
  check(dashboard.includes(marker), `Commercial dashboard missing ${marker}`);
}

const schemas = read("lib/enterprise/retail/schemas.ts");
for (const marker of ["RETAIL_TENDER_METHODS", "MOBILE_MONEY_TRANSACTION_TYPES", "RETAIL_CLOSE_ACCOUNT_TYPES", "idempotencyKey"]) check(schemas.includes(marker), `Retail schema contract missing ${marker}`);

const http = read("lib/enterprise/retail/http.ts");
for (const contract of ["getSession", "rateLimit", "isSameOriginRequest", "getEnterpriseCommonDomainAccess", "getRetailMutationRateLimitPolicy", "retail:${moduleCode}:${action}:${organizationId}:${session.userId}"]) {
  check(http.includes(contract), `Retail API security/performance contract missing ${contract}`);
}

for (const route of [
  "app/api/enterprise/[organizationId]/retail/dashboard/route.ts",
  "app/api/enterprise/[organizationId]/retail/providers/route.ts",
  "app/api/enterprise/[organizationId]/retail/products/search/route.ts",
  "app/api/enterprise/[organizationId]/retail/sales/route.ts",
  "app/api/enterprise/[organizationId]/retail/sales/[saleId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/mobile-money/route.ts",
  "app/api/enterprise/[organizationId]/retail/mobile-money/[transactionId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/[topupId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/daily-close/route.ts",
  "app/api/enterprise/[organizationId]/retail/daily-close/[closeId]/decision/route.ts",
  "app/api/enterprise/[organizationId]/retail/cash-sessions/route.ts",
]) check(exists(route), `Missing Retail route ${route}`);

const productSearchRoute = read("app/api/enterprise/[organizationId]/retail/products/search/route.ts");
for (const marker of ["pageSize", "contains", "quantityOnHand", "quantityReserved", 'authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read")']) {
  check(productSearchRoute.includes(marker), `POS server search contract missing ${marker}`);
}

const dashboardRoute = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
check(dashboardRoute.includes("getCommercialRetailDashboard"), "Retail route must use commercial multi-currency dashboard");
check(dashboardRoute.includes("moduleCode,"), "Retail dashboard loader must receive the requested module scope");
check(!dashboardRoute.includes("getRetailDashboard("), "Retail route must not use legacy cross-currency dashboard");

const salesRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
check(salesRoute.includes("prepareCommercialRetailSale"), "POS route must enforce server-side commercial price guardrails");
check(salesRoute.includes("finalizeRetailSaleAccounting"), "POS sale must finalize common double-entry and inventory accounting before a successful response");
const reverseSaleRoute = read("app/api/enterprise/[organizationId]/retail/sales/[saleId]/reverse/route.ts");
check(reverseSaleRoute.includes("finalizeRetailSaleReversalAccounting"), "POS reversal must finalize revenue/tender and inventory accounting reversal");
const mobileRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/route.ts");
check(mobileRoute.includes("prepareCommercialMobileMoney"), "Mobile Money route must enforce phone/reference guardrails");
const telcoRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/route.ts");
check(telcoRoute.includes("prepareCommercialTelcoTopup"), "Telco route must enforce phone/reference guardrails");

const retailAccounting = read("lib/enterprise/retail/accounting.ts");
for (const marker of ["finalizeRetailSaleAccounting", "valueInventoryIssue", "RETAIL_POS_SALE_POSTED", "finalizeRetailSaleReversalAccounting", "RETAIL_POS_SALE_REVERSED", "RETAIL_POS_INVENTORY_RETURN", "RETAIL_RETURN", "enterpriseInventoryCostLayer"]) {
  check(retailAccounting.includes(marker), `Shop 2 accounting orchestration missing ${marker}`);
}
const postingRegistry = read("lib/enterprise/accounting/posting-registry-final.ts");
for (const marker of ["RETAIL_POS_SALE_POSTED", "RETAIL_POS_SALE_REVERSED", "RETAIL_POS_INVENTORY_RETURN"]) {
  check(postingRegistry.includes(marker), `Common accounting registry missing Retail posting event ${marker}`);
}
const retailPostingAdapter = read("lib/enterprise/accounting/sector-adapters/retail.ts");
for (const marker of ["SALES_REVENUE", "TAX_PAYABLE", "COST_OF_SALES", "INVENTORY", "ACCOUNT_ID:"]) {
  check(retailPostingAdapter.includes(marker), `Retail accounting adapter missing ${marker}`);
}

const workspace = read("components/enterprise/professional/enterprise-retail-shop-workspace.tsx");
for (const marker of ["ContextualUserGuide", "ModuleWorkspace", "ShopReadiness", "CashSessionBar", "stableKey", "busyAction", "setCart", "ConfirmationCard", "metricsByCurrency", "RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"]) {
  check(workspace.includes(marker), `Shop workspace missing ${marker}`);
}
check(workspace.includes("grid-cols-[minmax(0,1fr)]"), "Shop workspace must preserve the responsive single-column contract");

const adminPanels = read("components/enterprise/enterprise-admin-panels.tsx");
check(adminPanels.includes("RETAIL_PERMISSION_CATALOG"), "Enterprise admin must expose Retail permission catalog");
check(adminPanels.includes('sectorCode === "COMMERCE_RETAIL"'), "Enterprise admin must explicitly handle Commerce Retail sector");
check(!adminPanels.includes('sectorCode === "PHARMACY" ? pharmacyPermissions : healthcarePermissions'), "Enterprise admin must not fall back Commerce permissions to Healthcare");

const constants = read("lib/enterprise/retail/constants.ts");
check(constants.includes('RETAIL_PROFILE_CODE = "RETAIL_CORE"'), "Retail fallback profile must now be RETAIL_CORE");
for (const permission of ["enterprise.suppliers.view", "enterprise.suppliers.manage", "enterprise.purchases.manage"]) check(constants.includes(permission), `PURCHASE_MANAGER Retail permissions missing ${permission}`);

const guides = read("lib/user-guides/retail-telco-mobile-money-guides.ts");
for (const code of expectedCodes) check(guides.includes(`${code}:`), `Native user guide missing ${code}`);
check(guides.includes("Vodacom") && guides.includes("M-Pesa"), "Guides must distinguish telecom networks from Mobile Money wallets");
check(guides.includes("2026-08-07"), "Retail guides must carry explicit update date");

const initialMigration = read("prisma/migrations/20260807050000_retail_telco_mobile_money/migration.sql");
for (const marker of ["RETAIL_TELCO_MOBILE_MONEY", "Commerce Retail — Télécom & Mobile Money", "MOBILE_MONEY_AGENT", "RETAIL_CONTROLLER", "PROMOTIONS"]) check(initialMigration.includes(marker), `Initial Retail migration missing ${marker}`);
check(initialMigration.includes('"version" = 2'), "Commerce template v2 must remain active");

const onboardingMigration = read("prisma/migrations/20260807060000_shop_onboarding_retail_provisioning/migration.sql");
for (const marker of ["RETAIL_TELCO_MOBILE_MONEY", "COMMERCE_RETAIL", "createdByDtscUserId", "MPESA", "ORANGE_MONEY", "AIRTEL_MONEY", "AFRIMONEY"]) check(onboardingMigration.includes(marker), `Shop onboarding migration missing ${marker}`);
check(!onboardingMigration.includes('"mobileMoneyFloatAccountId"'), "Shop onboarding migration must leave Mobile Money account mapping tenant-configured");
check(!onboardingMigration.includes('"telcoFloatAccountId"'), "Shop onboarding migration must leave Telco account mapping tenant-configured");

const releaseMigration = read("prisma/migrations/20260807090000_shop_release_candidate_1/migration.sql");
for (const marker of ["VODACOM", "ORANGE", "AIRTEL", "AFRICELL", "EnterpriseMobileMoneyTransaction_rc1_external_ref_key", "EnterpriseTelcoTopup_rc1_external_ref_key", "enterprise.purchases.manage"]) check(releaseMigration.includes(marker), `Shop Release Candidate migration missing ${marker}`);

const readinessManifest = read("lib/enterprise/sector-onboarding-readiness.json");
check(readinessManifest.includes('"sectorCode": "COMMERCE_RETAIL"'), "Sector onboarding readiness must declare Commerce Retail");
check(readinessManifest.includes('"enforce": true'), "Shop onboarding readiness must be enforced in CI");
check(readinessManifest.includes('"commercializationStatus": "COMMERCIAL_READY"'), "Shop must remain COMMERCIAL_READY after explicit owner acceptance");
check(exists("scripts/qa-sector-onboarding-commercial-readiness.mjs"), "Generic sector onboarding readiness QA is missing");
check(exists("docs/SECTOR_ONBOARDING_COMMERCIAL_READINESS.md"), "Generic sector onboarding readiness documentation is missing");

if (failures.length) {
  console.error("Retail / Shop 2.0 QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Retail / Shop 2.0 QA passed (${expectedCodes.length} canonical modules, Retail Core compatibility, batched POS dependencies and accounting contracts present).`);