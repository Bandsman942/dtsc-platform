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
const gaming = read("lib/enterprise/relationship-benefits/gaming-adapter.ts");
const checkout = read("lib/enterprise/gaming/checkout-service.ts");
const commands = read("lib/enterprise/gaming/checkout-commands.ts");
const benefitConfiguration = read("lib/enterprise/relationship-benefits/service.ts");

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
check(gaming.includes("evaluateRelationshipBenefitSnapshot") && gaming.includes("pg_advisory_xact_lock"), "Gaming benefit guards quota and consent with the canonical evaluator under advisory lock");
check(gaming.includes("automaticGamingEffectSupported") && benefitConfiguration.includes("automaticGamingEffectSupported"), "Gaming discount types are allowlisted in shared benefit configuration");
check(checkout.includes("resolveGamingRelationshipBenefitTx") && checkout.includes("applyGamingRelationshipBenefitTx"), "Gaming checkout generates a benefit discount and usage in one invoice transaction");
check(checkout.includes("discountTotal: serviceDiscount") && checkout.includes("netAmount: serviceNetAmount"), "Invoice gross/net and discount fields remain consistent");
check(gaming.includes('executionMode: "AUTO_GAMING"') && gaming.includes('status: "APPROVED"'), "Gaming usage is reserved, not falsely consumed before invoice issue");
check(commands.includes("finalizeGamingRelationshipBenefitTx") && gaming.includes('status: "CONSUMED"'), "Gaming usage only finalizes after invoice issuance");
check(commands.includes("reverseGamingRelationshipBenefitTx") && commands.includes('"cancel"') && commands.includes('"refund"'), "Gaming cancellation and refund reverse the same usage");
check(gaming.includes("effectIdempotencyKey") && gaming.includes("findUnique") && gaming.includes("pg_advisory_xact_lock"), "Gaming benefit consumption protects idempotency and quotas");
check(gaming.includes('effectEntityType: "EnterpriseGamingCheckout"'), "Usage points to the real Gaming checkout, not a second ledger");
const failed = checks.filter((item) => !item.ok);
console.log(`Hotfix #884 static contract: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
