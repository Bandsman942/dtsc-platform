export type EnterpriseLocale = "fr" | "en";

type BusinessLabel = { fr: string; en: string };

const BUSINESS_LABELS = {
  "common.status.active": { fr: "Actif", en: "Active" },
  "common.status.inactive": { fr: "Inactif", en: "Inactive" },
  "common.status.archived": { fr: "Archivé", en: "Archived" },
  "common.status.draft": { fr: "Brouillon", en: "Draft" },
  "common.status.pending": { fr: "En attente", en: "Pending" },
  "common.status.approved": { fr: "Approuvé", en: "Approved" },
  "common.status.refused": { fr: "Refusé", en: "Refused" },
  "common.status.cancelled": { fr: "Annulé", en: "Cancelled" },
  "common.status.completed": { fr: "Terminé", en: "Completed" },
  "common.priority.low": { fr: "Faible", en: "Low" },
  "common.priority.normal": { fr: "Normale", en: "Normal" },
  "common.priority.high": { fr: "Élevée", en: "High" },
  "common.priority.critical": { fr: "Critique", en: "Critical" },
  "identity.status.draft": { fr: "Brouillon", en: "Draft" },
  "identity.status.invitationPending": { fr: "Invitation en attente", en: "Invitation pending" },
  "identity.status.requestPending": { fr: "Demande en attente", en: "Request pending" },
  "identity.status.userConsentRequired": { fr: "Consentement utilisateur requis", en: "User consent required" },
  "identity.status.organizationApprovalRequired": { fr: "Approbation de l’entreprise requise", en: "Organization approval required" },
  "identity.status.active": { fr: "Relation active", en: "Active relationship" },
  "identity.status.refused": { fr: "Relation refusée", en: "Relationship refused" },
  "identity.status.expired": { fr: "Invitation expirée", en: "Invitation expired" },
  "identity.status.revoked": { fr: "Autorisation retirée", en: "Permission withdrawn" },
  "identity.status.cancelled": { fr: "Opération annulée", en: "Operation cancelled" },
  "identity.relation.prospect": { fr: "Prospect", en: "Prospect" },
  "identity.relation.customer": { fr: "Client", en: "Customer" },
  "identity.relation.customerContact": { fr: "Contact client", en: "Customer contact" },
  "identity.relation.supplierRepresentative": { fr: "Représentant de fournisseur", en: "Supplier representative" },
  "identity.relation.employee": { fr: "Employé", en: "Employee" },
  "identity.relation.collaborator": { fr: "Collaborateur", en: "Collaborator" },
  "identity.relation.contractor": { fr: "Prestataire", en: "Contractor" },
  "identity.relation.partner": { fr: "Partenaire", en: "Partner" },
  "identity.relation.other": { fr: "Autre relation", en: "Other relationship" },
  "inventory.valuation.weightedAverage": { fr: "Coût moyen pondéré", en: "Weighted average cost" },
  "finance.report.trialBalance": { fr: "Balance générale", en: "Trial balance" },
  "finance.report.generalLedger": { fr: "Grand livre", en: "General ledger" },
  "finance.snapshot": { fr: "Situation enregistrée", en: "Recorded snapshot" },
  "contracts.pendingApproval": { fr: "En attente de validation", en: "Pending approval" },
  "errors.forbidden": { fr: "Vous n’êtes pas autorisé à effectuer cette action.", en: "You are not allowed to perform this action." },
  "errors.invalidPayload": { fr: "Certaines informations sont incomplètes ou invalides.", en: "Some information is incomplete or invalid." },
  "errors.actionFailed": { fr: "L’action n’a pas pu être terminée. Réessayez ou contactez le support.", en: "The action could not be completed. Try again or contact support." },
  "errors.concurrentUpdate": { fr: "Ces informations ont été modifiées entre-temps. Actualisez la page.", en: "This information changed in the meantime. Refresh the page." },
} as const satisfies Record<string, BusinessLabel>;

export type EnterpriseBusinessLabelKey = keyof typeof BUSINESS_LABELS;

export function getEnterpriseBusinessLabel(
  key: EnterpriseBusinessLabelKey,
  locale?: string | null,
) {
  return locale === "en" ? BUSINESS_LABELS[key].en : BUSINESS_LABELS[key].fr;
}

export function hasEnterpriseBusinessLabel(key: string): key is EnterpriseBusinessLabelKey {
  return key in BUSINESS_LABELS;
}

const SERVER_STATUS_TO_LABEL: Record<string, EnterpriseBusinessLabelKey> = {
  ACTIVE: "common.status.active",
  INACTIVE: "common.status.inactive",
  ARCHIVED: "common.status.archived",
  DRAFT: "common.status.draft",
  PENDING: "common.status.pending",
  PENDING_APPROVAL: "contracts.pendingApproval",
  APPROVED: "common.status.approved",
  REFUSED: "common.status.refused",
  CANCELLED: "common.status.cancelled",
  COMPLETED: "common.status.completed",
  INVITATION_PENDING: "identity.status.invitationPending",
  REQUEST_PENDING: "identity.status.requestPending",
  USER_CONSENT_REQUIRED: "identity.status.userConsentRequired",
  ORGANIZATION_APPROVAL_REQUIRED: "identity.status.organizationApprovalRequired",
  EXPIRED: "identity.status.expired",
  REVOKED: "identity.status.revoked",
};

export function getControlledStatusLabel(status: string, locale?: string | null) {
  const key = SERVER_STATUS_TO_LABEL[status];
  return key ? getEnterpriseBusinessLabel(key, locale) : null;
}
