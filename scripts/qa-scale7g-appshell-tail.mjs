import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const appShell = read("components/layout/app-shell.tsx");
const dashboard = read("app/dashboard/page.tsx");
const perf = read("lib/app-shell-performance.ts");
const navigation = read("lib/enterprise/enterprise-navigation.ts");
const access = read("lib/enterprise/module-access.ts");
const activities = read("lib/enterprise/enterprise-activity-blocks-loader.ts");
const entitlements = read("lib/billing/entitlements.ts");
const observability = read("lib/scalability/production-observability.ts");
const report = read("scripts/load/build-scale7-certification-report.mjs");
const workflow = read(".github/workflows/scale7-staged-certification.yml");
const load = read("scripts/load/scale7-staged-certification.js");

expect(perf.includes("APP_SHELL_GLOBAL_AGGREGATE_BUDGET = 9"), "AppShell aggregate budget must be tightened to 9.");
expect((appShell.match(/performanceRecorder\.timed\(/g) || []).length <= 9, "AppShell must execute no more than nine measured aggregate tasks.");
expect(appShell.includes("precomputed?.unreadNotifications") && appShell.includes("precomputed?.pendingEnterpriseInvitations"), "AppShell must accept exact Dashboard precomputed counters.");
expect(dashboard.includes("unreadNotifications: workspace.account.unreadNotificationCount") && dashboard.includes("pendingEnterpriseInvitations: workspace.account.pendingInvitationCount"), "Dashboard must reuse its exact counters in AppShell.");
expect(!appShell.includes('performanceRecorder.timed("enterpriseAdminDecision"'), "AppShell must not load a second enterprise access snapshot for admin navigation.");
expect(appShell.includes("getEnterpriseShellNavigation(activeOrganizationId, user.id, user.locale)"), "AppShell must resolve navigation and admin decision together.");
expect(appShell.includes("dtscInternalContext") && appShell.includes('performanceRecorder.timed("employeeRecord"'), "Employee lookup must stay explicitly tied to DTSC internal context.");
expect(access.includes("resolveEnterpriseShellModuleAccess") && access.includes("listNavigableEnterpriseModulesFromSnapshot(snapshot, \"read\")") && access.includes('resolveFromSnapshot(snapshot, "ADMIN_DASHBOARD", "manage")'), "Canonical module access must derive shell navigation and admin decision from one snapshot.");
expect(navigation.includes("resolveEnterpriseShellModuleAccess") && navigation.includes("adminDecision: access.adminDecision"), "Enterprise navigation must expose the shared shell decision.");
const adminShortcut = activities.indexOf("if (ENTERPRISE_ADMIN_ROLES.has(membership.role))");
const perBlockChecks = activities.indexOf("const accessChecks = await Promise.all(");
expect(
  activities.includes("resolveFeatureAccessFromEntitlements(entitlements, \"enterprise-activities\")") &&
  adminShortcut >= 0 &&
  perBlockChecks > adminShortcut,
  "Activity loader must preserve canonical entitlement checks and short-circuit verified admins before per-block checks.",
);
expect(entitlements.includes("export function resolveFeatureAccessFromEntitlements") && entitlements.includes("return resolveFeatureAccessFromEntitlements(await getOrganizationEntitlements(organizationId), feature);"), "Feature access policy must remain canonical while supporting preloaded entitlements.");

for (const token of [
  "idleInTransactionUnder100msConnections",
  "idleInTransactionAtLeast100msConnections",
  "idleInTransactionAtLeast1sConnections",
]) {
  expect(observability.includes(token), `Observability missing safe idle transaction bucket: ${token}`);
  expect(report.includes(token.replace("Connections", "").replace("idle", "maxIdle")), `Report missing idle transaction bucket derived from ${token}`);
}
expect(report.includes("infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0"), "Strict zero idle-in-transaction gate must remain unchanged.");
expect(workflow.includes("maxIdleInTransactionUnder100ms") && workflow.includes("maxIdleInTransactionAtLeast100ms") && workflow.includes("maxIdleInTransactionAtLeast1s"), "Owner evidence must publish only aggregated idle transaction age buckets.");

for (const threshold of [
  '"http_req_duration{workload:dashboard-read}": ["p(95)<1000", `p(99)<${dashboardP99LimitMs}`]',
  '"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]',
]) {
  expect(load.includes(threshold), `SCALE-7 workload SLO changed unexpectedly: ${threshold}`);
}

if (failures.length) {
  console.error("SCALE-7G QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("PASS SCALE-7G: AppShell fan-out reduced, RBAC stays canonical, idle zero gate unchanged, and safe age buckets added.");
