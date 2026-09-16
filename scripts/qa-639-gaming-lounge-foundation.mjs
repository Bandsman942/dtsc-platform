import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));

const subtypeRegistry = read("lib/enterprise/business-subtype-registry.ts");
const moduleRegistry = read("lib/enterprise/module-registry.ts");
const moduleOrder = read("lib/enterprise/module-order.ts");
const gamingDomain = read("lib/enterprise/gaming/domain.ts");
const gamingRegistry = readJson("lib/enterprise/module-registry-gaming.json");
const canonicalRegistries = [
  readJson("lib/enterprise/module-registry-data.json"),
  readJson("lib/enterprise/module-registry-common-domains.json"),
  readJson("lib/enterprise/module-registry-finance.json"),
  readJson("lib/enterprise/module-registry-manufacturing.json"),
  readJson("lib/enterprise/module-registry-tailoring.json"),
  readJson("lib/enterprise/module-registry-retail.json"),
];
const prismaSchema = read("prisma/enterprise-gaming.prisma");
const migration = read("prisma/migrations/20260914163000_gaming_lounge_foundation/migration.sql");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regressionAdapter = read("scripts/qa-regression-checks.mjs");

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const includesAll = (content, markers, label) => {
  for (const marker of markers) check(content.includes(marker), `${label}: missing ${marker}`);
};

includesAll(subtypeRegistry, ['"GAMING_LOUNGE"', 'sectorCode: "HOSPITALITY_EVENTS"'], "Gaming business subtype");
check(/code:\s*"GAMING_LOUNGE"[\s\S]*?implementationStatus:\s*"(?:PLANNED|ACTIVE)"/.test(subtypeRegistry), "Gaming subtype must stay registered and may be ACTIVE only after the final readiness iteration");
includesAll(gamingDomain, [
  'GAMING_SECTOR_CODE = "HOSPITALITY_EVENTS"',
  'GAMING_BUSINESS_SUBTYPE_CODE = "GAMING_LOUNGE"',
  "isGamingLoungeSubtype",
  "GAMING_STATION_PERMISSIONS",
  "GAMING_STATION_STATUSES",
  "GAMING_SESSION_STATUSES",
  "GAMING_BOOKING_STATUSES",
  "GAMING_PRICING_MODES",
], "gaming domain constants");
includesAll(moduleRegistry, ['module-registry-gaming.json', '"SECTOR_HOSPITALITY"', "...gamingRegistryData.modules", "gamingRegistryData.version"], "canonical module registry integration");
check(moduleOrder.includes("SECTOR_HOSPITALITY: 70"), "SECTOR_HOSPITALITY must have a typed canonical navigation order");

const expectedModules = [
  "GAMING_DASHBOARD",
  "GAMING_STATIONS",
  "GAMING_SESSIONS",
  "GAMING_BOOKINGS",
  "GAMING_PRICING_PACKAGES",
  "GAMING_CHECKOUT",
  "GAMING_DAILY_CLOSE",
  "GAMING_TOURNAMENTS",
  "GAMING_REPORTS",
];
const existingCodes = new Set(canonicalRegistries.flatMap((registry) => (registry.modules || []).map((item) => item.code)));
for (const code of expectedModules) check(!existingCodes.has(code), `gaming module code collides with an existing canonical module: ${code}`);
const allCodes = new Set([...existingCodes, ...expectedModules]);

check(gamingRegistry.version >= 2, "gaming module registry version must include the post-foundation station contract");
check(gamingRegistry.modules.length === expectedModules.length, "gaming module registry must contain exactly the foundation module set");
for (const code of expectedModules) {
  const definition = gamingRegistry.modules.find((item) => item.code === code);
  check(Boolean(definition), `gaming registry missing ${code}`);
  if (!definition) continue;

  if (code === "GAMING_STATIONS") {
    check(["BETA", "ACTIVE"].includes(definition.implementationStatus), "GAMING_STATIONS must remain implemented after #640/#646");
    check(definition.routePath === "/enterprise-modules/GAMING_STATIONS", "GAMING_STATIONS route path missing after #640");
    check(definition.workspaceKey === "ENTERPRISE_GAMING_STATIONS", "GAMING_STATIONS workspace key missing after #640");
  }

  if (definition.implementationStatus === "PLANNED") {
    check(definition.routeKind === "HIDDEN", `${code} PLANNED module must remain HIDDEN`);
    check(definition.workspaceKey === null, `${code} PLANNED module must remain without workspace`);
    check(definition.accessPolicy === "EXPLICIT_DENY", `${code} PLANNED module must remain fail-closed`);
  } else {
    check(["BETA", "ACTIVE"].includes(definition.implementationStatus), `${code} implemented status must be BETA or ACTIVE`);
    check(definition.routeKind === "DEDICATED_CORE", `${code} implemented module must use DEDICATED_CORE`);
    check(Boolean(definition.routePath), `${code} implemented module must define routePath`);
    check(Boolean(definition.workspaceKey), `${code} implemented module must define workspaceKey`);
    check(definition.accessPolicy === "POSITION_PERMISSION", `${code} implemented module must use POSITION_PERMISSION`);
  }

  check(definition.domain === "SECTOR_HOSPITALITY", `${code} must use SECTOR_HOSPITALITY`);
  check(definition.applicableSectors?.length === 1 && definition.applicableSectors[0] === "HOSPITALITY_EVENTS", `${code} sector scope invalid`);
  check(definition.applicableBusinessSubtypes?.length === 1 && definition.applicableBusinessSubtypes[0] === "GAMING_LOUNGE", `${code} subtype scope invalid`);
  check(definition.qaContract === "enterprise-gaming-lounge", `${code} QA contract missing`);
  for (const dependency of definition.dependencies || []) check(allCodes.has(dependency), `${code} references unknown canonical dependency ${dependency}`);
}

const gamingAdjacency = new Map(gamingRegistry.modules.map((definition) => [definition.code, (definition.dependencies || []).filter((dependency) => expectedModules.includes(dependency))]));
const visiting = new Set();
const visited = new Set();
function visit(code, stack = []) {
  if (visiting.has(code)) {
    errors.push(`gaming dependency cycle: ${[...stack, code].join(" -> ")}`);
    return;
  }
  if (visited.has(code)) return;
  visiting.add(code);
  for (const dependency of gamingAdjacency.get(code) || []) visit(dependency, [...stack, code]);
  visiting.delete(code);
  visited.add(code);
}
for (const code of expectedModules) visit(code);

includesAll(prismaSchema, [
  "model EnterpriseGamingConfiguration",
  "model EnterpriseGamingStationProfile",
  "model EnterpriseGamingBooking",
  "model EnterpriseGamingPricingRule",
  "model EnterpriseGamingSession",
  "organizationId",
  "assetId",
  "businessPartyId",
  "serviceCatalogItemId",
  "pricingSnapshotJson",
  "idempotencyKey",
  "revision",
], "gaming prisma foundation");
for (const forbiddenModel of ["model GamingAsset", "model GamingCustomer", "model GamingCatalog", "model GamingPayment", "model GamingCashAccount"]) {
  check(!prismaSchema.includes(forbiddenModel), `parallel source of truth forbidden: ${forbiddenModel}`);
}

includesAll(migration, [
  'CREATE TABLE "EnterpriseGamingConfiguration"',
  'CREATE TABLE "EnterpriseGamingStationProfile"',
  'CREATE TABLE "EnterpriseGamingBooking"',
  'CREATE TABLE "EnterpriseGamingPricingRule"',
  'CREATE TABLE "EnterpriseGamingSession"',
  'CREATE UNIQUE INDEX "GamingSession_one_live_per_station_key"',
  `WHERE "archivedAt" IS NULL AND "status" IN ('ACTIVE', 'PAUSED')`,
  'FOREIGN KEY ("organizationId", "stationId")',
], "additive gaming migration");
check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "Gaming Lounge migration must remain additive");

includesAll(docs, ["HOSPITALITY_EVENTS", "GAMING_LOUNGE", "EnterpriseAsset", "EnterpriseBusinessParty", "EnterpriseCatalogItem", "Finance", "PLANNED", "fail-closed", "timestamps serveur", "organizationId", "#639", "#640", "#646"], "gaming architecture documentation");
check(regressionAdapter.includes('await import("./qa-639-gaming-lounge-foundation.mjs");'), "qa:regression adapter must execute the Gaming Lounge foundation QA");

if (errors.length) {
  console.error("Gaming Lounge foundation QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Gaming Lounge foundation QA passed.");
