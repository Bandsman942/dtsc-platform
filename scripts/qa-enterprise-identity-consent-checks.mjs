import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const failures = [];
const requireFile = (relativePath) => {
  if (!exists(relativePath)) {
    failures.push(`Fichier obligatoire absent : ${relativePath}`);
    return "";
  }
  return read(relativePath);
};
const requireMarker = (content, marker, context) => {
  if (!content.includes(marker)) failures.push(`${context} doit contenir : ${marker}`);
};

const schema = requireFile("prisma/enterprise-identity-consent.prisma");
const migration = requireFile("prisma/migrations/20260801143000_add_enterprise_identity_consent/migration.sql");
const contract = requireFile("lib/enterprise/identity-links/contracts.ts");
const service = requireFile("lib/enterprise/identity-links/service.ts");
const schemas = requireFile("lib/enterprise/identity-links/schemas.ts");
const invitationRoute = requireFile("app/api/enterprise/[organizationId]/identity-link-invitations/route.ts");
const requestRoute = requireFile("app/api/enterprise/[organizationId]/identity-link-requests/route.ts");
const adminDecisionRoute = requireFile("app/api/enterprise/[organizationId]/identity-links/[linkId]/decision/route.ts");
const userDecisionRoute = requireFile("app/api/account/identity-links/decision/route.ts");
const adminUi = requireFile("components/enterprise/identity-links/enterprise-identity-admin-panel.tsx");
const userUi = requireFile("components/enterprise/identity-links/enterprise-identity-user-panel.tsx");

for (const model of [
  "EnterprisePersonIdentity",
  "EnterprisePersonBusinessReference",
  "EnterpriseIdentityLink",
  "EnterpriseIdentityConsentRecord",
  "EnterpriseIdentityLinkEvent",
]) {
  requireMarker(schema, `model ${model}`, "Schéma Prisma du consentement");
}
for (const field of [
  "organizationId",
  "personIdentityId",
  "userId",
  "origin",
  "requestedRelationType",
  "status",
  "purpose",
  "consentTextVersion",
  "invitationTokenDigest",
  "expiresAt",
  "revocationReason",
  "revision",
]) {
  requireMarker(schema, field, "Contrat de liaison");
}
requireMarker(migration, "EnterprisePersonBusinessReference_one_target_check", "Migration d’intégrité");
requireMarker(migration, "EnterpriseIdentityLink_active_person_user_key", "Migration anti-doublon actif");
requireMarker(migration, "EnterpriseIdentityLink_org_person_fkey", "Migration tenant-aware");
requireMarker(migration, "EnterprisePersonBusinessReference_contact_fkey", "Relation représentant de fournisseur");
requireMarker(migration, "No existing party, employee, member or user row is linked automatically", "Migration sans backfill de consentement");

for (const status of [
  "INVITATION_PENDING",
  "ORGANIZATION_APPROVAL_REQUIRED",
  "ACTIVE",
  "REFUSED",
  "EXPIRED",
  "REVOKED",
  "CANCELLED",
]) {
  requireMarker(contract, `\"${status}\"`, "Machine d’état du consentement");
}
for (const relationType of [
  "PROSPECT",
  "CUSTOMER",
  "SUPPLIER_REPRESENTATIVE",
  "EMPLOYEE",
  "COLLABORATOR",
  "CONTRACTOR",
  "PARTNER",
]) {
  requireMarker(contract, `\"${relationType}\"`, "Types de relation");
}

for (const serviceFunction of [
  "createEnterpriseIdentityInvitation",
  "createUserInitiatedIdentityRequest",
  "acceptEnterpriseIdentityInvitation",
  "refuseEnterpriseIdentityInvitation",
  "approveUserInitiatedIdentityRequest",
  "refuseUserInitiatedIdentityRequest",
  "revokeEnterpriseIdentityLink",
  "cancelEnterpriseIdentityLink",
  "listOrganizationIdentityLinks",
  "listUserIdentityLinks",
]) {
  requireMarker(service, `function ${serviceFunction}`, "Service centralisé du consentement");
}
requireMarker(service, "randomBytes(32)", "Token d’invitation fort");
requireMarker(service, "invitationTokenDigest", "Token stocké sous forme de condensat");
requireMarker(service, "invitationTokenDigest: null", "Token à usage unique");
requireMarker(service, "invitationEmailDigest", "Recherche exacte et privée");
requireMarker(service, "IDENTITY_LINK_CONCURRENT_UPDATE", "Protection contre la concurrence");
requireMarker(service, "enterpriseIdentityConsentRecord.create", "Preuve de consentement versionnée");
requireMarker(service, "enterpriseIdentityLinkEvent.create", "Journal de transitions");
requireMarker(service, "notifyUser", "Notification privée");
requireMarker(service, "notifyUsers", "Notification des administrateurs autorisés");
requireMarker(service, "sendZohoOutboundMail", "Invitation à créer un compte");
requireMarker(service, "SUPPLIER_REPRESENTATIVE_REQUIRES_PERSON", "Protection des fournisseurs personnes morales");
if (service.includes("user.findMany")) failures.push("Le service ne doit jamais parcourir l’annuaire global des utilisateurs.");
if (/primaryEmail\s*:\s*user\.email/.test(service)) failures.push("Une demande utilisateur ne doit pas synchroniser silencieusement l’email global dans la fiche entreprise.");

requireMarker(schemas, "requireExactlyOneBusinessTarget", "Validation d’une seule cible métier");
requireMarker(invitationRoute, "rateLimit", "Rate limiting invitation");
requireMarker(invitationRoute, "requireIdentityLinkOrganizationAdmin", "Permission invitation");
requireMarker(requestRoute, "requireIdentityLinkSession", "Session demande utilisateur");
requireMarker(adminDecisionRoute, "APPROVE", "Approbation entreprise");
requireMarker(adminDecisionRoute, "REFUSE", "Refus entreprise");
requireMarker(adminDecisionRoute, "CANCEL", "Annulation entreprise");
requireMarker(userDecisionRoute, "ACCEPT", "Acceptation utilisateur");
requireMarker(userDecisionRoute, "REFUSE", "Refus utilisateur");
requireMarker(userDecisionRoute, "REVOKE", "Révocation utilisateur");
requireMarker(adminUi, "La base globale des utilisateurs DTSC n’est jamais exposée", "Message de confidentialité administration");
requireMarker(userUi, "Vous gardez le contrôle de votre consentement", "Message de consentement utilisateur");

for (const document of [
  "docs/ENTERPRISE_IDENTITY_CONSENT.md",
  "docs/ERP_PROFESSIONAL_MODULE_STANDARD.md",
  "docs/ENTERPRISE_FORM_UX_CONTRACT.md",
]) {
  if (!exists(document)) failures.push(`Documentation obligatoire absente : ${document}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`❌ ${failure}`);
  process.exit(1);
}
console.log("✅ Contrat identité/consentement vérifié : invitation, demande, décision, révocation, confidentialité et concurrence.");
