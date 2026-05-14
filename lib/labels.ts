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
  INACTIVE: "Inactif",
  ONBOARDING: "Intégration",
  ON_LEAVE: "En congé",
  EXITED: "Sorti",
  PERMANENT: "Permanent",
  CONSULTANT: "Consultant",
  PART_TIME: "Temps partiel",
  INTERN: "Stagiaire",
  TEMPORARY: "Temporaire",
  COMPLETE: "Complet",
  TO_REVIEW: "À vérifier",
  MISSING_DOCUMENTS: "Documents manquants",
  OPEN_BUDGET: "Budget ouvert",
  MONITORING: "Suivi actif",
  OVER_BUDGET: "Dépassement",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  ARCHIVED: "Archivé",
  IN: "Entrée",
  OUT: "Sortie",
  MANUAL: "Manuel",
  SUBSCRIPTION: "Abonnement",
  PAYROLL: "Paie",
  SCO: "SCO",
  CASH: "Caisse",
  BANK: "Banque",
  MOBILE_MONEY: "Mobile Money",
  PROJECT: "Compte projet",
  OPERATIONS: "Compte opérationnel",
  STOCK: "Stock",
  ASSET: "Actif",
  EQUIPMENT: "Équipement",
  CONSUMABLE: "Consommable",
  SERVICE_TOOL: "Outil de service",
  WATCHLIST: "À surveiller",
  AVAILABLE: "Disponible",
  LOW_STOCK: "Stock faible",
  RESERVED: "Réservé",
  OUT_OF_STOCK: "Rupture",
  ASSIGNED: "Assigné",
  MAINTENANCE: "Maintenance",
  LOST: "Perdu",
  RETIRED: "Retiré",
  NEW: "Neuf",
  GOOD: "Bon",
  FAIR: "Moyen",
  DAMAGED: "Endommagé",
  REPAIR: "Réparation",
  PLANNED: "Planifié",
  BLOCKED: "Bloqué",
  SUBMITTED: "Soumis",
  ORDERED: "Commandé",
  RECEIVED: "Reçu",
  PENDING_REVIEW: "Vérification en attente",
  INSUFFICIENT: "Insuffisant",
  APPROVED: "Approuvé",
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
