import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const subtypeRegistry = read("lib/enterprise/business-subtype-registry.ts");
const moduleRegistry = read("lib/enterprise/module-registry.ts");
const moduleOrder = read("lib/enterprise/module-order.ts");
const gamingDomain = read("lib/enterprise/gaming/domain.ts");
const gamingRegistryRaw = read("lib/enterprise/module-registry-gaming.json");
const gamingRegistry = JSON.parse(gamingRegistryRaw);
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

includesAll(
  subtypeRegistry,
  [
    '"GAMING_LOUNGE"',
    'sectorCode: "HOSPITALITY_EVENTS"',
    'implementationStatus: "PLANNED"',
  ],
  "planned business subtype",
);

includesAll(
  gamingDomain,
  [
    'GAMING_SECTOR_CODE = "HOSPITALITY_EVENTS"',
    'GAMING_BUSINESS_SUBTYPE_CODE = "GAMING_LOUNGE"',
    "isGamingLoungeSubtype",
    "GAMING_STATION_STATUSES",
    "GAMING_SESSION_STATUSES",
    "GAMING_BOOKING_STATUSES",
    "GAMING_PRICING_MODES",
  ],
  "gaming domain constants",
);

includesAll(
  moduleRegistry,
  [
    'module-registry-gaming.json',
    '"SECTOR_HOSPITALITY"',
    "...gamingRegistryData.modules",
    "gamingRegistryData.version",
  ],
  "canonical module registry integration",
);
check(
  moduleOrder.includes("SECTOR_HOSPITALITY: 70"),
  "SECTOR_HOSPITALITY must have a typed canonical navigation order",
);

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

check(gamingRegistry.version === 1, "gaming module registry version must start at 1");
check(gamingRegistry.modules.length === expectedModules.length, "gaming module registry must contain exactly the foundation module set");
for (const code of expectedModules) {
  const definition = gamingRegistry.modules.find((item) => item.code === code);
  check(Boolean(definition), `gaming registry missing ${code}`);
  if (!definition) continue;
  check(definition.implementationStatus === "PLANNED", `${code} must remain PLANNED in #639`);
  check(definition.routeKind === "HIDDEN", `${code} must remain HIDDEN in #639`);
  check(definition.workspaceKey === null, `${code} must not have a workspace in #639`);
  check(definition.accessPolicy === "EXPLICIT_DENY", `${code} must fail closed in #639`);
  check(definition.domain === "SECTOR_HOSPITALITY", `${code} must use SECTOR_HOSPITALITY`);
  check(definition.applicableSectors?.length === 1 && definition.applicableSectors[0] === "HOSPITALITY_EVENTS", `${code} sector scope invalid`);
  check(definition.applicableBusinessSubtypes?.length === 1 && definition.applicableBusinessSubtypes[0] === "GAMING_LOUNGE", `${code} subtype scope invalid`);
  check(definition.qaContract === "enterprise-gaming-lounge", `${code} QA contract missing`);
}

includesAll(
  prismaSchema,
  [
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
  ],
  "gaming prisma foundation",
);

for (const forbiddenModel of [
  "model GamingAsset",
  "model GamingCustomer",
  "model GamingCatalog",
  "model GamingPayment",
  "model GamingCashAccount",
]) {
  check(!prismaSchema.includes(forbiddenModel), `parallel source of truth forbidden: ${forbiddenModel}`);
}

includesAll(
  migration,
  [
    'CREATE TABLE "EnterpriseGamingConfiguration"',
    'CREATE TABLE "EnterpriseGamingStationProfile"',
    'CREATE TABLE "EnterpriseGamingBooking"',
    'CREATE TABLE "EnterpriseGamingPricingRule"',
    'CREATE TABLE "EnterpriseGamingSession"',
    'CREATE UNIQUE INDEX "GamingSession_one_live_per_station_key"',
    `WHERE "archivedAt" IS NULL AND "status" IN ('ACTIVE', 'PAUSED')`,
    'FOREIGN KEY ("organizationId", "stationId")',
  ],
  "additive gaming migration",
);

includesAll(
  docs,
  [
    "HOSPITALITY_EVENTS -> GAMING_LOUNGE",
    "EnterpriseAsset",
    "EnterpriseBusinessParty",
    "EnterpriseCatalogItem",
    "Finance",
    "PLANNED",
    "fail-closed",
    "timestamps serveur",
    "organizationId",
    "#639",
    "#640",
    "#646",
  ],
  "gaming architecture documentation",
);

check(
  regressionAdapter.includes('await import("./qa-639-gaming-lounge-foundation.mjs");'),
  "qa:regression adapter must execute the Gaming Lounge foundation QA",
);

if (errors.length) {
  console.error("Gaming Lounge foundation QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Gaming Lounge foundation QA passed.");
