import fs from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

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
  workspace.includes("const [membershipRows, identityLinks] = await Promise.all([") &&
  workspace.includes("listUserIdentityLinksForWorkspace(user.id)") &&
  workspace.includes("getOrganizationWorkspaceCommercialSummary(activeOrganizationId)"),
  "Dashboard overlaps membership/identity reads and uses the lightweight commercial summary",
);

const secondBurst = workspace.slice(
  workspace.indexOf("const [\n    unreadNotificationCount"),
  workspace.indexOf("const actionableRelationshipStatuses"),
);
expect(
  secondBurst.includes("organizationCommercialSummary") &&
  !secondBurst.includes("identityLinks,") &&
  (secondBurst.match(/prisma\./g) || []).length === 8 &&
  secondBurst.includes("getOrganizationWorkspaceCommercialSummary(activeOrganizationId)"),
  "Dashboard second burst is bounded to nine database-backed tasks",
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
    report.includes(`${prefix}P99UnderTwoSeconds`),
    `${workload} workload is included in sanitized report gates`,
  );
}

expect(
  load.includes('"http_req_duration{workload:dashboard-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]'),
  "k6 workload SLOs remain unchanged",
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

const stagedCertificationQa = spawnSync(
  process.execPath,
  ["scripts/qa-scale7-staged-certification.mjs"],
  { encoding: "utf8" },
);
if (stagedCertificationQa.status !== 0) {
  console.error(stagedCertificationQa.stdout || "");
  console.error(stagedCertificationQa.stderr || "");
  process.exitCode = 1;
} else {
  console.log("PASS SCALE-7D: canonical SCALE-7 staged certification QA passed");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-7D static contract passed.");
