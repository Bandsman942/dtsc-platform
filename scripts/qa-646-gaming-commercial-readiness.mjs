import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const includesAll = (content, markers, label) => { for (const marker of markers) check(content.includes(marker), `${label}: missing ${marker}`); };

const subtypeRegistry = read("lib/enterprise/business-subtype-registry.ts");
const gamingRegistry = readJson("lib/enterprise/module-registry-gaming.json");
const provisioning = read("lib/enterprise/gaming/provisioning.ts");
const templateApplication = read("lib/enterprise/sector-template-application.ts");
const organizationCreate = read("app/api/admin/client-organizations/route.ts");
const templatePreview = read("lib/enterprise/gaming/template-preview.ts");
const adminPreviewRoute = read("app/api/admin/sector-templates/route.ts");
const onboarding = read("lib/enterprise/gaming/onboarding.ts");
const onboardingRoute = read("app/api/enterprise/[organizationId]/gaming/onboarding/route.ts");
const dashboardPage = read("app/enterprise-modules/GAMING_DASHBOARD/page.tsx");
const readinessUi = read("components/enterprise/gaming/gaming-commercial-readiness.tsx");
const readinessE2e = read("tests/e2e/issue-646-gaming-commercial-readiness.spec.mjs");
const readiness = readJson("lib/enterprise/sector-onboarding-readiness.json");
const genericReadinessQa = read("scripts/qa-sector-onboarding-commercial-readiness.mjs");
const guideFr = read("docs/user-guides/GAMING_LOUNGE_FR.md");
const guideEn = read("docs/user-guides/GAMING_LOUNGE_EN.md");
const aiGaming = read("lib/ai/tools/executors/gaming.ts");
const aiContract = read("lib/ai/tools/erp-contract.ts");

includesAll(subtypeRegistry, [
  'sectorCode: "HOSPITALITY_EVENTS"',
  'code: "GAMING_LOUNGE"',
  'implementationStatus: "ACTIVE"',
], "Gaming subtype activation");
check(gamingRegistry.version >= 8, "Gaming registry version must be >= 8 for #646");
const expectedModules = [
  "GAMING_DASHBOARD", "GAMING_STATIONS", "GAMING_SESSIONS", "GAMING_BOOKINGS", "GAMING_PRICING_PACKAGES",
  "GAMING_CHECKOUT", "GAMING_DAILY_CLOSE", "GAMING_TOURNAMENTS", "GAMING_REPORTS",
];
for (const code of expectedModules) {
  const item = gamingRegistry.modules.find((candidate) => candidate.code === code);
  check(item?.implementationStatus === "ACTIVE", `${code} must be ACTIVE in final Gaming readiness`);
  check(item?.qaContract === "enterprise-gaming-lounge", `${code} must keep Gaming QA contract`);
  check(item?.minimumPlan === "BUSINESS", `${code} minimum plan must remain BUSINESS`);
  check(item?.applicableBusinessSubtypes?.includes("GAMING_LOUNGE"), `${code} subtype scope missing`);
}

includesAll(provisioning, [
  "syncGamingOnboardingProvisioning",
  "GAMING_MANAGER", "GAMING_OPERATOR_CASHIER", "GAMING_TECHNICIAN", "GAMING_FINANCE_ACCOUNTANT",
  "GAMING_REPORT_BREAKDOWN", "GAMING_REQUEST_MAINTENANCE", "GAMING_CASH_VARIANCE", "GAMING_PRICING_EXCEPTION", "GAMING_SERVICE_REPORT",
  'targetModuleCode: "ASSETS_MAINTENANCE"',
  'targetModuleCode: "GAMING_DAILY_CLOSE"',
  'targetModuleCode: "GAMING_PRICING_PACKAGES"',
  'targetModuleCode: "GAMING_REPORTS"',
  "enterpriseModule.upsert", "enterprisePosition.upsert", "enterpriseActivityBlock.upsert", "enterpriseGamingConfiguration.upsert",
], "Gaming canonical provisioning");
check(!provisioning.includes("GamingCustomer"), "Provisioning must not create a Gaming customer master");
check(!provisioning.includes("GamingPayment"), "Provisioning must not create a Gaming payment master");
includesAll(templateApplication, ["syncGamingOnboardingProvisioning", "gamingProvisioning", "resolvedBusinessSubtypeCode"], "sector template Gaming provisioning");
includesAll(organizationCreate, ["GAMING_BUSINESS_SUBTYPE_CODE", "requiresCanonicalSectorTemplate", "applyCanonicalSectorTemplateToOrganization", "sectorTemplateForcedBySubtype"], "DTSC Gaming organization creation");

includesAll(templatePreview, ["ERP_COMMON", "HOSPITALITY_EVENTS", "GAMING_LOUNGE", "GAMING_MODULE_CODES", "getEnterpriseModuleDefinition"], "three-layer Gaming preview");
includesAll(adminPreviewRoute, ["buildGamingTemplateLayers", "gamingLayerSummaryModules", "businessSubtypeCode"], "Admin DTSC Gaming preview route");
check(!templatePreview.includes("organizationId"), "Admin template preview must not read tenant private data");

includesAll(onboarding, [
  "GAMING_ONBOARDING_STEPS",
  '"IDENTITY_SITE"', '"STATIONS_ASSETS"', '"TEAM_PERMISSIONS"', '"CATALOG_SERVICES"', '"PRICING"', '"FINANCE_PAYMENTS"', '"OPERATIONS"', '"CLOSE_REPORTING_AI"',
  "enterpriseSite.findMany", "enterpriseGamingStationProfile.findMany", "enterpriseAsset.count", "organizationMember.count", "enterprisePosition.count", "enterpriseCatalogItem.count", "enterpriseGamingPricingRule.count", "enterpriseFinancialAccount.count", "resolveEnterpriseFinanceReadiness", "enterpriseModule.findMany",
  "stationProfiles.length >= 5", "canonicalAssetCount", "Prisma.TransactionIsolationLevel.Serializable", "GAMING_ONBOARDING_REVISION_CONFLICT",
], "Gaming self-service onboarding");
for (const forbidden of ["enterpriseSite.create", "enterpriseAsset.create", "enterpriseCatalogItem.create", "enterpriseFinancialAccount.create", "enterpriseBusinessParty.create", "enterprisePayment.create"]) {
  check(!onboarding.includes(forbidden), `Onboarding must not create common ERP source: ${forbidden}`);
}
includesAll(onboardingRoute, ["getEnterpriseGamingDashboardAccess", "ENTERPRISE_ADMIN_ROLES", "isSameOriginRequest", "rateLimit", "gamingOnboardingSelectionSchema", "writeAuditLog", "writeApiLog"], "Gaming onboarding API security");
includesAll(dashboardPage, ["GamingCommercialReadiness", "EnterpriseGamingDashboardWorkspace", "resolveEnterpriseModuleCapabilities"], "Gaming dashboard setup composition");
includesAll(readinessUi, [
  'data-testid="gaming-commercial-readiness"',
  "GAMING_MANAGER", "GAMING_OPERATOR_CASHIER", "GAMING_TECHNICIAN", "GAMING_FINANCE_ACCOUNTANT",
  "/gaming/onboarding", "useAppLocale", "Save and recheck", "Enregistrer et revérifier",
], "Gaming bilingual readiness UI");
includesAll(readinessE2e, [
  "[320, 360, 375, 390, 414]",
  'colorScheme: "dark"',
  'data-testid="gaming-commercial-readiness"',
  "scrollWidth - document.documentElement.clientWidth",
  "1440",
], "Gaming responsive browser acceptance");

const gamingProfile = readiness.profiles.find((profile) => profile.businessProfileCode === "GAMING_LOUNGE");
check(readiness.version >= 6, "Sector onboarding readiness version must include subtype-aware commercialization");
check(gamingProfile?.scope === "BUSINESS_SUBTYPE", "Gaming readiness must be scoped as BUSINESS_SUBTYPE");
check(gamingProfile?.sectorCode === "HOSPITALITY_EVENTS", "Gaming readiness sector mismatch");
check(gamingProfile?.businessSubtypeCode === "GAMING_LOUNGE", "Gaming readiness subtype mismatch");
check(gamingProfile?.runtimeProvisioningFile === "lib/enterprise/gaming/provisioning.ts", "Gaming readiness provisioning file missing");
check(gamingProfile?.runtimeProvisioningMarker === "syncGamingOnboardingProvisioning", "Gaming readiness provisioning marker missing");
check(gamingProfile?.dedicatedQaFile === "scripts/qa-646-gaming-commercial-readiness.mjs", "Gaming readiness dedicated QA binding missing");
check(gamingProfile?.commercializationStatus === "COMMERCIAL_READY", "Gaming target commercialization status must be COMMERCIAL_READY");
check(gamingProfile?.enforce === true, "Gaming readiness must be enforced");
check(gamingProfile?.minimumOperationalPlan === "BUSINESS", "Gaming minimum plan must be BUSINESS");
for (const code of expectedModules) check(gamingProfile?.requiredOperationalModules?.includes(code), `Gaming readiness missing operational module ${code}`);
for (const position of ["GAMING_MANAGER", "GAMING_OPERATOR_CASHIER", "GAMING_TECHNICIAN", "GAMING_FINANCE_ACCOUNTANT"]) check(gamingProfile?.requiredPositions?.includes(position), `Gaming readiness missing position ${position}`);
check(gamingProfile?.requiredGuideCodes?.includes("GAMING_LOUNGE_FR"), "Gaming FR guide code missing");
check(gamingProfile?.requiredGuideCodes?.includes("GAMING_LOUNGE_EN"), "Gaming EN guide code missing");
check(String(gamingProfile?.commercialReadyPromotionRule || "").includes("OWNER_E2E"), "Gaming COMMERCIAL_READY promotion must require OWNER_E2E");
check(String(gamingProfile?.commercialReadyPromotionRule || "").includes("exact final head"), "Gaming COMMERCIAL_READY promotion must bind to exact final head");
includesAll(genericReadinessQa, [
  'profile.scope === "BUSINESS_SUBTYPE"',
  'profileScope(profile) === "SECTOR_TEMPLATE"',
  "activeBusinessSubtypePairs",
  "runtimeProvisioningMarker",
  "dedicatedQaFile",
  "moduleAllowsBusinessSubtype",
], "subtype-aware generic commercial readiness gate");

includesAll(guideFr, ["DTSC", "Gaming Lounge", "5", "Actifs", "Finance", "DTSC AI", "OWNER_E2E", "320/360/375/390/414"], "Gaming guide FR");
includesAll(guideEn, ["DTSC", "Gaming Lounge", "5", "Assets", "Finance", "DTSC AI", "OWNER_E2E", "320/360/375/390/414"], "Gaming guide EN");
includesAll(aiContract, ["ERP_GAMING_PERFORMANCE_READ"], "Gaming AI contract retained");
includesAll(aiGaming, ["FACTUAL_OBSERVATIONS_ONLY_NO_CAUSAL_INFERENCE", "financialByCurrency", "getEnterpriseGamingDashboardAccess"], "Gaming AI boundaries retained");
check(!aiGaming.includes("create("), "Gaming AI must remain read-only at commercial readiness");

if (errors.length) {
  console.error(`FAIL QA #646 (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("PASS QA #646 Gaming onboarding and commercial readiness");
