export const BUSINESS_SUBTYPE_IMPLEMENTATION_STATUSES = ["ACTIVE", "PLANNED"] as const;
export type BusinessSubtypeImplementationStatus = (typeof BUSINESS_SUBTYPE_IMPLEMENTATION_STATUSES)[number];

export const BUSINESS_SUBTYPE_CODES = [
  "SHOP", "SUPERMARKET_GROCERY", "FASHION_ACCESSORIES", "ELECTRONICS_PHONES",
  "BEAUTY_COSMETICS", "HARDWARE_DIY", "AUTO_PARTS", "BOOKS_STATIONERY",
  "FURNITURE_APPLIANCES", "FRESH_FOOD", "TAILORING_APPAREL", "GAMING_LOUNGE",
] as const;
export type BusinessSubtypeCode = (typeof BUSINESS_SUBTYPE_CODES)[number];

export type BusinessSubtypeDefinition = {
  sectorCode: string;
  code: BusinessSubtypeCode;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  implementationStatus: BusinessSubtypeImplementationStatus;
};

/**
 * Canonical cross-sector business subtype registry.
 *
 * The registry owns classification only. Module scope, provisioning and runtime
 * behavior remain owned by the relevant sector implementation. A PLANNED subtype
 * may be documented here before it becomes selectable, but must never be exposed
 * as ACTIVE without its real model/service/route/workspace/permission/entitlement/QA contract.
 */
export const BUSINESS_SUBTYPES = [
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "SHOP",
    labelFr: "Shop",
    labelEn: "Shop",
    descriptionFr: "Commerce de détail avec point de vente, clôture Retail et extensions opérateur déjà disponibles dans DTSC Platform.",
    descriptionEn: "Retail shop with point of sale, Retail close and operator extensions already available in DTSC Platform.",
    implementationStatus: "ACTIVE",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "SUPERMARKET_GROCERY",
    labelFr: "Supermarchés & supérettes",
    labelEn: "Supermarkets & grocery",
    descriptionFr: "À développer : produits pesés, codes PLU, rayons, péremptions, promotions et réapprovisionnement.",
    descriptionEn: "Planned: weighted goods, PLU codes, aisles, expiry control, promotions and replenishment.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "FASHION_ACCESSORIES",
    labelFr: "Mode & accessoires",
    labelEn: "Fashion & accessories",
    descriptionFr: "À développer : tailles, couleurs, collections, variantes et échanges.",
    descriptionEn: "Planned: sizes, colors, collections, product variants and exchanges.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "ELECTRONICS_PHONES",
    labelFr: "Électronique & téléphones",
    labelEn: "Electronics & phones",
    descriptionFr: "À développer : suivi IMEI et numéros de série, garanties, SAV et réparations.",
    descriptionEn: "Planned: IMEI and serial tracking, warranties, after-sales service and repairs.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "BEAUTY_COSMETICS",
    labelFr: "Cosmétiques & parfumerie",
    labelEn: "Beauty & cosmetics",
    descriptionFr: "À développer : suivi des lots, nuances, testeurs, coffrets et fidélité.",
    descriptionEn: "Planned: lot tracking, product shades, testers, gift sets and loyalty.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "HARDWARE_DIY",
    labelFr: "Quincaillerie & bricolage",
    labelEn: "Hardware & DIY",
    descriptionFr: "À développer : vente au mètre, au poids ou à l'unité, devis de chantier et livraisons.",
    descriptionEn: "Planned: sales by length, weight or unit, project quotes and deliveries.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "AUTO_PARTS",
    labelFr: "Pièces détachées automobiles",
    labelEn: "Automotive spare parts",
    descriptionFr: "À développer : compatibilités véhicules, références équivalentes et commandes spéciales.",
    descriptionEn: "Planned: vehicle compatibility, equivalent parts and special orders.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "BOOKS_STATIONERY",
    labelFr: "Librairie & papeterie",
    labelEn: "Books & stationery",
    descriptionFr: "À développer : ISBN, éditions, listes scolaires, kits et commandes institutionnelles.",
    descriptionEn: "Planned: ISBN, editions, school lists, bundles and institutional orders.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "FURNITURE_APPLIANCES",
    labelFr: "Meubles & électroménagers",
    labelEn: "Furniture & appliances",
    descriptionFr: "À développer : commandes personnalisées, acomptes, livraison, installation et garanties.",
    descriptionEn: "Planned: custom orders, deposits, delivery, installation and warranties.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "FRESH_FOOD",
    labelFr: "Produits frais & alimentation spécialisée",
    labelEn: "Fresh & specialty foods",
    descriptionFr: "À développer : traçabilité de lots, DLC, pesées, pertes et préparation des commandes.",
    descriptionEn: "Planned: batch traceability, expiry dates, weighing, waste and order preparation.",
    implementationStatus: "PLANNED",
  },
  {
    sectorCode: "MANUFACTURING",
    code: "TAILORING_APPAREL",
    labelFr: "Couture, confection & habillement",
    labelEn: "Tailoring, garment making & apparel",
    descriptionFr: "Sous-secteur Manufacturing pour les ateliers de couture, la confection sur mesure, le prêt-à-porter et les activités mixtes, intégré au moteur Manufacturing et aux sources ERP communes.",
    descriptionEn: "Manufacturing subtype for tailoring workshops, made-to-measure, ready-to-wear and mixed apparel operations, integrated with Manufacturing Core and shared ERP sources.",
    implementationStatus: "ACTIVE",
  },
  {
    sectorCode: "HOSPITALITY_EVENTS",
    code: "GAMING_LOUNGE",
    labelFr: "Salle de jeux / Gaming Lounge",
    labelEn: "Gaming lounge",
    descriptionFr: "Sous-secteur loisirs pour salles de jeux, consoles et e-sport vendant du temps d’utilisation de postes, avec réservations, sessions, tarification, encaissement et maintenance intégrés aux sources ERP communes.",
    descriptionEn: "Leisure subtype for gaming lounges, consoles and e-sport businesses selling station usage time, with bookings, sessions, pricing, checkout and maintenance integrated with shared ERP sources.",
    implementationStatus: "ACTIVE",
  },
] as const satisfies readonly BusinessSubtypeDefinition[];

function normalizeSectorCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() || "";
}

export function isBusinessSubtypeCode(value: string | null | undefined): value is BusinessSubtypeCode {
  const normalized = value?.trim().toUpperCase() || "";
  return BUSINESS_SUBTYPE_CODES.includes(normalized as BusinessSubtypeCode);
}

export function normalizeBusinessSubtypeCode(value: string | null | undefined): BusinessSubtypeCode | null {
  const normalized = value?.trim().toUpperCase() || "";
  return isBusinessSubtypeCode(normalized) ? normalized : null;
}

export function listBusinessSubtypesForSector(
  sectorCode: string | null | undefined,
  options: { includePlanned?: boolean } = {},
) {
  const normalizedSector = normalizeSectorCode(sectorCode);
  return BUSINESS_SUBTYPES.filter((subtype) => {
    if (subtype.sectorCode !== normalizedSector) return false;
    return options.includePlanned || subtype.implementationStatus === "ACTIVE";
  });
}

export function getBusinessSubtypeForSector(
  sectorCode: string | null | undefined,
  subtypeCode: string | null | undefined,
  options: { includePlanned?: boolean } = {},
) {
  const normalizedSubtype = normalizeBusinessSubtypeCode(subtypeCode);
  if (!normalizedSubtype) return null;
  return listBusinessSubtypesForSector(sectorCode, options).find((subtype) => subtype.code === normalizedSubtype) || null;
}

export function businessSubtypeBelongsToSector(
  sectorCode: string | null | undefined,
  subtypeCode: string | null | undefined,
  options: { includePlanned?: boolean } = {},
) {
  return Boolean(getBusinessSubtypeForSector(sectorCode, subtypeCode, options));
}
