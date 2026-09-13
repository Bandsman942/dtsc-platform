import fs from "node:fs";

const files = {
  page: "app/admin/cto/scalability/page.tsx",
  launcherHost: "app/admin/[section]/page.tsx",
  launcherAction: "components/admin/cto-scalability-floating-action.tsx",
  floatingHub: "components/floating-actions/floating-action-hub.tsx",
  toolbox: "components/productivity/professional-toolbox-v2.tsx",
  component: "components/admin/cto-scalability-dashboard.tsx",
  i18n: "lib/scalability/console-i18n.ts",
  observability: "lib/scalability/production-observability.ts",
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL: missing ${path}`);
    process.exit(1);
  }
}

const page = fs.readFileSync(files.page, "utf8");
const launcherHost = fs.readFileSync(files.launcherHost, "utf8");
const launcherAction = fs.readFileSync(files.launcherAction, "utf8");
const floatingHub = fs.readFileSync(files.floatingHub, "utf8");
const toolbox = fs.readFileSync(files.toolbox, "utf8");
const component = fs.readFileSync(files.component, "utf8");
const i18n = fs.readFileSync(files.i18n, "utf8");
const observability = fs.readFileSync(files.observability, "utf8");

const checks = [
  [page.includes('canAccessAdminSection(user, "cto", adminRoleAccess)'), "CTO route must preserve CTO section access"],
  [page.includes("CONSOLE_CAPABILITIES.SECURITY_READ"), "CTO route must preserve SECURITY_READ observability access"],
  [page.includes("getProductionObservabilitySnapshot(windowHours)"), "dashboard must reuse canonical scalability snapshot"],
  [page.includes("hours === 1 || hours === 24 || hours === 168"), "dashboard window must be limited to 1h/24h/7d"],
  [!page.includes("fetch("), "server dashboard must not add browser/server HTTP loopback fetch"],
  [launcherHost.includes('section !== "cto"'), "launcher must remain scoped to CTO"],
  [launcherHost.includes("CONSOLE_CAPABILITIES.SECURITY_READ"), "launcher visibility must be security-capability aware"],
  [launcherHost.includes("<CtoScalabilityFloatingAction"), "CTO host must register scalability in the shared floating action hub"],
  [!launcherHost.includes('href="/admin/cto/scalability"'), "CTO host must not render a second independent fixed scalability button"],
  [launcherAction.includes("useFloatingAction"), "scalability launcher must use the canonical FloatingActionHub registry"],
  [launcherAction.includes('id: "cto-scalability"'), "scalability launcher must keep a stable action id"],
  [launcherAction.includes('router.push("/admin/cto/scalability")'), "scalability action must navigate to the canonical CTO page"],
  [launcherAction.includes("order: 8"), "scalability action must keep its harmonized ordering in the shared hub"],
  [toolbox.includes('id: "professional-toolbox"') && toolbox.includes("useFloatingAction"), "professional toolbox must remain in the same floating action hub"],
  [floatingHub.includes("data-floating-action-hub"), "shared floating action hub must remain the single quick-action surface"],
  [component.includes('data-dtsc-responsive-root'), "dashboard must opt into responsive root contract"],
  [component.includes('data-horizontal-rail'), "window selector must use horizontal rail contract"],
  [component.includes("grid-cols-[minmax(0,1fr)]"), "dynamic grids must use minmax responsive columns"],
  [component.includes("snapshot.redis"), "SCALE-2 Redis metrics must remain visible"],
  [component.includes("snapshot.rateLimit"), "SCALE-3 rate-limit resilience must be visible"],
  [component.includes("snapshot.queues"), "SCALE-4 durable queue metrics must be visible"],
  [component.includes("snapshot.readCache"), "SCALE-5 read-cache metrics must be visible"],
  [component.includes("notCertification"), "UI must explicitly distinguish SLO targets from capacity certification"],
  [i18n.includes("ScalabilityConsoleLocale") && i18n.includes("fr:") && i18n.includes("en:"), "dashboard strings must have canonical FR/EN dictionary"],
  [i18n.includes('rateLimit: "Rate-limit distribué"') && i18n.includes('readCache: "Caches & projections de lecture"'), "FR scalability catalog must cover SCALE-3 to SCALE-5"],
  [i18n.includes('rateLimit: "Distributed rate limiting"') && i18n.includes('readCache: "Read caches & projections"'), "EN scalability catalog must cover SCALE-3 to SCALE-5"],
  [observability.includes("RATE_LIMIT_POLICY_RULES") && observability.includes("RATE_LIMIT_FALLBACK_TELEMETRY_FLUSH_MS"), "snapshot must expose canonical SCALE-3 policy state"],
  [observability.includes('FROM "EnterpriseDomainEvent"') && observability.includes('"oldestReadyAt"'), "snapshot must expose SCALE-4 durable queue pressure"],
  [observability.includes("financeOverview") || observability.includes("financeRequests"), "snapshot must expose Finance read-cache telemetry"],
  [observability.includes("retailOrganizationHits") && observability.includes("retailPeriodBypasses"), "snapshot must expose Retail read-cache HIT/MISS/FALLBACK/BYPASS telemetry"],
  [!component.includes("organizationId") && !component.includes("userId") && !component.includes("DATABASE_URL"), "dashboard must not expose tenant/user/DSN fields"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("SCALE-0D Console CTO dashboard contract: OK — shared launcher plus SCALE-0..5 metrics are guarded.");
