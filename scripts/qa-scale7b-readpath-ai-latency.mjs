import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL SCALE-7B: missing ${path}`);
    process.exit(1);
  }
  return fs.readFileSync(path, "utf8");
}

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL SCALE-7B: ${message}`);
    process.exit(1);
  }
}

const workspace = read("lib/account/personal-workspace.ts");
const notifications = read("lib/notification-access.ts");
const identityLinks = read("lib/enterprise/identity-links/service.ts");
const entitlements = read("lib/billing/entitlements.ts");
const commonAccess = read("lib/enterprise/common/access.ts");
const retailHttp = read("lib/enterprise/retail/http.ts");
const retailSales = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
const authPool = read("lib/scalability/scale7-auth-pool.ts");
const scale7 = read("scripts/load/scale7-staged-certification.js");

for (const marker of [
  'status: { in: ["ACTIVE", "INVITED"] }',
  "const memberships = membershipRows.filter",
  "const pendingInvitations = membershipRows",
  "buildVisibleNotificationWhereForSession(session, membershipRows)",
  "listUserIdentityLinksForWorkspace(user.id)",
]) expect(workspace.includes(marker), `Dashboard membership collapse missing: ${marker}`);

expect(!workspace.includes("getPendingEnterpriseInvitationsForUser"), "Dashboard must not issue a second invitation membership query");
expect(!workspace.includes("getVisibleNotificationWhereForSession(session)"), "Dashboard must not re-read notification membership scope");
expect(!workspace.includes("listUserIdentityLinks(user.id)"), "Dashboard must not load unused person identity projections");

for (const marker of [
  "export function buildVisibleNotificationWhereForSession",
  "return buildVisibleNotificationWhereForSession(session, memberships)",
]) expect(notifications.includes(marker), `notification scope reuse missing: ${marker}`);

for (const marker of [
  "export async function listUserIdentityLinksForWorkspace",
  "select: { id: true, name: true, logoUrl: true }",
]) expect(identityLinks.includes(marker), `workspace identity projection missing: ${marker}`);

expect(
  entitlements.includes("const [commercialContext, organization, subtypeSelection] = await Promise.all([")
    && entitlements.includes("resolveOrganizationCommercialContext(organizationId)"),
  "organization entitlements must resolve commercial context, modules and subtype in parallel",
);

expect(
  commonAccess.includes("includeMutationCapabilities = true")
    && commonAccess.includes("includeMutationCapabilities?: boolean"),
  "common domain access must preserve full-capability default with an explicit read-only opt-in",
);
expect(
  retailHttp.includes("includeMutationCapabilities: options?.includeMutationCapabilities ?? true"),
  "Retail authorization must forward the read-only access opt-in",
);
expect(
  retailSales.includes('{ includeMutationCapabilities: false }'),
  "Retail sales GET must skip unused write/manage access resolution",
);

for (const marker of [
  'aiPath: "/api/enterprise/ai/chat"',
  "useKnowledge: false",
  "useTools: false",
  'reasoningEffort: "AUTO"',
]) expect(authPool.includes(marker), `SCALE-7 Enterprise AI pool contract missing: ${marker}`);
expect(
  scale7.includes("JSON.stringify({ ...aiPayload, organizationId: tenant.organizationId })"),
  "SCALE-7 Enterprise AI request must bind the current synthetic tenant",
);
expect(!authPool.includes('aiPath: "/api/chat/v2"'), "SCALE-7 must not benchmark the PERSONAL chatbot as the Enterprise AI workload");

console.log("SCALE-7B read-path and AI latency contract: OK");
