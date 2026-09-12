import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const projection = read("lib/enterprise/retail/commercial-dashboard-projections.ts");
const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
const route = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
const worker = read("lib/enterprise/workflows/worker.ts");
const cache = read("lib/scalability/tenant-read-cache.ts");
const observability = read("lib/scalability/production-observability.ts");
const ctoDashboard = read("components/admin/cto-scalability-dashboard.tsx");
const ctoLauncher = read("components/admin/cto-scalability-floating-action.tsx");
const adminSection = read("app/admin/[section]/page.tsx");
const regression = read("scripts/qa-regression-checks.mjs");
const docs = read("docs/SCALABILITY_SCALE5B_RETAIL_DASHBOARD_CACHE.md");

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
function requireTokens(label, source, tokens) {
  for (const token of tokens) check(source.includes(token), `${label}: token manquant ${token}`);
}
function section(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

requireTokens("projection", projection, [
  "withTenantReadCache",
  "invalidateTenantReadCache",
  "RETAIL_DASHBOARD_ORG_CACHE",
  "ttlSeconds: 60",
  "RETAIL_DASHBOARD_PERIOD_CACHE",
  "ttlSeconds: 15",
  "organizationProjectionName(moduleCode)",
  "periodProjectionName(moduleCode)",
  "cacheDefaultRange",
  'source: "BYPASS"',
  "getRetailDashboardUserProjection",
  "cashierUserId: userId",
  "Promise.allSettled(invalidations)",
  "RETAIL_ORGANIZATION_INVALIDATION_ENTITY_TYPES",
  "RETAIL_PERIOD_INVALIDATION_ENTITY_TYPES",
]);

const orgLoader = section(
  projection,
  "async function loadRetailDashboardOrganizationProjection",
  "export type RetailDashboardOrganizationProjection",
);
const periodLoader = section(
  projection,
  "async function loadRetailDashboardPeriodProjection",
  "export type RetailDashboardPeriodProjection",
);
const userLoader = section(
  projection,
  "export async function getRetailDashboardUserProjection",
  "export async function invalidateCommercialRetailDashboardCacheForDomainEvent",
);
check(!orgLoader.includes("userId"), "SCALE-5B: la projection organisation ne doit jamais dépendre d'un userId.");
check(!orgLoader.includes("enterpriseCashSession"), "SCALE-5B: la projection organisation ne doit jamais embarquer les sessions de caisse.");
check(!periodLoader.includes("userId"), "SCALE-5B: la projection période ne doit jamais dépendre d'un userId.");
check(!periodLoader.includes("enterpriseCashSession"), "SCALE-5B: la projection période ne doit jamais embarquer les sessions de caisse.");
check(!userLoader.includes("withTenantReadCache"), "SCALE-5B: l'état utilisateur/caisse doit rester hors cache partagé.");

requireTokens("dashboard composition", dashboard, [
  "getRetailDashboardOrganizationProjection",
  "getRetailDashboardPeriodProjection",
  "getRetailDashboardUserProjection",
  "cacheDefaultRange = !from && !to",
  'user: "BYPASS"',
  "getCommercialRetailDashboardRead",
]);
check(!dashboard.includes('from "@/lib/prisma"'), "SCALE-5B: le compositeur dashboard ne doit plus interroger Prisma directement.");

requireTokens("route", route, [
  "authorizeRetailRequest",
  "getCommercialRetailDashboardRead",
  "dashboardRead.cacheSources",
  'domain: "retail-dashboard"',
  "retailCache",
]);
check(
  route.indexOf("authorizeRetailRequest") < route.indexOf("getCommercialRetailDashboardRead("),
  "SCALE-5B: l'autorisation doit précéder toute lecture des projections.",
);
check(!route.includes("cacheSources:"), "SCALE-5B: les sources techniques de cache ne doivent pas être injectées dans le payload métier.");

requireTokens("worker", worker, [
  "invalidateEnterpriseFinanceOverviewSummaryCacheForDomainEvent",
  "invalidateCommercialRetailDashboardCacheForDomainEvent",
  "organizationId: event.organizationId",
  "entityType: event.entityType",
]);
check(
  worker.indexOf("processWorkflowDomainEvent(event.id)") < worker.indexOf("invalidateCommercialRetailDashboardCacheForDomainEvent({"),
  "SCALE-5B: l'invalidation Retail doit intervenir après le traitement métier de l'événement.",
);

requireTokens("cache foundation", cache, [
  "organizationId: string",
  "dtsc:read-cache:",
  ":org:",
  "TENANT_READ_CACHE_TIMEOUT_MS = 250",
]);
check(!cache.includes("NEXT_PUBLIC_"), "SCALE-5B: aucun secret Redis ne doit devenir public.");

requireTokens("CTO observability", observability, [
  'domain\' = \'retail-dashboard'.replace("domain\\'", "domain'"),
  "retailOrganizationHits",
  "retailOrganizationMisses",
  "retailOrganizationFallbacks",
  "retailPeriodHits",
  "retailPeriodMisses",
  "retailPeriodFallbacks",
  "retailPeriodBypasses",
  "readCache:",
]);
check(!ctoDashboard.includes("organizationId") && !ctoDashboard.includes("userId"), "SCALE-5B: le dashboard CTO ne doit jamais exposer les identifiants tenant/utilisateur.");
requireTokens("CTO UI", ctoDashboard, [
  "snapshot.readCache",
  't("financeOverviewCache")',
  't("retailOrganizationCache")',
  't("retailPeriodCache")',
  't("cacheHitRate")',
  't("cacheFallback")',
  't("cacheBypass")',
]);
requireTokens("shared scalability launcher", ctoLauncher, [
  "useFloatingAction",
  'id: "cto-scalability"',
  "order: 8",
  'router.push("/admin/cto/scalability")',
]);
check(adminSection.includes("<CtoScalabilityFloatingAction"), "SCALE-5B: le CTO doit enregistrer Scalabilité dans le hub flottant commun.");
check(!adminSection.includes('href="/admin/cto/scalability"'), "SCALE-5B: aucun bouton flottant Scalabilité indépendant ne doit revenir.");

requireTokens("documentation", docs, [
  "SCALE-5B",
  "organisation / période / utilisateur",
  "PostgreSQL",
  "15 secondes",
  "60 secondes",
  "BYPASS",
  "CTO",
  "FloatingActionHub",
  "OWNER_E2E",
  "Rollback",
]);
check(
  regression.includes('await import("./qa-scale5b-retail-dashboard-cache.mjs")'),
  "SCALE-5B: la QA ciblée doit être branchée à qa:regression.",
);

if (failures.length) {
  console.error("FAIL qa-scale5b-retail-dashboard-cache");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-scale5b-retail-dashboard-cache");
