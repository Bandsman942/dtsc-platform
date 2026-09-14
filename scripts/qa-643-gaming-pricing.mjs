import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const includesAll = (content, markers, label) => {
  for (const marker of markers) check(content.includes(marker), `${label}: missing ${marker}`);
};

const registry = readJson("lib/enterprise/module-registry-gaming.json");
const domain = read("lib/enterprise/gaming/domain.ts");
const access = read("lib/enterprise/gaming/access.ts");
const schemas = read("lib/enterprise/gaming/schemas.ts");
const pricing = read("lib/enterprise/gaming/pricing.ts");
const sessions = read("lib/enterprise/gaming/sessions.ts");
const http = read("lib/enterprise/gaming/http.ts");
const pricingRoute = read("app/api/enterprise/[organizationId]/gaming/pricing/route.ts");
const pricingMutationRoute = read("app/api/enterprise/[organizationId]/gaming/pricing/[ruleId]/route.ts");
const simulationRoute = read("app/api/enterprise/[organizationId]/gaming/pricing/simulate/route.ts");
const sessionsRoute = read("app/api/enterprise/[organizationId]/gaming/sessions/route.ts");
const sessionMutationRoute = read("app/api/enterprise/[organizationId]/gaming/sessions/[sessionId]/route.ts");
const pricingPage = read("app/enterprise-modules/GAMING_PRICING_PACKAGES/page.tsx");
const pricingWorkspace = read("components/enterprise/gaming/enterprise-gaming-pricing-workspace.tsx");
const pricingCopy = read("components/enterprise/gaming/gaming-pricing-i18n.ts");
const sessionsWorkspace = read("components/enterprise/gaming/enterprise-gaming-sessions-workspace.tsx");
const sessionsCopy = read("components/enterprise/gaming/gaming-sessions-i18n.ts");
const prismaSchema = read("prisma/enterprise-gaming.prisma");
const foundationMigration = read("prisma/migrations/20260914163000_gaming_lounge_foundation/migration.sql");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regression = read("scripts/qa-regression-checks.mjs");

const module = registry.modules.find((item) => item.code === "GAMING_PRICING_PACKAGES");
check(registry.version >= 5, "gaming registry version must include #643");
check(module?.implementationStatus === "BETA", "GAMING_PRICING_PACKAGES must be BETA");
check(module?.routeKind === "DEDICATED_CORE", "GAMING_PRICING_PACKAGES must use DEDICATED_CORE");
check(module?.routePath === "/enterprise-modules/GAMING_PRICING_PACKAGES", "pricing route missing");
check(module?.workspaceKey === "ENTERPRISE_GAMING_PRICING_PACKAGES", "pricing workspace key missing");
check(module?.accessPolicy === "POSITION_PERMISSION", "pricing must use POSITION_PERMISSION");
check(module?.permissionPrefixes?.includes("enterprise.gaming.pricing."), "pricing permission prefix missing");
for (const dependency of ["CATALOG", "GAMING_STATIONS", "GAMING_SESSIONS"]) check(module?.dependencies?.includes(dependency), `pricing dependency missing ${dependency}`);
for (const code of ["GAMING_DASHBOARD", "GAMING_CHECKOUT", "GAMING_DAILY_CLOSE", "GAMING_TOURNAMENTS", "GAMING_REPORTS"]) {
  const item = registry.modules.find((candidate) => candidate.code === code);
  check(item?.implementationStatus === "PLANNED", `${code} must remain PLANNED after #643`);
  check(item?.routeKind === "HIDDEN", `${code} must remain HIDDEN after #643`);
  check(item?.accessPolicy === "EXPLICIT_DENY", `${code} must remain fail-closed after #643`);
}

includesAll(domain, [
  "GAMING_PRICING_PERMISSIONS",
  '"enterprise.gaming.pricing.read"',
  '"enterprise.gaming.pricing.create"',
  '"enterprise.gaming.pricing.update"',
  '"enterprise.gaming.pricing.manage"',
  "GAMING_PRICING_RULE_STATUSES",
  '"DRAFT"',
  '"ACTIVE"',
  '"INACTIVE"',
], "pricing domain contract");
includesAll(access, ["getEnterpriseGamingPricingAccess", 'moduleCode: "GAMING_PRICING_PACKAGES"'], "pricing access contract");
includesAll(schemas, [
  "gamingPricingRuleCreateSchema",
  "gamingPricingRuleUpdateSchema",
  "gamingPricingSimulationSchema",
  "FIXED_DURATION",
  "PER_MINUTE",
  "PER_HOUR",
  "PACKAGE",
  "dayOfWeekMask",
  "startMinuteOfDay",
  "endMinuteOfDay",
  "consoleFamily",
  "minPlayers",
  "maxPlayers",
  "priceOverrideAmount",
  "priceOverrideReason",
], "pricing schemas");

includesAll(prismaSchema, [
  "model EnterpriseGamingPricingRule",
  "serviceCatalogItemId",
  "pricingMode",
  "billingIncrementMinutes",
  "pricingSnapshotJson",
  "quotedAmount",
  "finalAmount",
], "pricing persistence foundation");
includesAll(foundationMigration, [
  'CREATE TABLE "EnterpriseGamingPricingRule"',
  'CREATE TABLE "EnterpriseGamingSession"',
  '"pricingSnapshotJson" JSONB',
  '"quotedAmount" DECIMAL(18,2)',
  '"finalAmount" DECIMAL(18,2)',
], "foundation pricing persistence");

includesAll(pricing, [
  "assertEnterpriseCurrencyActiveTx",
  "listEnterpriseCurrencies",
  "enterpriseCatalogItem.findFirst",
  'itemType !== "SERVICE"',
  "enterpriseGamingPricingRule.findMany",
  'status: "ACTIVE"',
  "localPricingParts",
  "matchesMinuteRange",
  "dayOfWeekMask",
  "specificity",
  "left.priority - right.priority",
  "quoteForDuration",
  "Prisma.Decimal.ROUND_HALF_UP",
  "resolveGamingPricingQuoteTx",
  "GamingPricingSnapshot",
  'authority: "SERVER"',
  "finalAmountFromGamingPricingSnapshot",
  "snapshot.overrideAmount",
  "simulateGamingPricing",
  "Prisma.TransactionIsolationLevel.Serializable",
], "server pricing engine");
check(!pricing.includes("enterpriseSale.create"), "pricing engine must not create a sale");
check(!pricing.includes("enterprisePayment.create"), "pricing engine must not create a payment");
check(!pricing.includes("treasury"), "pricing engine must not write a Gaming treasury path");
check(!pricing.includes("EnterpriseGamingCatalog"), "pricing must not create a parallel Gaming catalog");
check(!pricing.includes("EnterpriseGamingCurrency"), "pricing must not create a parallel currency registry");

includesAll(sessions, [
  "resolveGamingPricingQuoteTx",
  "serviceCatalogItemId",
  "pricingRuleId: pricing?.rule.id",
  "pricingSnapshotJson",
  "quotedAmount: pricing?.quotedAmount",
  "finalAmountFromGamingPricingSnapshot(session.pricingSnapshotJson, billableSeconds)",
  "finalAmount: finalPricing.amount",
  'pricingAuthority: finalPricing ? "SNAPSHOT" : null',
], "session pricing integration");
check(!sessions.includes("finalAmountFromGamingPricingRule"), "session END must not re-rate from the current pricing rule");

includesAll(pricingRoute, ["getEnterpriseGamingPricingAccess", 'moduleCode: "CATALOG"', "getEnterpriseGamingStationAccess", "gamingPricingRuleCreateSchema", "createGamingPricingRule", "listGamingPricingRules", "writeAuditLog", "writeApiLog", "await rateLimit", "isSameOriginRequest"], "pricing collection API");
includesAll(pricingMutationRoute, ["gamingPricingRuleUpdateSchema", 'parsed.data.action === "ACTIVATE"', 'parsed.data.action === "ARCHIVE"', 'action: privilegedAction ? "manage" : "write"', "updateGamingPricingRule", "writeAuditLog"], "pricing lifecycle API");
includesAll(simulationRoute, ["gamingPricingSimulationSchema", "simulateGamingPricing", "getEnterpriseGamingPricingAccess", "getEnterpriseGamingSessionAccess", "ENTERPRISE_GAMING_PRICING_OVERRIDE_SIMULATED", "writeApiLog"], "pricing simulation API");
includesAll(sessionsRoute, ["getEnterpriseGamingPricingAccess", "canOverridePricing", "priceOverrideAmount", "priceOverrideReason", "pricingRuleId", "quotedAmount"], "priced session start API");
includesAll(sessionMutationRoute, ["pricingRuleId", "quotedAmount", "finalAmount"], "session final pricing audit");

includesAll(pricingPage, ["resolveEnterpriseModuleCapabilities", 'moduleCode: "GAMING_PRICING_PACKAGES"', "EnterpriseGamingPricingWorkspace", "AppShell"], "pricing module page");
includesAll(pricingWorkspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleMetrics",
  "ModuleToolbar",
  "BusinessList",
  "FullscreenEntityDetail",
  "ProfessionalTabs",
  "useProfessionalCollection",
  "/gaming/pricing",
  "/gaming/pricing/simulate",
  "itemType=SERVICE",
  "/gaming/stations",
  "dayOfWeekMask",
  "consoleFamily",
  "minPlayers",
  "maxPlayers",
  'className="h-[92dvh]"',
], "pricing workspace UX");
includesAll(sessionsWorkspace, ["/gaming/pricing/simulate", "serviceCatalogItemId", "playerCount", "priceOverrideAmount", "priceOverrideReason", "quotedAmount", "finalAmount", "formatEnterpriseAmount"], "session price preview UX");
check(!/MAX_STATIONS\s*=\s*5/i.test(pricingWorkspace + sessionsWorkspace), "pricing/session UI must not impose a five-station limit");

includesAll(pricingCopy, ["Tarifs & forfaits Gaming", "Gaming pricing & packages", "Simulation tarifaire serveur", "Server pricing simulation"], "pricing FR EN copy");
includesAll(sessionsCopy, ["Aperçu tarifaire", "Pricing preview", "Montant final", "Final amount"], "sessions pricing FR EN copy");
includesAll(http, ["gamingPricingErrorResponse", "GAMING_PRICING_CURRENCY_INVALID", "GAMING_PRICING_OVERRIDE_FORBIDDEN", "GAMING_SESSION_PRICING_REQUIRED"], "pricing business errors");
includesAll(docs, ["#643", "GAMING_PRICING_PACKAGES", "EnterpriseCatalogItem", "snapshot", "devise", "simulation"], "gaming pricing documentation");
check(regression.includes('await import("./qa-643-gaming-pricing.mjs");'), "qa:regression must execute #643 Gaming Pricing QA");

if (errors.length) {
  console.error("Gaming Pricing #643 QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Gaming Pricing #643 QA passed.");
