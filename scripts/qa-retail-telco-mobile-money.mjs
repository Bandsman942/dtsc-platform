import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const registry = JSON.parse(read("lib/enterprise/module-registry-retail.json"));
const expectedCodes = ["RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"];
const definitions = new Map(registry.modules.map((entry) => [entry.code, entry]));

for (const code of expectedCodes) {
  const definition = definitions.get(code);
  check(Boolean(definition), `Missing Retail registry definition: ${code}`);
  if (!definition) continue;
  check(definition.implementationStatus === "ACTIVE", `${code} must remain ACTIVE`);
  check(definition.routeKind === "DEDICATED_CORE", `${code} must remain DEDICATED_CORE`);
  check(definition.minimumPlan === "BUSINESS", `${code} must require BUSINESS`);
  check(definition.accessPolicy === "POSITION_PERMISSION", `${code} must use POSITION_PERMISSION`);
  check(Array.isArray(definition.applicableSectors) && definition.applicableSectors.includes("COMMERCE_RETAIL"), `${code} must remain scoped to COMMERCE_RETAIL`);
  check(definition.qaContract === "enterprise-retail-telco-mobile-money", `${code} must keep the Retail QA contract`);
}
check(!definitions.get("RETAIL_POS")?.legacyCodes?.includes("SALES"), "Legacy SALES must not become a RETAIL_POS alias");
check(!definitions.get("RETAIL_DAILY_CLOSE")?.dependencies?.includes("MOBILE_MONEY_AGENCY"), "Retail Core daily close must not require Mobile Money");

const moduleRegistry = read("lib/enterprise/module-registry.ts");
check(moduleRegistry.includes("module-registry-retail.json"), "Canonical registry must merge Retail registry");
check(moduleRegistry.includes("...retailRegistryData.modules"), "Retail modules must be appended to the canonical registry");

const prismaSchema = read("prisma/enterprise-retail.prisma");
for (const model of [
  "EnterpriseRetailConfiguration",
  "EnterpriseRetailProvider",
  "EnterpriseRetailSale",
  "EnterpriseRetailSaleLine",
  "EnterpriseRetailTender",
  "EnterpriseMobileMoneyTransaction",
  "EnterpriseTelcoTopup",
  "EnterpriseRetailDailyClose",
  "EnterpriseRetailDailyCloseLine",
]) check(prismaSchema.includes(`model ${model}`), `Missing Prisma model ${model}`);
check(prismaSchema.includes("idempotencyKey"), "Retail write models must preserve idempotency keys");
check(prismaSchema.includes('profileCode              String   @default("RETAIL_CORE")'), "New Retail configuration must default to RETAIL_CORE");
check(exists("prisma/migrations/20260808091500_shop2_retail_core_default/migration.sql"), "Retail Core default migration is missing");

const profileContract = read("lib/enterprise/retail/profile-contract.ts");
for (const marker of ["RETAIL_CORE_PROFILE_CODE", "RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE", "requiredExtensions", "MOBILE_MONEY", "TELCO"]) {
  check(profileContract.includes(marker), `Retail profile contract missing ${marker}`);
}

const service = read("lib/enterprise/retail/service.ts");
for (const marker of [
  'movementType: "SALE_FULFILLMENT"',
  'movementType: "RETURN_IN"',
  "enterpriseTreasuryTransaction.create",
  "enterpriseCashMovement.create",
  "PENDING_VALIDATION",
  "RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN",
  "Prisma.TransactionIsolationLevel.Serializable",
]) check(service.includes(marker), `Retail service contract missing ${marker}`);
check(!service.includes("EnterpriseCoreRecord"), "Retail must not write EnterpriseCoreRecord");

const createSaleStart = service.indexOf("export async function createRetailSale");
const createSaleEnd = service.indexOf("export async function reverseRetailSale");
const createSaleBlock = createSaleStart >= 0 && createSaleEnd > createSaleStart ? service.slice(createSaleStart, createSaleEnd) : "";
check(Boolean(createSaleBlock), "POS sale implementation must remain discoverable");
for (const marker of ["catalogItemIds", "tenderAccountIds", "catalogById", "inventoryByCatalogId", "accountById", "enterpriseCashSession.findMany"]) {
  check(createSaleBlock.includes(marker), `POS batch-loading contract missing ${marker}`);
}
check(!createSaleBlock.includes("enterpriseCatalogItem.findFirst"), "POS must not reintroduce per-line catalog N+1 queries");
check(!createSaleBlock.includes("enterpriseInventoryItem.findFirst"), "POS must not reintroduce per-line inventory N+1 queries");

const provisioning = read("lib/enterprise/retail/provisioning.ts");
for (const [provider, type] of [
  ['providerCode: "MPESA"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "ORANGE_MONEY"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "AIRTEL_MONEY"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "AFRIMONEY"', 'providerType: "MOBILE_MONEY"'],
  ['providerCode: "VODACOM"', 'providerType: "TELCO"'],
  ['providerCode: "ORANGE"', 'providerType: "TELCO"'],
  ['providerCode: "AIRTEL"', 'providerType: "TELCO"'],
  ['providerCode: "AFRICELL"', 'providerType: "TELCO"'],
]) {
  check(provisioning.includes(provider), `Retail provisioning missing ${provider}`);
  check(provisioning.includes(type), `Retail provisioning missing ${type}`);
}
for (const marker of ["enterpriseRetailConfiguration.upsert", "enterpriseRetailProvider.upsert", "existingProfile || RETAIL_CORE_PROFILE_CODE", "profileCode === RETAIL_TELCO_MOBILE_MONEY_PROFILE_CODE", "enterpriseFinanceConfiguration.findUnique", "Prisma.TransactionIsolationLevel.Serializable"]) {
  check(provisioning.includes(marker), `Retail provisioning contract missing ${marker}`);
}
check(!provisioning.includes("mobileMoneyFloatAccountId:"), "Onboarding must not invent Mobile Money account mappings");
check(!provisioning.includes("telcoFloatAccountId:"), "Onboarding must not invent Telco account mappings");

const guardrails = read("lib/enterprise/retail/commercial-guardrails.ts");
for (const marker of ["normalizeRetailPhone", "RETAIL_PRICE_OVERRIDE_FORBIDDEN", "RETAIL_PRICE_OVERRIDE_REASON_REQUIRED", "RETAIL_EXTERNAL_REFERENCE_REQUIRED", "RETAIL_EXTERNAL_REFERENCE_DUPLICATE", "getRetailMetricsByCurrency", "moduleCode?: RetailModuleCode", "floatAccountId: null", "operatorFloatAccountId: null"]) {
  check(guardrails.includes(marker), `Retail commercial guardrail missing ${marker}`);
}

const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
for (const marker of ["metricsByCurrency", "readyForFirstSale", "readyForMobileMoney", "readyForTelco", "cashSession", "cashSessions", "telcoConfiguration", "includePos", "includeMobileMoney", "includeTelco", "includeClose", "accountingReadiness", 'code: "ACCOUNTING"']) {
  check(dashboard.includes(marker), `Retail dashboard missing ${marker}`);
}

const accountingReadiness = read("lib/enterprise/retail/accounting-readiness.ts");
for (const marker of ["SALES_REVENUE", "TAX_PAYABLE", "COST_OF_SALES", "INVENTORY", "postingPeriodAvailable"]) {
  check(accountingReadiness.includes(marker), `POS accounting readiness missing ${marker}`);
}

const schemas = read("lib/enterprise/retail/schemas.ts");
for (const marker of ["RETAIL_TENDER_METHODS", "MOBILE_MONEY_TRANSACTION_TYPES", "RETAIL_CLOSE_ACCOUNT_TYPES", "idempotencyKey"]) {
  check(schemas.includes(marker), `Retail schema contract missing ${marker}`);
}

const http = read("lib/enterprise/retail/http.ts");
for (const marker of ["getSession", "rateLimit", "isSameOriginRequest", "getEnterpriseCommonDomainAccess", "getRetailMutationRateLimitPolicy", "retail:${moduleCode}:${action}:${organizationId}:${session.userId}"]) {
  check(http.includes(marker), `Retail API security contract missing ${marker}`);
}

const routes = [
  "app/api/enterprise/[organizationId]/retail/dashboard/route.ts",
  "app/api/enterprise/[organizationId]/retail/providers/route.ts",
  "app/api/enterprise/[organizationId]/retail/products/search/route.ts",
  "app/api/enterprise/[organizationId]/retail/sales/route.ts",
  "app/api/enterprise/[organizationId]/retail/sales/[saleId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/mobile-money/route.ts",
  "app/api/enterprise/[organizationId]/retail/mobile-money/[transactionId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/accounts/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/cash-sessions/[sessionId]/close/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/[topupId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/daily-close/route.ts",
  "app/api/enterprise/[organizationId]/retail/daily-close/[closeId]/decision/route.ts",
  "app/api/enterprise/[organizationId]/retail/cash-sessions/route.ts",
];
for (const route of routes) check(exists(route), `Missing Retail API route ${route}`);

const productSearchRoute = read("app/api/enterprise/[organizationId]/retail/products/search/route.ts");
for (const marker of ["pageSize", "contains", "quantityOnHand", "quantityReserved", 'authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read")']) {
  check(productSearchRoute.includes(marker), `POS product search contract missing ${marker}`);
}

const dashboardRoute = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
check(dashboardRoute.includes("getCommercialRetailDashboard"), "Retail dashboard must use commercial multi-currency loader");
check(dashboardRoute.includes("moduleCode,"), "Retail dashboard must receive requested module scope");
check(!dashboardRoute.includes("getRetailDashboard("), "Legacy Retail dashboard must not return");

const saleExecution = read("lib/enterprise/retail/sale-execution.ts");
const salesRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
check(salesRoute.includes("executeCanonicalRetailSale"), "POS route must use canonical sale execution");
for (const marker of ["previewRetailCommercialPricing", "prepareCommercialRetailSaleV2", "createRetailSale", "persistRetailCommercialDecisions", "finalizeRetailSaleAccounting"]) {
  check(saleExecution.includes(marker), `Canonical POS execution missing ${marker}`);
}
const pricingIndex = saleExecution.indexOf("prepareCommercialRetailSaleV2");
const createIndex = saleExecution.indexOf("createRetailSale(args.organizationId");
const accountingIndex = saleExecution.indexOf("finalizeRetailSaleAccounting(args.organizationId");
check(pricingIndex >= 0 && createIndex > pricingIndex && accountingIndex > createIndex, "POS must price/guard before creation and finalize accounting before returning");

const reverseSaleRoute = read("app/api/enterprise/[organizationId]/retail/sales/[saleId]/reverse/route.ts");
check(reverseSaleRoute.includes("finalizeRetailSaleReversalAccounting"), "POS reversal must use common accounting reversal");
check(read("app/api/enterprise/[organizationId]/retail/mobile-money/route.ts").includes("prepareCommercialMobileMoney"), "Mobile Money route must enforce commercial guardrails");
check(read("app/api/enterprise/[organizationId]/retail/telco-topups/route.ts").includes("prepareCommercialTelcoTopup"), "Telco route must enforce commercial guardrails");

const retailAccounting = read("lib/enterprise/retail/accounting.ts");
for (const marker of ["finalizeRetailSaleAccounting", "valueInventoryIssue", "RETAIL_POS_SALE_POSTED", "finalizeRetailSaleReversalAccounting", "RETAIL_POS_SALE_REVERSED", "RETAIL_POS_INVENTORY_RETURN", "enterpriseInventoryCostLayer"]) {
  check(retailAccounting.includes(marker), `Retail accounting orchestration missing ${marker}`);
}
const postingRegistry = read("lib/enterprise/accounting/posting-registry-final.ts");
for (const marker of ["RETAIL_POS_SALE_POSTED", "RETAIL_POS_SALE_REVERSED", "RETAIL_POS_INVENTORY_RETURN"]) {
  check(postingRegistry.includes(marker), `Common accounting registry missing ${marker}`);
}

const retailPage = read("app/enterprise-modules/retail-page.tsx");
const posWorkspace = read("components/enterprise/professional/retail-pos-workspace.tsx");
const operatorWorkspace = read("components/enterprise/professional/retail-operator-workspace.tsx");
const dailyCloseWorkspace = read("components/enterprise/professional/retail-daily-close-workspace.tsx");
const sharedWorkspace = read("components/enterprise/professional/retail-workspace-shared.tsx");

check(!exists("components/enterprise/professional/enterprise-retail-shop-workspace.tsx"), "Legacy monolithic Retail workspace must remain retired");
for (const marker of ["RetailPosWorkspace", "RetailOperatorWorkspace", "RetailDailyCloseWorkspace"]) {
  check(retailPage.includes(marker), `Retail page must route through ${marker}`);
}
for (const marker of ["setCart", "/retail/products/search", 'pageSize: "30"', "RetailErpLinks", "grid min-w-0"]) {
  check(posWorkspace.includes(marker), `Dedicated POS workspace missing ${marker}`);
}
for (const marker of ["ConfirmationCard", "customerFacingMobileMoneyTransactionType", "customerFacingFeeCollectionMode", "providerLabel", "RetailErpLinks", "floatAccountId: null", "operatorFloatAccountId: null"]) {
  check(operatorWorkspace.includes(marker), `Dedicated operator workspace missing ${marker}`);
}
for (const marker of ["stableKey", "busyAction", "CashSessionBar", "ShopReadiness", "metricsByCurrency", "customerFacingError", "customerFacingFinancialAccountType", "[touch-action:pan-x]"]) {
  check(sharedWorkspace.includes(marker), `Shared Retail workspace contract missing ${marker}`);
}
for (const marker of ["idempotencyKey", "stableKey", "canManage", 'pageSize: "50"', "customerFacingFinancialAccountType"]) {
  check(dailyCloseWorkspace.includes(marker), `Daily close workspace contract missing ${marker}`);
}

const adminPanels = read("components/enterprise/enterprise-admin-panels.tsx");
check(adminPanels.includes("RETAIL_PERMISSION_CATALOG"), "Enterprise admin must expose Retail permission catalog");
check(adminPanels.includes('sectorCode === "COMMERCE_RETAIL"'), "Enterprise admin must explicitly handle Commerce Retail");
check(!adminPanels.includes('sectorCode === "PHARMACY" ? pharmacyPermissions : healthcarePermissions'), "Commerce Retail must not fall back to Healthcare permissions");

const guides = read("lib/user-guides/retail-telco-mobile-money-guides.ts");
for (const code of expectedCodes) check(guides.includes(`${code}:`), `Retail user guide missing ${code}`);
check(guides.includes("Vodacom") && guides.includes("M-Pesa"), "Retail guides must distinguish telecom networks from Mobile Money services");

const templateApplication = read("lib/enterprise/sector-template-application.ts");
check(templateApplication.includes("syncRetailOnboardingProvisioning"), "Sector template application must provision Retail runtime data");

if (failures.length) {
  console.error("Retail/Telco/Mobile Money QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Retail/Telco/Mobile Money QA passed: registry, security, accounting, canonical flows, dedicated workspaces, responsive UX, guides and operator separation are consistent.");
