import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL SCALE-7F: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS SCALE-7F: ${message}`);
  }
}

const workspace = read("lib/account/personal-workspace.ts");
const coreAccess = read("lib/enterprise/core-v2/access.ts");
const observability = read("lib/scalability/production-observability.ts");
const report = read("scripts/load/build-scale7-certification-report.mjs");
const workflow = read(".github/workflows/scale7-staged-certification.yml");
const load = read("scripts/load/scale7-staged-certification.js");

const workspaceBurst = workspace.slice(
  workspace.indexOf("const today = new Date();"),
  workspace.indexOf("const actionableRelationshipStatuses"),
);
const waves = workspaceBurst.split("await Promise.all([").slice(1);
expect(
  waves.length === 2,
  "Dashboard sustained-load section uses exactly two bounded read waves",
);
expect(
  waves.length === 2 &&
  (waves[0].match(/prisma\./g) || []).length === 4 &&
  (waves[1].match(/prisma\./g) || []).length === 4 &&
  waves[1].includes("getOrganizationWorkspaceCommercialSummary(activeOrganizationId)"),
  "Dashboard second-stage DB fan-out is bounded to four direct Prisma reads plus one commercial summary",
);

expect(
  !coreAccess.includes("requireEnterpriseMembership") &&
  coreAccess.includes("resolveEnterpriseModuleCapabilities") &&
  coreAccess.includes("capabilityAllowsAction(capabilities, action)"),
  "Core V2 access relies on the fail-closed capability snapshot instead of a duplicate membership query",
);
expect(
  !coreAccess.includes("membership,\n    capabilities"),
  "Core V2 access no longer exposes a redundant membership payload",
);

expect(
  observability.includes("oldestIdleInTransactionTransactionSeconds") &&
  observability.includes("now() - xact_start") &&
  observability.includes("state = 'idle in transaction'"),
  "idle-in-transaction telemetry includes bounded transaction lifetime evidence",
);
expect(
  report.includes("maxIdleInTransactionTransactionAgeSeconds") &&
  report.includes("infrastructure.maxIdleInTransaction === 0"),
  "certification keeps the exact zero idle-in-transaction gate while reporting transaction age",
);
expect(
  workflow.includes("maxIdleInTransactionTransactionAgeSeconds: .infrastructure.maxIdleInTransactionTransactionAgeSeconds"),
  "owner result publishes the new secret-free transaction-age diagnostic",
);

expect(
  load.includes('"http_req_duration{workload:dashboard-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('tenant_isolation_pass: ["rate==1"]'),
  "SCALE-7F does not relax workload or tenant-isolation SLOs",
);

if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-7F soak-tail stability contract passed.");
