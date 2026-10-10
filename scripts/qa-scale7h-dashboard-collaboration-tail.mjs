import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const workspace = read("lib/account/personal-workspace.ts");
const shell = read("components/layout/app-shell.tsx");
const dashboard = read("app/dashboard/page.tsx");
const collaboration = read("lib/collaboration.ts");
const load = read("scripts/load/scale7-staged-certification.js");
const report = read("scripts/load/build-scale7-certification-report.mjs");

for (const token of [
  "brandingJson: true",
  "logoUrl: membership.organization.logoUrl",
  "brandingJson: membership.organization.brandingJson",
]) {
  expect(workspace.includes(token), `Workspace membership snapshot missing: ${token}`);
}

for (const token of [
  "pendingCompanyRelationships?: number",
  "organizationMemberships?: Array",
  "precomputed?.pendingCompanyRelationships",
  "precomputed?.organizationMemberships",
  'performanceRecorder.timed("organizationMemberships", organizationMembershipsPromise)',
]) {
  expect(shell.includes(token), `AppShell Dashboard reuse missing: ${token}`);
}

for (const token of [
  "pendingCompanyRelationships: workspace.account.pendingRelationshipCount",
  "organizationMemberships: workspace.organizations.map",
  "brandingJson: organization.brandingJson",
]) {
  expect(dashboard.includes(token), `Dashboard precomputed shell payload missing: ${token}`);
}

const unreadStart = collaboration.indexOf("export async function getUnreadCollaborationMessageCount");
const unreadEnd = collaboration.indexOf("\nexport async function writeGroupAudit", unreadStart);
const unreadBlock = unreadStart >= 0 && unreadEnd > unreadStart ? collaboration.slice(unreadStart, unreadEnd) : "";
expect(unreadBlock.includes("prisma.collaborationGroupMessage.count"), "Unread collaboration must use the message count query.");
expect(unreadBlock.includes("group: {") && unreadBlock.includes('status: "ACTIVE"') && unreadBlock.includes("members: { some:"), "Unread collaboration must scope the count through an active group membership.");
expect(unreadBlock.includes("...scopedGroupFilter"), "Unread collaboration must preserve the canonical context scope.");
expect(unreadBlock.includes('authorId: { not: session.userId }') && unreadBlock.includes('messageType: { not: "SYSTEM" }') && unreadBlock.includes("deletedAt: null"), "Unread collaboration exclusions changed unexpectedly.");
expect(unreadBlock.includes("reads: { none: { userId: session.userId } }"), "Unread collaboration read semantics changed unexpectedly.");
expect(!unreadBlock.includes("prisma.collaborationGroup.findMany"), "Unread collaboration must not prefetch group IDs before counting.");

for (const threshold of [
  'http_req_duration: ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:dashboard-read}": ["p(95)<1000", `p(99)<${dashboardP99LimitMs}`]',
  '"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]',
]) {
  expect(load.includes(threshold), `SCALE-7 SLO changed unexpectedly: ${threshold}`);
}
expect(report.includes("infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0"), "Strict zero idle-in-transaction gate must remain unchanged.");

if (failures.length) {
  console.error("SCALE-7H QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("PASS SCALE-7H: Dashboard reuses exact shell data, Collaboration unread is one scoped count, and SCALE-7 gates stay strict.");
