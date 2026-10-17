import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const load = (path) => readFileSync(path, "utf8");
const contains = (file, ...fragments) => {
  const c = load(file);
  for (const fragment of fragments) assert.ok(c.includes(fragment), `${file}: missing ${fragment}`);
  return c;
};

const contract = contains("lib/enterprise/identity-links/contracts.ts",
  '"SUPPLIER",', 'SUPPLIER: { fr: "Fournisseur", en: "Supplier" }',
  'SUPPLIER_REPRESENTATIVE:', 'OTHER: { fr: "Autre relation"');
const access = contains("lib/enterprise/identity-links/access.ts", "SUPPLIER: [", "SUPPLIER_REPRESENTATIVE:");
assert.ok(contract.includes('buildEnterpriseIdentityConsentStatement'), "Original consent statement contract must remain");
assert.ok(access.includes('"SUPPLIER_SERVICES"'), "Supplier capability must use existing resolver");

const projection = contains("lib/enterprise/identity-links/person-projection.ts",
  "businessPartyId", 'partyType: "PERSON"', "supplierLink",
  "enterprisePersonBusinessReference.findMany", 'status: "ACTIVE"', "archivedAt: null",
  "enterpriseIdentityLink.findMany", "personIdentityId: { in:", "enterprisePersonIdentity.updateMany",
  "enterpriseIdentityLinkEvent.create", "PERSON_IDENTITY_DISPLAY_SYNCHRONIZED");
assert.ok(!projection.includes("findUnique({ where: { email"), "Email alone must never link a person");
assert.ok(!projection.includes("enterpriseIdentityConsentRecord.update"), "Consent evidence must be immutable");
assert.ok(!projection.includes("requestedRelationType:"), "Never reclassify accepted consent silently");
contains("lib/enterprise/master-data/service.ts",
  "await synchronizeLinkedPersonIdentityTx(tx, organizationId, partyId, actorUserId);",
  "await refreshLinkedSupplierSnapshotFromPartyTx(tx, organizationId, partyId, actorUserId);");
contains("lib/enterprise/procurement/supplier-service.ts",
  "await synchronizeLinkedPersonIdentityTx(tx, organizationId, convergence.party.id, actorUserId);",
  "await syncCanonicalPartyFromSupplierTx(tx, organizationId, actorUserId, current");

const service = contains("lib/enterprise/identity-links/service.ts",
  "SUPPLIER_REQUIRES_PERSON", 'roleCode: "SUPPLIER"',
  "businessRoleSupplier:", "supplierPersonKeys",
  'relationType: target.relationType', "consentTextVersion: input.consentTextVersion",
  "enterpriseIdentityConsentRecord.create");
assert.ok(service.includes('requestedRelationType: input.relationType'), "New request must persist the explicit choice, not a derived role");

contains("components/enterprise/professional/enterprise-customers-workspace.tsx",
  'if (roles.includes("SUPPLIER")) return "SUPPLIER"');
contains("components/enterprise/core-v2/enterprise-suppliers-workspace.tsx",
  'relationType: "SUPPLIER", purpose: t("suppliers.invitationPurpose.individual")',
  'relationType: "SUPPLIER_REPRESENTATIVE", purpose: t("suppliers.invitationPurpose.contact")');

const account = contains("components/enterprise/identity-links/enterprise-identity-user-panel.tsx",
  "businessRoleSupplier", "Fournisseur (rôle métier)", "Autre relation (consentement)",
  "initialOrganizationCode", "subscribeEnterpriseCrmUpdates");
assert.ok(account.includes('name="organizationCode"'), "User request must keep existing API");
contains("components/enterprise/enterprise-administration-module.tsx",
  "<EnterpriseRelationshipCodePanel code={organization.slug} locale={locale} />");
contains("lib/enterprise/enterprise-admin-loader.ts",
  "getEnterpriseOrganizationForAdmin", "slug: true");
contains("lib/enterprise/enterprise-admin-types.ts", "slug: string | null;");
const codePanel = contains("components/enterprise/identity-links/enterprise-relationship-code-panel.tsx",
  "navigator.clipboard.writeText", "/enterprise-links?view=requests&code=",
  "Aucun accès ERP n’est accordé automatiquement", "code: string | null");
assert.ok(!codePanel.includes("organizationId = "), "Invitation link must never contain a tenant secret");
contains("app/enterprise-links/page.tsx",
  "initialOrganizationCode", 'code && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(code)',
  'initialView={initialOrganizationCode ? "requests" : view}');
contains("app/api/account/identity-link-requests/route.ts",
  "slug: parsed.data.organizationCode.toLowerCase()", 'organizationType: "CLIENT"',
  "createUserInitiatedIdentityRequest");
console.log("Hotfix #869: supplier person identity, consent immutability, company-code sharing and tenant-scoped CRM notification contracts OK.");
