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
const service = read("lib/enterprise/gaming/bookings.ts");
const http = read("lib/enterprise/gaming/http.ts");
const collectionRoute = read("app/api/enterprise/[organizationId]/gaming/bookings/route.ts");
const bookingRoute = read("app/api/enterprise/[organizationId]/gaming/bookings/[bookingId]/route.ts");
const page = read("app/enterprise-modules/GAMING_BOOKINGS/page.tsx");
const workspace = read("components/enterprise/gaming/enterprise-gaming-bookings-workspace.tsx");
const copy = read("components/enterprise/gaming/gaming-bookings-i18n.ts");
const prismaSchema = read("prisma/enterprise-gaming.prisma");
const engineMigration = read("prisma/migrations/20260914210000_gaming_bookings_engine/migration.sql");
const conflictMigration = read("prisma/migrations/20260914210500_gaming_booking_conflict_guard/migration.sql");
const docs = read("docs/ERP_GAMING_LOUNGE.md");
const regression = read("scripts/qa-regression-checks.mjs");

const bookings = registry.modules.find((item) => item.code === "GAMING_BOOKINGS");
check(registry.version >= 4, "gaming registry version must include #642");
check(bookings?.implementationStatus === "BETA", "GAMING_BOOKINGS must remain BETA after #642");
check(bookings?.routeKind === "DEDICATED_CORE", "GAMING_BOOKINGS must use DEDICATED_CORE");
check(bookings?.routePath === "/enterprise-modules/GAMING_BOOKINGS", "GAMING_BOOKINGS route missing");
check(bookings?.workspaceKey === "ENTERPRISE_GAMING_BOOKINGS", "GAMING_BOOKINGS workspace missing");
check(bookings?.accessPolicy === "POSITION_PERMISSION", "GAMING_BOOKINGS must use position permissions");
check(bookings?.permissionPrefixes?.includes("enterprise.gaming.bookings."), "GAMING_BOOKINGS permission prefix missing");
for (const dependency of ["GAMING_STATIONS", "GAMING_SESSIONS", "CRM_CUSTOMERS"]) {
  check(bookings?.dependencies?.includes(dependency), `GAMING_BOOKINGS dependency missing ${dependency}`);
}
for (const code of ["GAMING_DASHBOARD", "GAMING_TOURNAMENTS", "GAMING_REPORTS"]) {
  const item = registry.modules.find((module) => module.code === code);
  check(item?.implementationStatus === "PLANNED", `${code} must remain PLANNED until its own implementation lot`);
  check(item?.routeKind === "HIDDEN", `${code} PLANNED module must remain HIDDEN`);
  check(item?.accessPolicy === "EXPLICIT_DENY", `${code} PLANNED module must remain fail-closed`);
}

includesAll(domain, [
  "GAMING_BOOKING_PERMISSIONS",
  '"enterprise.gaming.bookings.read"',
  '"enterprise.gaming.bookings.create"',
  '"enterprise.gaming.bookings.update"',
  '"enterprise.gaming.bookings.manage"',
  "GAMING_BOOKING_ACTIONS",
  '"CREATE"',
  '"UPDATE"',
  '"CONFIRM"',
  '"CHECK_IN"',
  '"NO_SHOW"',
  '"CANCEL"',
  '"CONVERT"',
], "booking domain contract");
includesAll(access, ["getEnterpriseGamingBookingAccess", 'moduleCode: "GAMING_BOOKINGS"'], "booking access contract");
includesAll(schemas, [
  "gamingBookingCreateSchema",
  "gamingBookingTransitionSchema",
  "scheduledStartAt",
  "scheduledEndAt",
  "playerCount",
  "businessPartyId",
  "idempotencyKey",
  'z.enum(["UPDATE", "CONFIRM", "CHECK_IN", "NO_SHOW", "CANCEL", "CONVERT"])',
], "booking schemas");

includesAll(prismaSchema, [
  "model EnterpriseGamingBookingTransition",
  "confirmedAt",
  "checkedInAt",
  "noShowAt",
  "cancelledAt",
  "convertedAt",
  "transitions       EnterpriseGamingBookingTransition[]",
  '@@unique([organizationId, idempotencyKey], map: "GamingBookingTransition_org_idempotency_key")',
  '@@unique([organizationId, bookingId], map: "GamingSession_org_booking_key")',
], "booking persistence");
includesAll(engineMigration, [
  'ADD COLUMN "confirmedAt"',
  'ADD COLUMN "checkedInAt"',
  'CREATE TABLE "EnterpriseGamingBookingTransition"',
  'GamingBookingTransition_org_idempotency_key',
  'EnterpriseGamingBooking_schedule_check',
  'EnterpriseGamingBooking_player_count_check',
  'FOREIGN KEY ("organizationId", "bookingId")',
], "booking engine migration");
includesAll(conflictMigration, [
  "guard_gaming_booking_schedule_conflict",
  "pg_advisory_xact_lock",
  "GAMING_BOOKING_CONFLICT",
  "BEFORE INSERT OR UPDATE OF",
  "b.\"scheduledStartAt\" < NEW.\"scheduledEndAt\"",
  "b.\"scheduledEndAt\" > NEW.\"scheduledStartAt\"",
], "booking conflict migration");
for (const migration of [engineMigration, conflictMigration]) {
  check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "#642 migrations must remain additive");
}

includesAll(service, [
  "Prisma.TransactionIsolationLevel.Serializable",
  "lockBookingStations",
  "pg_advisory_xact_lock",
  "assertNoConflict",
  "scheduledStartAt: { lt: scheduledEndAt }",
  "scheduledEndAt: { gt: scheduledStartAt }",
  "enterpriseBusinessParty.findFirst",
  'roleCode: "CUSTOMER"',
  "enterpriseGamingBookingTransition",
  "GAMING_BOOKING_CONFLICT",
  "GAMING_BOOKING_IDEMPOTENCY_CONFLICT",
  "EnterpriseDomainConflictError",
  'booking.status !== "CHECKED_IN"',
  "enterpriseGamingSession.create",
  "bookingId: booking.id",
  "enterpriseGamingSessionTransition.create",
  'source: "BOOKING"',
  'status: "CONVERTED"',
  'error.code === "P2034"',
  'error.code === "P2002"',
], "transactional booking service");
check(!service.includes("EnterpriseGamingCustomer"), "booking service must not create a parallel customer model");
check(!service.includes("GamingPayment"), "booking service must not create a parallel payment model");

includesAll(collectionRoute, [
  "getEnterpriseGamingBookingAccess",
  "getEnterpriseGamingStationAccess",
  'moduleCode: "CRM_CUSTOMERS"',
  "gamingBookingCreateSchema",
  "createGamingBooking",
  "listGamingBookings",
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
  "writeApiLog",
], "booking collection API");
includesAll(bookingRoute, [
  "getEnterpriseGamingBookingAccess",
  "getEnterpriseGamingStationAccess",
  "getEnterpriseGamingSessionAccess",
  'moduleCode: "CRM_CUSTOMERS"',
  "gamingBookingTransitionSchema",
  "transitionGamingBooking",
  'parsed.data.action === "CONVERT"',
  "isSameOriginRequest",
  "await rateLimit",
  "writeAuditLog",
  "writeApiLog",
], "booking transition API");

includesAll(page, [
  "resolveEnterpriseModuleCapabilities",
  'moduleCode: "GAMING_BOOKINGS"',
  "EnterpriseGamingBookingsWorkspace",
  "capabilities.canRead",
  "AppShell",
], "booking module page");
includesAll(workspace, [
  "ModuleWorkspace",
  "ModuleHeader",
  "ModuleMetrics",
  "ModuleToolbar",
  "BusinessList",
  "FullscreenEntityDetail",
  "ProfessionalTabs",
  "useProfessionalCollection",
  "/gaming/bookings",
  "/business-parties",
  'role: "CUSTOMER"',
  'type ViewMode = "LIST" | "CALENDAR"',
  "calendarGroups",
  "globalThis.crypto.randomUUID()",
  'action: "UPDATE"',
  'kind: "CHECK_IN"',
  'kind: "CONVERT"',
  'kind: "NO_SHOW"',
  'kind: "CANCEL"',
  'className="h-[92dvh]"',
], "booking workspace UX");
check(!workspace.includes("createBusinessParty"), "booking workspace must reuse CRM instead of creating a parallel customer");
check(!/MAX_STATIONS\s*=\s*5/i.test(workspace), "booking workspace must not impose a five-station limit");

includesAll(copy, ["Réservations Gaming", "Gaming bookings", "Joueur occasionnel", "Walk-in player", "Calendrier", "Calendar"], "booking FR EN copy");
includesAll(http, ["gamingBookingErrorResponse", "GAMING_BOOKING_CONFLICT", "GAMING_BOOKING_CUSTOMER_NOT_FOUND", "GAMING_BOOKING_CONVERT_INVALID"], "specific booking errors");
includesAll(docs, ["#642", "GAMING_BOOKINGS", "EnterpriseGamingBookingTransition", "joueur occasionnel", "CRM", "conversion", "site", "actif"], "gaming booking documentation");
check(regression.includes('await import("./qa-642-gaming-bookings.mjs");'), "qa:regression must execute #642 Gaming Bookings QA");

if (errors.length) {
  console.error("Gaming Bookings #642 QA failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Gaming Bookings #642 QA passed.");
