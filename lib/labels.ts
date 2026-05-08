export const roleLabels = {
  ADMIN: "Administrateur",
  MANAGER: "Manager",
  CLIENT: "Client",
  SUPPORT: "Support",
} as const;

export const statusLabels = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  PENDING: "En attente",
  OPEN: "Ouvert",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
  CLOSED: "Clôturé",
  LOW: "Faible",
  MEDIUM: "Moyenne",
  HIGH: "Haute",
  URGENT: "Urgente",
  CRITICAL: "Critique",
  PROCESSING: "Traitement en cours",
  READY: "Prêt",
  FAILED: "Échec",
  ACCEPTED: "Accepté",
  PAID: "Payé",
  CANCELED: "Annulé",
  DRAFT: "Brouillon",
  ISSUED: "Émise",
  PAST_DUE: "En retard",
  EXPIRED: "Expiré",
  PENDING_PAYMENT: "Paiement en attente",
  CANCELED_SUBSCRIPTION: "Abonnement annulé",
} as const;

export const publicationCategoryLabels = {
  RESSOURCE: "Ressource",
  ARTICLE: "Article",
  GUIDE: "Guide",
  CAS_PRATIQUE: "Cas pratique",
  ANNONCE: "Annonce",
  PROJET: "Projet",
} as const;

export function formatEnumLabel(value: string) {
  const explicit =
    roleLabels[value as keyof typeof roleLabels] ||
    statusLabels[value as keyof typeof statusLabels] ||
    publicationCategoryLabels[value as keyof typeof publicationCategoryLabels];

  if (explicit) {
    return explicit;
  }

  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
