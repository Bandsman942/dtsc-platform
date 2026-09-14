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
const service = read("lib/enterprise/gaming/sessions.ts");
const http = read("lib/enterprise/gaming/http.ts");
const stationMutationRoute = read("app/api/enterprise/[organizationId]/gaming/stations/[stationId]/route.ts");
const collectionRoute = read("app/api/enterprise/[organizationId]/gaming/sessions/route.ts");
const sessionRoute = read("app/api/enterprise/[organizationId]/gaming/sessions/[sessionId]/route.ts");
const page = read("app/enterprise-modules/GAMING_SESSIONS/page.tsx");
const workspace = read("components/enterprise/gaming/enterprise-gaming-sessions-workspace.tsx");
const copy = read("components/enterprise/gaming/gaming-sessions-i18n.ts");
const prismaSchema = read("prisma/enterprise-gaming.prisma");
const foundationMigration = read("prisma/migrations/20260914163000_gaming_lounge_foundation/migration.sql");
const engineMigration = read("prisma/migrations/20260914185000_gaming_sessions_engine/migration.sql");
const projectionMigration = read("prisma/migrations/20260914190000_gaming_session_station_projection/migration.sql");
const guardMigration = read("prisma/migrations/20260914190500_gaming_station_live_guard/migration.sql");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regression = read("scripts/qa-regression-checks.mjs");

const sessions = registry.modules.find((item) => item.code === "GAMING_SESSIONS");
check(registry.version >= 3, "gaming registry version must include #641");
check(sessions?.implementationStatus === "BETA", "GAMING_SESSIONS must remain BETA after #641");
check(sessions?.routeKind === "DEDICATED_CORE", "GAMING_SESSIONS must use DEDICATED_CORE");
check(sessions?.routePath === "/enterprise-modules/GAMING_SESSIONS", "GAMING_SESSIONS route path missing");
check(sessions?.workspaceKey === "ENTERPRISE_GAMING_SESSIONS", "GAMING_SESSIONS workspace missing");
check(sessions?.accessPolicy === "POSITION_PERMISSION", "GAMING_SESSIONS must use position permissions");
check(sessions?.permissionPrefixes?.includes("enterprise.gaming.sessions."), "GAMING_SESSIONS permission prefix missing");
check(sessions?.dependencies?.includes("GAMING_STATIONS"), "GAMING_SESSIONS must depend on GAMING_STATIONS");
check(sessions?.dependencies?.includes("CATALOG"), "GAMING_SESSIONS must depend on CATALOG");
for (const code of ["GAMING_DASHBOARD", "GAMING_CHECKOUT", "GAMING_DAILY_CLOSE", "GAMING_TOURNAMENTS", "GAMING_REPORTS"]) {
  const item = registry.modules.find((module) => module.code === code);
  check(item?.implementationStatus === "PLANNED", `${code} must remain PLANNED until its own implementation lot`);
  check(item?.routeKind === "HIDDEN", `${code} PLANNED module must remain HIDDEN`);
  check(item?.accessPolicy === "EXPLICIT_DENY", `${code} PLANNED module must remain fail-closed`);
}

includesAll(domain, [
  "GAMING_SESSION_PERMISSIONS",
  '"enterprise.gaming.sessions.read"',
  '"enterprise.gaming.sessions.create"',
  '"enterprise.gaming.sessions.update"',
  '"enterprise.gaming.sessions.manage"',
  "GAMING_SESSION_ACTIONS",
  '"START"',
  '"PAUSE"',
  '"RESUME"',
  '"EXTEND"',
  '"TRANSFER"',
  '"END"',
], "session domain contract");

includesAll(access, [
  "requireEnterpriseMembership",
  "resolveEnterpriseModuleCapabilities",
  "getEnterpriseGamingSessionAccess",
  'moduleCode: "GAMING_SESSIONS"',
], "session access contract");

includesAll(schemas, [
  "gamingSessionStartSchema",
  "gamingSessionTransitionSchema",
  "idempotencyKey",
  "durationMinutes",
  "pauseBillable",
  'z.enum(["PAUSE", "RESUME", "EXTEND", "TRANSFER", "END"])',
  "extensionMinutes",
  "targetStationId",
  "revision",
], "session schemas");

includesAll(prismaSchema, [
  "model EnterpriseGamingSessionTransition",
  "pausedAt",
  "timingPolicyJson",
  "transitions          EnterpriseGamingSessionTransition[]",
  '@@unique([organizationId, idempotencyKey], map: "GamingSessionTransition_org_idempotency_key")',
], "session prisma persistence");
includesAll(foundationMigration, [
  'CREATE UNIQUE INDEX "GamingSession_one_live_per_station_key"',
  `WHERE "archivedAt" IS NULL AND "status" IN ('ACTIVE', 'PAUSED')`,
], "database double-occupation guard");
includesAll(engineMigration, [
  'ADD COLUMN "pausedAt"',
  'ADD COLUMN "timingPolicyJson"',
  'CREATE TABLE "EnterpriseGamingSessionTransition"',
  'GamingSessionTransition_org_idempotency_key',
  'EnterpriseGamingSession_paused_state_check',
  'FOREIGN KEY ("organizationId", "sessionId")',
], "session engine migration");
includesAll(projectionMigration, [
  'sync_gaming_station_occupation',
  "'IN_USE'",
  "'AVAILABLE'",
  "AFTER INSERT OR UPDATE OF \"stationId\", \"status\", \"archivedAt\"",
], "station occupancy projection migration");
includesAll(guardMigration, [
  'guard_gaming_station_live_session_status',
  "GAMING_STATION_HAS_LIVE_SESSION",
  "BEFORE UPDATE OF \"status\"",
  "s.\"status\" IN ('ACTIVE', 'PAUSED')",
], "station live-session guard migration");
for (const migration of [engineMigration, projectionMigration, guardMigration]) {
  check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "#641 migrations must remain additive");
}

includesAll(service, [
  "Prisma.TransactionIsolationLevel.Serializable",
  "assertStationReady",
  "organizationId",
  "enterpriseBusinessParty.findFirst",
  'roleCode: "CUSTOMER"',
  "enterpriseCatalogItem.findFirst",
  "GAMING_SESSION_CUSTOMER_NOT_FOUND",
  "GAMING_SESSION_CATALOG_ITEM_NOT_FOUND",
  "enterpriseGamingSessionTransition",
  "idempotencyKey",
  "GAMING_SESSION_IDEMPOTENCY_CONFLICT",
  "GAMING_SESSION_STATION_BUSY",
  'status: "ACTIVE"',
  'status: "PAUSED"',
  'status: "ENDED"',
  "pausedSeconds",
  "billableSeconds",
  "expectedEndAt",
  "pauseBillable",
  'error.code === "P2002"',
  "timingProjection",
  "serverNow",
], "transactional session service");
check(!service.includes("setInterval"), "server session service must not use a client timer");

includesAll(collectionRoute, [
  "getSession",
  "getEnterpriseGamingSessionAccess",
  "getEnterpriseGamingStationAccess",
  'moduleCode: "CATALOG"',
  'moduleCode: "CRM_CUSTOMERS"',
  "gamingSessionStartSchema",
  "startGamingSession",
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
  "writeApiLog",
], "session collection API");
includesAll(sessionRoute, [
  "getEnterpriseGamingSessionAccess",
  "getEnterpriseGamingStationAccess",
  "gamingSessionTransitionSchema",
  "transitionGamingSession",
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
  "writeApiLog",
], "session transition API");
includesAll(stationMutationRoute, [
  'parsed.data.action === "BLOCK" || parsed.data.action === "SET_AVAILABLE"',
  'status: { in: ["ACTIVE", "PAUSED"] }',
  'GAMING_STATION_HAS_LIVE_SESSION',
], "station mutation live-session protection");

includesAll(page, [
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "GAMING_SESSIONS"',
  "EnterpriseGamingSessionsWorkspace",
  "capabilities.canRead",
  "AppShell",
], "session module route");
includesAll(workspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleMetrics",
  "ModuleToolbar",
  "BusinessList",
  "FullscreenEntityDetail",
  "ProfessionalTabs",
  "useProfessionalCollection",
  "/gaming/sessions",
  "newCommandKey",
  "globalThis.crypto.randomUUID()",
  'action: "EXTEND"',
  'action: "TRANSFER"',
  'action: "END"',
  'transition(item, "PAUSE")',
  'transition(item, "RESUME")',
  "serverAuthorityDescription",
  "30_000",
  "1_000",
], "sessions workspace UX");
check(!/MAX_STATIONS\s*=\s*5/i.test(workspace), "sessions workspace must not reintroduce a five-station limit");
check(!workspace.includes("Array.from({ length: 5"), "sessions workspace must not synthesize five station slots");

includesAll(copy, ["fr:", "en:", "Chronométrage", "Server timing", "Le navigateur n’est jamais l’autorité", "browser is never the timer authority"], "sessions i18n server-authority copy");
includesAll(http, ["gamingSessionErrorResponse", "GAMING_SESSION_STATION_BUSY", "GAMING_SESSION_TERMINAL", "GAMING_SESSION_IDEMPOTENCY_CONFLICT"], "specific session errors");
includesAll(docs, ["#641", "GAMING_SESSIONS", "EnterpriseGamingSessionTransition", "idempot", "timestamps serveur", "IN_USE"], "gaming sessions documentation");
check(regression.includes('await import("./qa-641-gaming-sessions-engine.mjs");'), "qa:regression must execute #641 Gaming Sessions QA");

if (errors.length) {
  console.error("Gaming Sessions #641 QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Gaming Sessions #641 QA passed.");
