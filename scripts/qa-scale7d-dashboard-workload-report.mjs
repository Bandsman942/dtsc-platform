import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL SCALE-7D: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS SCALE-7D: ${message}`);
  }
}

const workspace = read("lib/account/personal-workspace.ts");
const entitlements = read("lib/billing/entitlements.ts");
const report = read("scripts/load/build-scale7-certification-report.mjs");
const load = read("scripts/load/scale7-staged-certification.js");
const workflow = read(".github/workflows/scale7-staged-certification.yml");
const workspaceAudit = read("scripts/lib/standard-personal-workspace-audit.mjs");

expect(
  workspace.includes("const membershipRowsPromise = prisma.organizationMember.findMany({") &&
  workspace.includes("const independentWorkspaceReads = Promise.all([") &&
  workspace.includes("listUserIdentityLinksForWorkspace(user.id)") &&
  workspace.includes("getOrganizationWorkspaceCommercialSummary(activeOrganizationId)"),
  "Dashboard overlaps membership/identity reads and uses the lightweight commercial summary",
);

const independentBurst = workspace.slice(
  workspace.indexOf("const independentWorkspaceReads = Promise.all(["),
  workspace.indexOf("const membershipRows = await membershipRowsPromise;"),
);
expect(
  independentBurst.includes("listUserIdentityLinksForWorkspace(user.id)") &&
  independentBurst.includes("getWorkspaceBillingUsageSnapshot(user.id, activeOrganizationId, today)") &&
  independentBurst.includes("getOrganizationWorkspaceCommercialSummary(activeOrganizationId)") &&
  (independentBurst.match(/prisma\./g) || []).length === 3,
  "Dashboard second burst is bounded to seven database-backed tasks",
);

const helperStart = entitlements.indexOf("export async function getOrganizationWorkspaceCommercialSummary");
const helperEnd = entitlements.indexOf("export async function getOrganizationEntitlements", helperStart);
const helper = entitlements.slice(helperStart, helperEnd);
expect(
  helperStart >= 0 &&
  helper.includes("resolveOrganizationCommercialContext(organizationId)") &&
  !helper.includes("enterpriseModules") &&
  !helper.includes("enterpriseBusinessSubtypeSelection"),
  "Workspace commercial summary does not load ERP modules or business subtype",
);

for (const workload of ["dashboard", "enterprise", "shop", "collaboration"]) {
  const prefix = workload === "dashboard"
    ? "dashboard"
    : workload === "enterprise"
      ? "enterprise"
      : workload === "shop"
        ? "shop"
        : "collaboration";
  expect(
    report.includes(`${prefix}P95UnderOneSecond`) &&
    report.includes(workload === "dashboard" ? "dashboardP99UnderPolicyLimit" : `${prefix}P99UnderTwoSeconds`),
    `${workload} workload is included in sanitized report gates`,
  );
}

expect(
  load.includes('"http_req_duration{workload:dashboard-read}": ["p(95)<1000", `p(99)<${dashboardP99LimitMs}`]') &&
  load.includes('"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]'),
  "Dashboard P99 uses the expiring policy; other workload SLOs remain strict",
);

expect(
  workflow.includes("workloads: .http.workloads"),
  "owner-triggered sanitized result publishes workload latency",
);

const dashboardAuditStart = workspaceAudit.indexOf('if (run("dashboard"))');
const dashboardAuditEnd = workspaceAudit.indexOf('if (run("context"))', dashboardAuditStart);
const dashboardAudit = workspaceAudit.slice(dashboardAuditStart, dashboardAuditEnd);
expect(
  dashboardAuditStart >= 0 &&
  dashboardAuditEnd > dashboardAuditStart &&
  dashboardAudit.includes('"getOrganizationWorkspaceCommercialSummary"') &&
  !dashboardAudit.includes('"getOrganizationEntitlements",'),
  "standard Dashboard audit requires the lightweight commercial workspace contract",
);

if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-7D static contract passed.");
