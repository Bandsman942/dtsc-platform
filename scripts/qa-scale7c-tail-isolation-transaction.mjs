import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL SCALE-7C: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS SCALE-7C: ${message}`);
  }
}

const workspace = read("lib/account/personal-workspace.ts");
const route = read("app/api/enterprise/[organizationId]/business-context/route.ts");
const businessContext = read("lib/enterprise/business-context.ts");
const load = read("scripts/load/scale7-staged-certification.js");
const observability = read("lib/scalability/production-observability.ts");
const report = read("scripts/load/build-scale7-certification-report.mjs");
const workflow = read(".github/workflows/scale7-staged-certification.yml");

expect(
  workspace.includes("identityLinks,\n    unreadNotificationCount") &&
  workspace.includes("recentConversations,\n    personalSubscription") &&
  (workspace.match(/await Promise\.all\(\[/g) || []).length >= 2,
  "Dashboard reads are split into bounded waves instead of one direct ten-read burst",
);
expect(
  route.includes("getEnterpriseBusinessContextForAuthorizedOrganization") &&
  route.includes('organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" }') &&
  route.includes("organization: { select: { timezone: true } }"),
  "business-context reuses the membership-scoped organization timezone",
);
expect(
  businessContext.includes("getEnterpriseBusinessContextForAuthorizedOrganization") &&
  businessContext.includes('Pick<Prisma.TransactionClient, "enterpriseFinanceConfiguration">'),
  "authorized business context avoids re-reading Organization",
);
expect(
  load.includes("function probeTenantIsolation") &&
  load.includes("if (response.status === 0)") &&
  load.includes('attempt: "transport-retry"') &&
  load.includes('tenant_isolation_pass: ["rate==1"]'),
  "isolation retries transport failures once while retaining the exact 100 percent gate",
);
expect(
  observability.includes("oldestIdleInTransactionSeconds") &&
  report.includes("maxIdleInTransactionAgeSeconds") &&
  report.includes("infrastructure.maxIdleInTransaction === 0"),
  "idle-in-transaction remains a strict zero gate with secret-free age diagnostics",
);
expect(
  workflow.includes("maxIdleInTransactionAgeSeconds: .infrastructure.maxIdleInTransactionAgeSeconds"),
  "owner result publishes bounded idle-in-transaction diagnostics",
);

if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-7C static contract passed.");
