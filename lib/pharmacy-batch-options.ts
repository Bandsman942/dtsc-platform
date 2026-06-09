export const PHARMACY_BATCH_STATUSES = ["ACTIVE", "DEPLETED", "NEAR_EXPIRY", "EXPIRED", "QUARANTINED", "RECALLED", "BLOCKED", "CANCELLED"] as const;
export const PHARMACY_BATCH_MANUAL_STATUSES = ["ACTIVE", "QUARANTINED", "RECALLED", "BLOCKED", "CANCELLED"] as const;
export const PHARMACY_BATCH_STORAGE_CONDITIONS = ["AMBIENT", "REFRIGERATED", "FROZEN", "PROTECTED_FROM_LIGHT", "DRY_PLACE", "CONTROLLED"] as const;
export const PHARMACY_BATCH_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  DEPLETED: "Épuisé",
  NEAR_EXPIRY: "Proche péremption",
  EXPIRED: "Expiré",
  QUARANTINED: "En quarantaine",
  RECALLED: "Rappelé",
  BLOCKED: "Bloqué",
  CANCELLED: "Annulé",
  AMBIENT: "Température ambiante",
  REFRIGERATED: "Réfrigéré",
  FROZEN: "Congelé",
  PROTECTED_FROM_LIGHT: "Protégé de la lumière",
  DRY_PLACE: "Endroit sec",
  CONTROLLED: "Conservation contrôlée",
};
