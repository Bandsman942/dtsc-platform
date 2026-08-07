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

const moduleRegistry = read("lib/enterprise/module-registry.ts");
check(moduleRegistry.includes("module-registry-retail.json"), "Canonical registry must merge the Retail registry");
check(moduleRegistry.includes("...retailRegistryData.modules"), "Retail definitions must be appended to the canonical registry");

const prismaSchema = read("prisma/enterprise-retail.prisma");
for (const model of ["EnterpriseRetailConfiguration", "EnterpriseRetailProvider", "EnterpriseRetailSale", "EnterpriseRetailSaleLine", "EnterpriseRetailTender", "EnterpriseMobileMoneyTransaction", "EnterpriseTelcoTopup", "EnterpriseRetailDailyClose", "EnterpriseRetailDailyCloseLine"]) {
  check(prismaSchema.includes(`model ${model}`), `Missing Prisma model ${model}`);
}
check(prismaSchema.includes("idempotencyKey"), "Retail write models must be idempotent");

const service = read("lib/enterprise/retail/service.ts");
check(service.includes('movementType: "SALE_FULFILLMENT"'), "POS must use SALE_FULFILLMENT inventory movement");
check(service.includes('movementType: "RETURN_IN"'), "POS reversal must use RETURN_IN inventory movement");
check(service.includes("enterpriseTreasuryTransaction.create"), "Retail settlement must feed common treasury");
check(service.includes("enterpriseCashMovement.create"), "Cash settlement must feed common cash movements");
check(service.includes("PENDING_VALIDATION"), "Daily close must require validation");
check(service.includes("RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN"), "Daily close must forbid self validation");
check(service.includes("Prisma.TransactionIsolationLevel.Serializable"), "Sensitive Retail operations must use serializable transactions");
check(!service.includes("EnterpriseCoreRecord"), "Retail must never write EnterpriseCoreRecord");

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
check(provisioning.includes("enterpriseRetailProvider.upsert"), "Runtime onboarding must upsert providers");
check(provisioning.includes("Prisma.TransactionIsolationLevel.Serializable"), "Provisioning must be serializable");
check(!provisioning.includes("mobileMoneyFloatAccountId:"), "Onboarding must never invent Mobile Money float mappings");
check(!provisioning.includes("telcoFloatAccountId:"), "Onboarding must never invent Telco float mappings");

const templateApplication = read("lib/enterprise/sector-template-application.ts");
check(templateApplication.includes("syncRetailOnboardingProvisioning"), "Canonical sector-template application must provision Retail runtime data");

const guardrails = read("lib/enterprise/retail/commercial-guardrails.ts");
for (const marker of ["normalizeRetailPhone", "RETAIL_PRICE_OVERRIDE_FORBIDDEN", "RETAIL_PRICE_OVERRIDE_REASON_REQUIRED", "RETAIL_EXTERNAL_REFERENCE_REQUIRED", "RETAIL_EXTERNAL_REFERENCE_DUPLICATE", "getRetailMetricsByCurrency"]) {
  check(guardrails.includes(marker), `Commercial Shop guardrail missing ${marker}`);
}
check(guardrails.includes("floatAccountId: null"), "Mobile Money operation route guard must force provider-mapped float");
check(guardrails.includes("operatorFloatAccountId: null"), "Telco route guard must force provider-mapped float");

const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
for (const marker of ["metricsByCurrency", "readyForFirstSale", "readyForMobileMoney", "readyForTelco", "cashSession"]) check(dashboard.includes(marker), `Commercial dashboard missing ${marker}`);

const schemas = read("lib/enterprise/retail/schemas.ts");
for (const marker of ["RETAIL_TENDER_METHODS", "MOBILE_MONEY_TRANSACTION_TYPES", "RETAIL_CLOSE_ACCOUNT_TYPES", "idempotencyKey"]) check(schemas.includes(marker), `Retail schema contract missing ${marker}`);

const http = read("lib/enterprise/retail/http.ts");
for (const contract of ["getSession", "rateLimit", "isSameOriginRequest", "getEnterpriseCommonDomainAccess"]) check(http.includes(contract), `Retail API security contract missing ${contract}`);

for (const route of [
  "app/api/enterprise/[organizationId]/retail/dashboard/route.ts",
  "app/api/enterprise/[organizationId]/retail/providers/route.ts",
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

const dashboardRoute = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
check(dashboardRoute.includes("getCommercialRetailDashboard"), "Retail route must use commercial multi-currency dashboard");
check(!dashboardRoute.includes("getRetailDashboard("), "Retail route must not use legacy cross-currency dashboard");

const salesRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
check(salesRoute.includes("prepareCommercialRetailSale"), "POS route must enforce server-side commercial price guardrails");
const mobileRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/route.ts");
check(mobileRoute.includes("prepareCommercialMobileMoney"), "Mobile Money route must enforce phone/reference guardrails");
const telcoRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/route.ts");
check(telcoRoute.includes("prepareCommercialTelcoTopup"), "Telco route must enforce phone/reference guardrails");

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
check(readinessManifest.includes('"commercializationStatus": "RELEASE_CANDIDATE"'), "Shop must remain Release Candidate until manual commercial acceptance");
check(exists("scripts/qa-sector-onboarding-commercial-readiness.mjs"), "Generic sector onboarding readiness QA is missing");
check(exists("docs/SECTOR_ONBOARDING_COMMERCIAL_READINESS.md"), "Generic sector onboarding readiness documentation is missing");

if (failures.length) {
  console.error("Retail Telco/Mobile Money QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Retail Telco/Mobile Money QA passed (${expectedCodes.length} canonical modules, Shop Release Candidate 1.0 guardrails present).`);
