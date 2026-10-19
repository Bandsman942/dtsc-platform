import fs from "node:fs";

const checks = [];
const read = (path) => fs.readFileSync(path, "utf8");
function check(ok, message) {
  checks.push({ ok, message });
  if (!ok) console.error(`FAIL #884: ${message}`);
}
const admin = read("components/enterprise/identity-links/enterprise-identity-admin-panel.tsx");
const detail = read("components/enterprise/identity-links/identity-admin-detail.tsx");
const relationships = read("components/enterprise/identity-links/relationship-overview-panel.tsx");
const route = read("app/api/enterprise/[organizationId]/identity-links/[linkId]/overview/route.ts");
const parties = read("app/api/enterprise/[organizationId]/business-parties/route.ts");
const crm = read("components/enterprise/professional/enterprise-customers-workspace.tsx");
const back = read("components/workspace/contextual-back-button.tsx");
const header = read("components/workspace/module-workspace.tsx");

check(admin.includes("onOpen={() => openLink(link.id)}") && admin.includes("IdentityAdminDetail"), "Each admin relation opens an actual full-screen detail");
check(detail.includes("FullscreenEntityDetail") && detail.includes("decision") && detail.includes("revision: link.revision"), "Approvals use the existing revision-guarded identity decision route");
check(detail.includes("candidates.find") && detail.includes("partyType") && !detail.includes("selectedTarget"), "Approval selects its own type-checked business record");
check(detail.includes("notifyToast") && detail.includes("setError(message)"), "Errors keep the form open and use global toast feedback");
check(parties.includes("identityLinks") && parties.includes("referencesByParty"), "CRM returns all relations for a party, not only the last person reference");
check(crm.includes("RelationshipOverviewPanel") && crm.includes("partyId={detail.id}"), "CRM detail exposes related benefits and usage");
check(route.includes('activeOrganizationId !== organizationId') && route.includes('action: "read"'), "Overview checks active organization and CRM reader permissions");
check(route.includes("businessPartyId: partyId") && route.includes("personIdentityId: link.personIdentityId"), "Overview enforces party ownership of the relationship");
check(route.includes("take: 20") && route.includes("skip: (page - 1) * 20"), "Usage timeline paginated on the server");
check(route.includes("effectAmount") && route.includes("executedAt") && route.includes("status"), "Effective consumption stays distinguishable from approval");
check(relationships.includes("role=\"tablist\"") && relationships.includes('tab === "HISTORY"'), "Shared relationship detail has summary, benefits, and history tabs");
check(back.includes("safeInternalPath") && back.includes("returnTo") && !back.includes("localStorage"), "Back navigation rejects external redirects and avoids global persistence");
check(header.includes("ContextualBackButton") && header.includes("data-workspace-back-action"), "Shared module headers expose a contextual back control");
check(fs.existsSync("lib/enterprise/identity-links/overview-copy.ts"), "Bilingual shared identity overview dictionary exists");
const failed = checks.filter((item) => !item.ok);
console.log(`Hotfix #884 static contract: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
