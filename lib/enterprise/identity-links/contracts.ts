export const ENTERPRISE_IDENTITY_CONSENT_VERSION = "2026-08-01.v1";
export const ENTERPRISE_IDENTITY_INVITATION_TTL_DAYS = 7;

export const ENTERPRISE_IDENTITY_RELATION_TYPES = [
  "PROSPECT",
  "CUSTOMER",
  "CUSTOMER_CONTACT",
  "SUPPLIER_REPRESENTATIVE",
  "EMPLOYEE",
  "COLLABORATOR",
  "CONTRACTOR",
  "PARTNER",
  "OTHER",
] as const;

export type EnterpriseIdentityRelationType = (typeof ENTERPRISE_IDENTITY_RELATION_TYPES)[number];

export const ENTERPRISE_IDENTITY_LINK_STATUSES = [
  "DRAFT",
  "INVITATION_PENDING",
  "REQUEST_PENDING",
  "USER_CONSENT_REQUIRED",
  "ORGANIZATION_APPROVAL_REQUIRED",
  "ACTIVE",
  "REFUSED",
  "EXPIRED",
  "REVOKED",
  "CANCELLED",
] as const;

export type EnterpriseIdentityLinkStatus = (typeof ENTERPRISE_IDENTITY_LINK_STATUSES)[number];

export const ENTERPRISE_IDENTITY_STATUS_TRANSITIONS: Record<
  EnterpriseIdentityLinkStatus,
  readonly EnterpriseIdentityLinkStatus[]
> = {
  DRAFT: ["INVITATION_PENDING", "REQUEST_PENDING", "CANCELLED"],
  INVITATION_PENDING: ["ACTIVE", "REFUSED", "EXPIRED", "CANCELLED"],
  REQUEST_PENDING: ["ORGANIZATION_APPROVAL_REQUIRED", "CANCELLED"],
  USER_CONSENT_REQUIRED: ["ACTIVE", "REFUSED", "EXPIRED", "CANCELLED"],
  ORGANIZATION_APPROVAL_REQUIRED: ["ACTIVE", "REFUSED", "CANCELLED"],
  ACTIVE: ["REVOKED"],
  REFUSED: [],
  EXPIRED: [],
  REVOKED: [],
  CANCELLED: [],
};

export function canTransitionEnterpriseIdentityLink(
  from: EnterpriseIdentityLinkStatus,
  to: EnterpriseIdentityLinkStatus,
) {
  return ENTERPRISE_IDENTITY_STATUS_TRANSITIONS[from].includes(to);
}

export function getEnterpriseIdentityRelationLabel(
  relationType: EnterpriseIdentityRelationType,
  locale?: string | null,
) {
  const english = locale === "en";
  const labels: Record<EnterpriseIdentityRelationType, { fr: string; en: string }> = {
    PROSPECT: { fr: "Prospect", en: "Prospect" },
    CUSTOMER: { fr: "Client", en: "Customer" },
    CUSTOMER_CONTACT: { fr: "Contact client", en: "Customer contact" },
    SUPPLIER_REPRESENTATIVE: { fr: "Représentant de fournisseur", en: "Supplier representative" },
    EMPLOYEE: { fr: "Employé", en: "Employee" },
    COLLABORATOR: { fr: "Collaborateur", en: "Collaborator" },
    CONTRACTOR: { fr: "Prestataire", en: "Contractor" },
    PARTNER: { fr: "Partenaire", en: "Partner" },
    OTHER: { fr: "Autre relation", en: "Other relationship" },
  };
  return english ? labels[relationType].en : labels[relationType].fr;
}

export function getEnterpriseIdentityStatusLabel(
  status: EnterpriseIdentityLinkStatus,
  locale?: string | null,
) {
  const english = locale === "en";
  const labels: Record<EnterpriseIdentityLinkStatus, { fr: string; en: string }> = {
    DRAFT: { fr: "Brouillon", en: "Draft" },
    INVITATION_PENDING: { fr: "Invitation en attente", en: "Invitation pending" },
    REQUEST_PENDING: { fr: "Demande en attente", en: "Request pending" },
    USER_CONSENT_REQUIRED: { fr: "Consentement utilisateur requis", en: "User consent required" },
    ORGANIZATION_APPROVAL_REQUIRED: { fr: "Approbation de l’entreprise requise", en: "Organization approval required" },
    ACTIVE: { fr: "Relation active", en: "Active relationship" },
    REFUSED: { fr: "Refusée", en: "Refused" },
    EXPIRED: { fr: "Expirée", en: "Expired" },
    REVOKED: { fr: "Révoquée", en: "Revoked" },
    CANCELLED: { fr: "Annulée", en: "Cancelled" },
  };
  return english ? labels[status].en : labels[status].fr;
}

export function buildEnterpriseIdentityConsentStatement({
  organizationName,
  relationType,
  purpose,
  locale,
}: {
  organizationName: string;
  relationType: EnterpriseIdentityRelationType;
  purpose: string;
  locale?: string | null;
}) {
  const relationLabel = getEnterpriseIdentityRelationLabel(relationType, locale).toLocaleLowerCase(locale === "en" ? "en" : "fr");
  if (locale === "en") {
    return `${organizationName} wants to link your DTSC account to a ${relationLabel} business record in its workspace for this purpose: ${purpose}. Only the information required for this relationship will be shared. You may withdraw this permission later.`;
  }
  return `${organizationName} souhaite relier votre compte DTSC à une fiche métier de type ${relationLabel} dans son espace pour la finalité suivante : ${purpose}. Seules les informations nécessaires à cette relation seront partagées. Vous pourrez retirer cette autorisation ultérieurement.`;
}

export function buildEnterpriseIdentityRevocationStatement(locale?: string | null) {
  return locale === "en"
    ? "This action disconnects your DTSC account from the business record. Documents and operations the organization is allowed or required to retain are not deleted automatically."
    : "Cette action déconnecte votre compte DTSC de la fiche métier. Les documents et opérations que l’entreprise est autorisée ou tenue de conserver ne sont pas automatiquement supprimés.";
}
