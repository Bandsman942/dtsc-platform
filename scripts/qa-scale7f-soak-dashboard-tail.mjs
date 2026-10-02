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

const auth = read("lib/auth.ts");
const identity = read("lib/enterprise/identity-links/service.ts");
const workspace = read("lib/account/personal-workspace.ts");
const load = read("scripts/load/scale7-staged-certification.js");
const report = read("scripts/load/build-scale7-certification-report.mjs");

expect(
  auth.includes("session.idleTimeoutMinutes !== undefined") &&
  auth.includes("Promise.resolve(session.idleTimeoutMinutes)") &&
  auth.includes("getUserSessionIdleTimeoutMinutes(session.userId)"),
  "verified sessions reuse the signed idle timeout with DB fallback only for legacy sessions",
);

const identityStart = identity.indexOf("export async function listUserIdentityLinksForWorkspace");
const identityEnd = identity.indexOf("export async function listUserIdentityLinks(userId", identityStart);
const identityWorkspace = identity.slice(identityStart, identityEnd);
expect(
  identityWorkspace.includes("prisma.$queryRaw<WorkspaceIdentityLinkRow[]>") &&
  identityWorkspace.includes('LEFT JOIN "Organization"') &&
  !identityWorkspace.includes("prisma.organization.findMany"),
  "workspace identity links resolve organizations in one DB round-trip",
);

const billingStart = workspace.indexOf("async function getWorkspaceBillingUsageSnapshot");
const billingEnd = workspace.indexOf("function resolveContext", billingStart);
const billingHelper = workspace.slice(billingStart, billingEnd);
expect(
  billingHelper.includes('FROM "UsageLog"') &&
  billingHelper.includes('FROM "KnowledgeDocument"') &&
  billingHelper.includes('FROM "Subscription"') &&
  billingHelper.includes('JOIN "BillingPlan"') &&
  billingHelper.includes('"organizationId" IS NOT DISTINCT FROM'),
  "workspace billing/usage projection stays exact and tenant-scoped in one query",
);

const secondBurstStart = workspace.indexOf("const [\n    unreadNotificationCount");
const secondBurstEnd = workspace.indexOf("const personalSubscription", secondBurstStart);
const secondBurst = workspace.slice(secondBurstStart, secondBurstEnd);
expect(
  secondBurst.includes("getWorkspaceBillingUsageSnapshot(user.id, activeOrganizationId, today)") &&
  !secondBurst.includes("prisma.subscription.findFirst") &&
  !secondBurst.includes("prisma.usageLog.aggregate") &&
  !secondBurst.includes("prisma.knowledgeDocument.count"),
  "Dashboard no longer performs separate subscription, usage and document reads",
);

expect(
  load.includes('"http_req_duration{workload:dashboard-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]') &&
  load.includes('"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]'),
  "workload SLOs remain unchanged",
);

expect(
  report.includes("noIdleInTransaction: infrastructure.maxIdleInTransaction === 0"),
  "idle-in-transaction certification remains a strict zero gate",
);

if (process.exitCode) process.exit(process.exitCode);
console.log("SCALE-7F static contract passed.");
