import fs from "node:fs";

const files = {
  page: "app/admin/cto/scalability/page.tsx",
  launcher: "app/admin/[section]/page.tsx",
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
const launcher = fs.readFileSync(files.launcher, "utf8");
const component = fs.readFileSync(files.component, "utf8");
const i18n = fs.readFileSync(files.i18n, "utf8");

const checks = [
  [page.includes('canAccessAdminSection(user, "cto", adminRoleAccess)'), "CTO route must preserve CTO section access"],
  [page.includes("CONSOLE_CAPABILITIES.SECURITY_READ"), "CTO route must preserve SECURITY_READ observability access"],
  [page.includes("getProductionObservabilitySnapshot(windowHours)"), "dashboard must reuse canonical SCALE-0 snapshot"],
  [page.includes("hours === 1 || hours === 24 || hours === 168"), "dashboard window must be limited to 1h/24h/7d"],
  [!page.includes("fetch("), "server dashboard must not add browser/server HTTP loopback fetch"],
  [launcher.includes('section !== "cto"'), "launcher must remain scoped to CTO"],
  [launcher.includes("CONSOLE_CAPABILITIES.SECURITY_READ"), "launcher visibility must be security-capability aware"],
  [component.includes('data-dtsc-responsive-root'), "dashboard must opt into responsive root contract"],
  [component.includes('data-horizontal-rail'), "window selector must use horizontal rail contract"],
  [component.includes("grid-cols-[minmax(0,1fr)]"), "dynamic grids must use minmax responsive columns"],
  [component.includes("snapshot.redis") || component.includes('tone="not-measured"'), "Redis must be visibly represented as not measured"],
  [component.includes("notCertification"), "UI must explicitly distinguish SLO targets from capacity certification"],
  [i18n.includes("ScalabilityConsoleLocale") && i18n.includes("fr:") && i18n.includes("en:"), "dashboard strings must have canonical FR/EN dictionary"],
  [!component.includes("organizationId") && !component.includes("userId") && !component.includes("DATABASE_URL"), "dashboard must not expose tenant/user/DSN fields"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("SCALE-0D Console CTO dashboard contract: OK");
