import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const workspace = read("lib/account/personal-workspace.ts");
const load = read("scripts/load/scale7-staged-certification.js");
const report = read("scripts/load/build-scale7-certification-report.mjs");

const independentIndex = workspace.indexOf("const independentWorkspaceReads = Promise.all([");
const membershipAwaitIndex = workspace.indexOf("const membershipRows = await membershipRowsPromise;");
const notificationIndex = workspace.indexOf("const notificationWhere = buildVisibleNotificationWhereForSession");
const notificationFetchIndex = workspace.indexOf("prisma.notification.count({ where: { ...notificationWhere, readAt: null } })");

expect(independentIndex >= 0, "Independent Dashboard workspace reads must be grouped explicitly.");
expect(membershipAwaitIndex > independentIndex, "Independent workspace reads must start before waiting for memberships.");
expect(notificationIndex > membershipAwaitIndex, "Notification scope must still be built only after memberships resolve.");
expect(notificationFetchIndex > notificationIndex, "Notification reads must remain scoped by resolved memberships.");

for (const token of [
  "listUserIdentityLinksForWorkspace(user.id)",
  "prisma.supportTicket.count",
  "prisma.supportTicket.findMany",
  "prisma.conversation.findMany",
  "getWorkspaceBillingUsageSnapshot",
  "getOrganizationWorkspaceCommercialSummary",
]) {
  expect(workspace.includes(token), `Workspace read missing after parallelization: ${token}`);
}

for (const threshold of [
  'http_req_duration: ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:dashboard-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]',
]) {
  expect(load.includes(threshold), `SCALE-7 SLO changed unexpectedly: ${threshold}`);
}
expect(report.includes("infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0"), "Strict zero idle-in-transaction gate must remain unchanged.");

if (failures.length) {
  console.error("SCALE-7I QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("PASS SCALE-7I: independent Dashboard workspace reads overlap without changing visibility, SLOs, or idle gate.");
