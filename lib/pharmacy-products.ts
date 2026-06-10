export const PHARMACY_PRODUCT_CATEGORIES = [
  "MEDICINE", "GENERIC_MEDICINE", "SPECIALTY_MEDICINE", "MEDICAL_CONSUMABLE", "MEDICAL_DEVICE", "LAB_PRODUCT",
  "HYGIENE_PRODUCT", "COSMETIC_PRODUCT", "SUPPLEMENT_NUTRITION", "LIGHT_MEDICAL_EQUIPMENT", "OTHER",
] as const;

export const PHARMACY_PRODUCT_FORMS = [
  "TABLET", "CAPSULE", "SYRUP", "ORAL_SUSPENSION", "INJECTABLE_SOLUTION", "OINTMENT", "CREAM", "GEL", "EYE_DROPS",
  "DROPS", "SUPPOSITORY", "SACHET", "SPRAY", "INHALER", "DRESSING", "BANDAGE", "SYRINGE", "OTHER",
] as const;

export const PHARMACY_ADMINISTRATION_ROUTES = ["ORAL", "INJECTABLE", "CUTANEOUS", "OPHTHALMIC", "AURICULAR", "NASAL", "RECTAL", "VAGINAL", "INHALED", "OTHER"] as const;
export const PHARMACY_PRODUCT_UNITS = ["UNIT", "BOX", "BLISTER", "BOTTLE", "VIAL", "AMPOULE", "TUBE", "SACHET", "PACK", "ML", "L", "MG", "G", "KG", "OTHER"] as const;
export const PHARMACY_STORAGE_TYPES = ["AMBIENT", "REFRIGERATED", "FROZEN", "LIGHT_PROTECTED", "HUMIDITY_PROTECTED", "SPECIFIC", "OTHER"] as const;
export const PHARMACY_PRODUCT_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const PHARMACY_CURRENCIES = ["USD", "CDF", "EUR"] as const;

export const PHARMACY_PRODUCT_LABELS: Record<string, string> = {
  MEDICINE: "Médicament", GENERIC_MEDICINE: "Médicament générique", SPECIALTY_MEDICINE: "Médicament spécialité",
  MEDICAL_CONSUMABLE: "Consommable médical", MEDICAL_DEVICE: "Dispositif médical", LAB_PRODUCT: "Produit laboratoire",
  HYGIENE_PRODUCT: "Produit hygiène", COSMETIC_PRODUCT: "Produit cosmétique", SUPPLEMENT_NUTRITION: "Complément / nutrition",
  LIGHT_MEDICAL_EQUIPMENT: "Matériel médical léger", OTHER: "Autre", TABLET: "Comprimé", CAPSULE: "Gélule", SYRUP: "Sirop",
  ORAL_SUSPENSION: "Suspension buvable", INJECTABLE_SOLUTION: "Solution injectable", OINTMENT: "Pommade", CREAM: "Crème",
  GEL: "Gel", EYE_DROPS: "Collyre", DROPS: "Gouttes", SUPPOSITORY: "Suppositoire", SACHET: "Sachet", SPRAY: "Spray",
  INHALER: "Inhalateur", DRESSING: "Pansement", BANDAGE: "Bande", SYRINGE: "Seringue", ORAL: "Orale",
  INJECTABLE: "Injectable", CUTANEOUS: "Cutanée", OPHTHALMIC: "Ophtalmique", AURICULAR: "Auriculaire", NASAL: "Nasale",
  RECTAL: "Rectale", VAGINAL: "Vaginale", INHALED: "Inhalée", UNIT: "Unité", BOX: "Boîte", BLISTER: "Plaquette",
  BOTTLE: "Flacon", VIAL: "Fiole", AMPOULE: "Ampoule", TUBE: "Tube", PACK: "Paquet", ML: "ml", L: "L", MG: "mg",
  G: "g", KG: "kg", AMBIENT: "Température ambiante", REFRIGERATED: "Réfrigéré", FROZEN: "Congelé",
  LIGHT_PROTECTED: "À l'abri de la lumière", HUMIDITY_PROTECTED: "À l'abri de l'humidité", SPECIFIC: "Conditions spécifiques",
  ACTIVE: "Actif", INACTIVE: "Inactif", SUSPENDED: "Suspendu", ARCHIVED: "Archivé",
  prescriptionRequired: "Ordonnance obligatoire", controlledProduct: "Produit soumis à contrôle renforcé", refrigerated: "Conservation au réfrigérateur",
  name: "Nom commercial", category: "Catégorie", status: "Statut du produit", createdAt: "Date de création",
};
