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
const service = read("lib/enterprise/gaming/stations.ts");
const collectionRoute = read("app/api/enterprise/[organizationId]/gaming/stations/route.ts");
const candidateRoute = read("app/api/enterprise/[organizationId]/gaming/stations/candidates/route.ts");
const stationRoute = read("app/api/enterprise/[organizationId]/gaming/stations/[stationId]/route.ts");
const page = read("app/enterprise-modules/GAMING_STATIONS/page.tsx");
const workspace = read("components/enterprise/gaming/enterprise-gaming-stations-workspace.tsx");
const copy = read("components/enterprise/gaming/gaming-stations-i18n.ts");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regression = read("scripts/qa-regression-checks.mjs");

const stations = registry.modules.find((item) => item.code === "GAMING_STATIONS");
check(stations?.implementationStatus === "BETA", "GAMING_STATIONS must be BETA");
check(stations?.routeKind === "DEDICATED_CORE", "GAMING_STATIONS must use DEDICATED_CORE");
check(stations?.routePath === "/enterprise-modules/GAMING_STATIONS", "GAMING_STATIONS route path missing");
check(stations?.workspaceKey === "ENTERPRISE_GAMING_STATIONS", "GAMING_STATIONS workspace key missing");
check(stations?.accessPolicy === "POSITION_PERMISSION", "GAMING_STATIONS must use position permissions");
check(stations?.dependencies?.includes("ASSETS_MAINTENANCE"), "GAMING_STATIONS must depend on ASSETS_MAINTENANCE");
check(stations?.dependencies?.includes("SITES_WAREHOUSES"), "GAMING_STATIONS must depend on SITES_WAREHOUSES");
for (const item of registry.modules.filter((item) => item.code !== "GAMING_STATIONS")) {
  check(item.implementationStatus === "PLANNED", `${item.code} must remain PLANNED in #640`);
  check(item.routeKind === "HIDDEN", `${item.code} must remain HIDDEN in #640`);
  check(item.accessPolicy === "EXPLICIT_DENY", `${item.code} must remain fail-closed in #640`);
}

includesAll(domain, [
  "GAMING_STATION_PERMISSIONS",
  '"enterprise.gaming.stations.read"',
  '"enterprise.gaming.stations.create"',
  '"enterprise.gaming.stations.update"',
  '"enterprise.gaming.stations.manage"',
], "station permission catalog");

includesAll(access, [
  "requireEnterpriseMembership",
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "GAMING_STATIONS"',
  "capabilities.canRead",
  "capabilities.canSubmit",
  "capabilities.canWrite",
  "capabilities.canManage",
], "station access contract");

includesAll(schemas, [
  "gamingStationCreateSchema",
  "gamingStationUpdateSchema",
  "assetId",
  "stationCode",
  "consoleFamily",
  "maxPlayers",
  'z.enum(["UPDATE", "SET_AVAILABLE", "BLOCK", "ARCHIVE"])',
  "revision",
], "station schemas");

includesAll(service, [
  'FROM "EnterpriseGamingStationProfile" g',
  'INNER JOIN "EnterpriseAsset" a',
  'FROM "EnterpriseAssetIncident" i',
  'FROM "EnterpriseAssetMaintenance" m',
  'a."organizationId" = g."organizationId"',
  "organizationId",
  "safePageSize",
  "LIMIT ${safePageSize}",
  "listGamingStationCandidates",
  'NOT EXISTS (\n          SELECT 1 FROM "EnterpriseGamingStationProfile"',
  "createGamingStation",
  "updateGamingStation",
  "GAMING_STATION_BLOCKED_BY_INCIDENT",
  "GAMING_STATION_BLOCKED_BY_MAINTENANCE",
  "GAMING_STATION_HAS_LIVE_SESSION",
  "GAMING_STATION_HAS_ACTIVE_BOOKING",
], "station service and canonical asset projection");

const capacitySources = [service, schemas, workspace, page].join("\n");
for (const forbidden of [
  /MAX_STATIONS\s*=\s*5/i,
  /MAX_PLAYSTATIONS\s*=\s*5/i,
  /slice\(\s*0\s*,\s*5\s*\)/i,
  /take\s*:\s*5\b/i,
  /length\s*[<>]=?\s*5\b/i,
]) {
  check(!forbidden.test(capacitySources), `station fleet must not contain a hard-coded five-station limit: ${forbidden}`);
}
check(!service.includes("Array.from({ length: 5"), "station service must not synthesize five fixed slots");
check(!workspace.includes("Array.from({ length: 5"), "station workspace must not synthesize five fixed slots");

includesAll(collectionRoute, [
  "getSession",
  "getEnterpriseGamingStationAccess",
  'moduleCode: "ASSETS_MAINTENANCE"',
  "listGamingStations",
  "isSameOriginRequest",
  "gamingStationCreateSchema",
  "await rateLimit",
  "writeAuditLog",
  "writeApiLog",
], "station collection API");
includesAll(candidateRoute, [
  "getEnterpriseGamingStationAccess",
  'moduleCode: "ASSETS_MAINTENANCE"',
  "listGamingStationCandidates",
  "pageSize",
  "search",
  "writeApiLog",
], "station candidate API");
includesAll(stationRoute, [
  "isSameOriginRequest",
  "gamingStationUpdateSchema",
  "await rateLimit",
  'parsed.data.action === "ARCHIVE" ? "manage" : "write"',
  "updateGamingStation",
  "writeAuditLog",
  "writeApiLog",
], "station mutation API");

includesAll(page, [
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "GAMING_STATIONS"',
  "EnterpriseGamingStationsWorkspace",
  "capabilities.canRead",
  "AppShell",
], "station module route");

includesAll(workspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleMetrics",
  "ModuleToolbar",
  "BusinessList",
  "FullscreenEntityDetail",
  "ProfessionalTabs",
  "useProfessionalCollection",
  "/gaming/stations/candidates",
  "candidatePage",
  "collection.items.map",
  "collection.pagination.pageCount",
  "/assets/${incidentFor.asset.id}/incidents",
  "/enterprise-modules/ASSETS_MAINTENANCE",
  'action: "ARCHIVE"',
  'action: "BLOCK" | "SET_AVAILABLE"',
  'stationTransition(station, "BLOCK")',
  'stationTransition(station, "SET_AVAILABLE")',
  "action,\n        revision: station.revision",
  "useToastMessage",
], "station workspace UX");

includesAll(copy, [
  "fr:",
  "en:",
  "Une sixième console",
  "A sixth console",
  "sans limite fixe",
  "without a fixed limit",
], "station i18n and extensibility copy");

includesAll(docs, ["#640", "GAMING_STATIONS", "EnterpriseAsset"], "gaming architecture docs");
check(regression.includes('await import("./qa-640-gaming-stations-assets.mjs");'), "qa:regression must execute #640 Gaming Stations QA");

if (errors.length) {
  console.error("Gaming Stations #640 QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Gaming Stations #640 QA passed.");
