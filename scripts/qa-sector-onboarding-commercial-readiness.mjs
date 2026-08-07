import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const prisma = new PrismaClient();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const manifest = JSON.parse(read("lib/enterprise/sector-onboarding-readiness.json"));
const failures = [];
const warnings = [];
const results = [];
const check = (condition, message, hard = true) => {
  if (condition) return;
  (hard ? failures : warnings).push(message);
};

function canonicalModuleCodes() {
  const directory = path.join(root, "lib/enterprise");
  const codes = new Set();
  for (const name of fs.readdirSync(directory).filter((name) => /^module-registry.*\.json$/.test(name))) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
      if (Array.isArray(parsed.modules)) for (const definition of parsed.modules) if (definition?.code) codes.add(definition.code);
    } catch {
      // Invalid JSON is already caught by build/type gates; ignore non-registry shapes here.
    }
  }
  return codes;
}

function staticShopReleaseChecks() {
  const provisioning = read("lib/enterprise/retail/provisioning.ts");
  const constants = read("lib/enterprise/retail/constants.ts");
  const guardrails = read("lib/enterprise/retail/commercial-guardrails.ts");
  const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
  const dashboardRoute = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
  const salesRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
  const mobileRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/route.ts");
  const telcoRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/route.ts");
  const workspace = read("components/enterprise/professional/enterprise-retail-shop-workspace.tsx");
  const adminPanels = read("components/enterprise/enterprise-admin-panels.tsx");
  const guides = read("lib/user-guides/retail-telco-mobile-money-guides.ts");
  const migration = read("prisma/migrations/20260807090000_shop_release_candidate_1/migration.sql");
  const templateApplication = read("lib/enterprise/sector-template-application.ts");
  const http = read("lib/enterprise/retail/http.ts");
  const schemas = read("lib/enterprise/retail/schemas.ts");
  const currency = read("lib/enterprise/accounting/currency.ts");
  const fxService = read("lib/enterprise/accounting/exchange-rate-service.ts");
  const fxSchemas = read("lib/enterprise/accounting/exchange-rate-schemas.ts");
  const fxRoute = read("app/api/enterprise/[organizationId]/exchange-rates/route.ts");
  const fxDeactivateRoute = read("app/api/enterprise/[organizationId]/exchange-rates/[rateId]/route.ts");
  const fxWorkspace = read("components/enterprise/professional/enterprise-exchange-rates-workspace.tsx");
  const fxReporting = read("lib/enterprise/retail/fx-reporting.ts");
  const consolidatedReport = read("app/enterprise-modules/RETAIL_POS/consolidated-report/page.tsx");
  const financeModulePage = read("components/enterprise/enterprise-finance-module-page.tsx");
  const onboardingDoc = read("docs/SHOP_ONBOARDING.md");
  const fxDoc = read("docs/ENTERPRISE_EXCHANGE_RATES.md");

  const checks = [
    [workspace.includes("setCart") && workspace.includes("cart.map") && workspace.includes("Basket"), "MULTI_ITEM_POS"],
    [guardrails.includes("prepareCommercialRetailSale") && guardrails.includes("RETAIL_PRICE_OVERRIDE_FORBIDDEN") && salesRoute.includes("prepareCommercialRetailSale"), "SERVER_PRICE_GUARD"],
    [provisioning.includes('providerCode: "MPESA"') && provisioning.includes('providerType: "MOBILE_MONEY"') && provisioning.includes('providerCode: "VODACOM"') && provisioning.includes('providerType: "TELCO"'), "WALLET_NETWORK_SEPARATION"],
    [migration.includes("EnterpriseMobileMoneyTransaction_rc1_external_ref_key") && migration.includes("EnterpriseTelcoTopup_rc1_external_ref_key") && mobileRoute.includes("prepareCommercialMobileMoney") && telcoRoute.includes("prepareCommercialTelcoTopup"), "UNIQUE_PROVIDER_REFERENCE"],
    [guardrails.includes("normalizeRetailPhone") && workspace.includes("normalizePhonePreview") && workspace.includes("ConfirmationCard"), "PHONE_NORMALIZATION_AND_CONFIRMATION"],
    [workspace.includes("floatAccountId: null") && workspace.includes("operatorFloatAccountId: null") && workspace.includes("dashboard.cashSession") && guardrails.includes("floatAccountId: null") && guardrails.includes("operatorFloatAccountId: null"), "AUTOMATIC_CASH_AND_FLOAT_RESOLUTION"],
    [workspace.includes("CashSessionBar") && workspace.includes("No active till") && workspace.includes("Fonds d’ouverture"), "VISIBLE_CASH_SESSION"],
    [adminPanels.includes("RETAIL_PERMISSION_CATALOG") && adminPanels.includes('sectorCode === "COMMERCE_RETAIL"') && constants.includes("enterprise.purchases.manage"), "RETAIL_RBAC_CATALOG"],
    [guardrails.includes("getRetailMetricsByCurrency") && dashboard.includes("metricsByCurrency") && dashboardRoute.includes("getCommercialRetailDashboard") && !dashboardRoute.includes("getRetailDashboard("), "MULTI_CURRENCY_REPORTING"],
    [dashboard.includes("readyForFirstSale") && dashboard.includes('code: "FX"') && workspace.includes("ShopReadiness") && workspace.includes("Mise en service du Shop"), "ONBOARDING_READINESS_CHECKLIST"],
    [currency.includes("resolveExchangeRateDetails") && currency.includes('direction: "INVERSE"') && currency.includes("snapshotExchangeRate") && fxService.includes("createEnterpriseExchangeRate") && fxService.includes("deactivateEnterpriseExchangeRate") && fxSchemas.includes("CENTRAL_BANK") && fxRoute.includes("authorizeFinanceRequest") && fxDeactivateRoute.includes("writeAuditLog") && financeModulePage.includes("FINANCE_TREASURY/exchange-rates") && fxWorkspace.includes("1 {rate.sourceCurrencyCode}"), "FX_RATE_GOVERNANCE"],
    [fxReporting.includes("getRetailFunctionalCurrencySummary") && fxReporting.includes("resolveFromTimeline") && fxReporting.includes("missingRates") && fxReporting.includes("presentationCurrencyCode") && consolidatedReport.includes("ratesUsed") && consolidatedReport.includes("INCOMPLETE"), "HISTORICAL_FX_CONSOLIDATION"],
    [exists("docs/SHOP_ONBOARDING.md") && onboardingDoc.includes("STARTER — Shop Essentials") && onboardingDoc.includes("BUSINESS — Shop Operations") && onboardingDoc.includes("ENTERPRISE — Shop Scale") && onboardingDoc.includes("Taux de change") && guides.includes("Guide d’onboarding Shop") && guides.includes("Consolidation multi-devise") && fxDoc.includes("Gouvernance des taux de change"), "IN_APP_ONBOARDING_GUIDE"],
  ];
  for (const [ok, code] of checks) check(Boolean(ok), `COMMERCE_RETAIL release criterion failed: ${code}`);

  for (const marker of ["getSession", "rateLimit", "isSameOriginRequest", "getEnterpriseCommonDomainAccess"]) check(http.includes(marker), `Shop secure mutation contract missing ${marker}`);
  check(schemas.includes("idempotencyKey"), "Shop writes must remain idempotent");
  check(workspace.includes("stableKey") && workspace.includes("busyAction"), "Shop UI must preserve an idempotency key and disable repeated submission while busy");
  check(workspace.includes("min-w-0") && workspace.includes("grid-cols-[minmax(0,1fr)]"), "Shop UI must preserve the mobile-first responsive contract");
  check(templateApplication.includes("syncRetailOnboardingProvisioning"), "Shop template application must provision the Retail profile at runtime");
  for (const code of ["RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"]) check(guides.includes(`${code}:`), `Shop user guide missing ${code}`);
  check(guides.includes("Vodacom") && guides.includes("M-Pesa"), "Shop guides must distinguish telecom networks from Mobile Money wallets");
  check(exists("docs/SECTOR_ONBOARDING_COMMERCIAL_READINESS.md"), "Generic sector onboarding commercialization contract documentation is missing");
}

try {
  const registryCodes = canonicalModuleCodes();
  const activeTemplates = await prisma.$queryRawUnsafe(`
    SELECT t."id", t."version", t."label", s."code" AS "sectorCode", s."isActive" AS "sectorActive"
    FROM "SectorTemplate" t
    JOIN "BusinessSector" s ON s."id" = t."sectorId"
    WHERE t."isActive" = true
    ORDER BY s."code", t."version" DESC
  `);
  await prisma.enterpriseExchangeRate.count();
  await prisma.enterpriseExchangeRateSnapshot.count();

  for (const template of activeTemplates) {
    const declaration = manifest.profiles.find((profile) => profile.sectorCode === template.sectorCode && Number(profile.templateVersion) === Number(template.version));
    const hard = Boolean(declaration?.enforce || declaration?.commercializationStatus === "COMMERCIAL_READY");
    const [modules, departments, positions] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT "moduleCode", "requiresPlanLevel", "defaultEnabled" FROM "SectorTemplateModule" WHERE "templateId" = $1 ORDER BY "sortOrder"`, template.id),
      prisma.$queryRawUnsafe(`SELECT "departmentCode" FROM "SectorTemplateDepartment" WHERE "templateId" = $1 ORDER BY "sortOrder"`, template.id),
      prisma.$queryRawUnsafe(`SELECT "positionCode", "defaultPermissionsJson", "isKeyPosition" FROM "SectorTemplatePosition" WHERE "templateId" = $1 ORDER BY "sortOrder"`, template.id),
    ]);
    const localIssues = [];
    const assess = (condition, message) => { if (!condition) localIssues.push(message); };
    assess(Boolean(template.sectorActive), "sector inactive");
    assess(modules.length > 0, "no modules");
    assess(departments.length > 0, "no departments");
    assess(positions.length > 0, "no positions");
    for (const module of modules) {
      assess(registryCodes.has(module.moduleCode), `module not in canonical registry: ${module.moduleCode}`);
      assess([null, "STARTER", "BUSINESS", "ENTERPRISE"].includes(module.requiresPlanLevel), `invalid plan requirement: ${module.moduleCode}=${module.requiresPlanLevel}`);
    }
    for (const position of positions.filter((position) => position.isKeyPosition)) {
      const permissions = Array.isArray(position.defaultPermissionsJson) ? position.defaultPermissionsJson : [];
      assess(permissions.length > 0, `key position without permissions: ${position.positionCode}`);
    }
    if (declaration) {
      const moduleCodes = new Set(modules.map((item) => item.moduleCode));
      const departmentCodes = new Set(departments.map((item) => item.departmentCode));
      const positionCodes = new Set(positions.map((item) => item.positionCode));
      for (const code of declaration.requiredModules || []) assess(moduleCodes.has(code), `required module missing: ${code}`);
      for (const code of declaration.requiredDepartments || []) assess(departmentCodes.has(code), `required department missing: ${code}`);
      for (const code of declaration.requiredPositions || []) assess(positionCodes.has(code), `required position missing: ${code}`);
      for (const code of declaration.requiredOperationalModules || []) {
        const module = modules.find((item) => item.moduleCode === code);
        assess(Boolean(module), `operational module missing: ${code}`);
        assess(module?.requiresPlanLevel === declaration.minimumOperationalPlan, `${code} must require ${declaration.minimumOperationalPlan}`);
      }
    }
    results.push({ sectorCode: template.sectorCode, templateVersion: Number(template.version), declaredStatus: declaration?.commercializationStatus || "NOT_DECLARED", enforced: hard, issues: localIssues });
    for (const issue of localIssues) check(false, `${template.sectorCode} v${template.version}: ${issue}`, hard);
    if (!declaration) warnings.push(`${template.sectorCode} v${template.version}: active template is structurally checked but not declared for commercialization.`);
  }

  const shop = manifest.profiles.find((profile) => profile.sectorCode === "COMMERCE_RETAIL" && profile.enforce);
  check(Boolean(shop), "COMMERCE_RETAIL must have an enforced commercialization declaration while Shop is the product priority.");
  check(shop?.commercializationStatus === "COMMERCIAL_READY", "COMMERCE_RETAIL must remain COMMERCIAL_READY after explicit owner acceptance.");
  staticShopReleaseChecks();
} catch (error) {
  failures.push(`Readiness QA execution failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}

console.log("\nDTSC sector onboarding commercial-readiness report");
for (const result of results) console.log(`- ${result.sectorCode} v${result.templateVersion}: ${result.enforced ? "ENFORCED" : "OBSERVED"} · ${result.declaredStatus} · ${result.issues.length ? `${result.issues.length} issue(s)` : "structural checks OK"}`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length) {
  console.error("\nSector onboarding commercial-readiness QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nSector onboarding commercial-readiness QA passed. COMMERCE_RETAIL satisfies the enforced COMMERCIAL_READY onboarding contract.");
