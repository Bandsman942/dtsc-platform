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
function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : "";
}

const workspace = read("lib/account/personal-workspace.ts");
const entitlements = read("lib/billing/entitlements.ts");
const observability = read("lib/scalability/production-observability.ts");
const report = read("scripts/load/build-scale7-certification-report.mjs");
const workflow = read(".github/workflows/scale7-staged-certification.yml");

const workspaceProjection = between(
  entitlements,
  "export async function getOrganizationWorkspaceEntitlements",
  "export async function getOrganizationEntitlements",
);

expect(
  workspace.includes("getOrganizationWorkspaceEntitlements(activeOrganizationId)") &&
  !workspace.includes("getOrganizationEntitlements(activeOrganizationId)"),
  "Dashboard uses the lightweight canonical commercial projection",
);
expect(
  workspaceProjection.includes("resolveOrganizationCommercialContext(organizationId)") &&
  workspaceProjection.includes("resolveOrganizationUsageLimits") &&
  !workspaceProjection.includes("enterpriseModules") &&
  !workspaceProjection.includes("enterpriseBusinessSubtypeSelection"),
  "workspace entitlements reuse commercial context without loading ERP modules or subtype",
);

for (const gate of [
  "dashboardP95UnderOneSecond",
  "dashboardP99UnderTwoSeconds",
  "enterpriseP95UnderOneSecond",
  "enterpriseP99UnderTwoSeconds",
  "shopP95UnderOneSecond",
  "shopP99UnderTwoSeconds",
  "collaborationP95UnderOneSecond",
  "collaborationP99UnderTwoSeconds",
]) {
  expect(report.includes(gate), `report builder enforces ${gate}`);
}

expect(
  observability.includes("DbIdleInTransactionDiagnosticRow") &&
  observability.includes('applicationClass: "UNSPECIFIED" | "PRISMA" | "PGBOUNCER" | "NEON" | "OTHER"') &&
  observability.includes('statementClass: "SELECT" | "WRITE" | "BEGIN" | "COMMIT" | "ROLLBACK" | "OTHER"') &&
  observability.includes('"stateAgeMs"') &&
  observability.includes('"transactionAgeMs"'),
  "idle-in-transaction diagnostics are bounded to non-sensitive classes and millisecond ages",
);
expect(
  !observability.includes('pid AS "pid"') &&
  !observability.includes('query AS "query"') &&
  !observability.includes('usename AS') &&
  !observability.includes('client_addr AS'),
  "idle attribution does not publish PID, SQL, DB user or client address",
);
expect(
  report.includes("idleInTransactionDiagnostics") &&
  report.includes("infrastructure.maxIdleInTransaction === 0") &&
  workflow.includes("idleInTransactionDiagnostics: .infrastructure.idleInTransactionDiagnostics"),
  "strict zero idle gate remains unchanged while sanitized attribution is archived",
);

if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-7D static contract passed.");
