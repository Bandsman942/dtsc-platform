export const CERTIFIED_FORM_IMPORT_TARGETS = {
  ASSETS: { segment: "assets", label: "Actifs" },
  ASSET_CATEGORIES: { segment: "asset-categories", label: "Catégories d’actifs" },
  BUSINESS_PARTIES: { segment: "business-parties", label: "Tiers commerciaux" },
  CATALOG: { segment: "catalog", label: "Catalogue" },
  CATALOG_CATEGORIES: { segment: "catalog-categories", label: "Catégories du catalogue" },
  LEADS: { segment: "leads", label: "Prospects" },
  OPPORTUNITIES: { segment: "opportunities", label: "Opportunités" },
  PROJECTS: { segment: "projects", label: "Projets" },
  SITES: { segment: "sites", label: "Sites" },
  SUPPLIERS: { segment: "suppliers", label: "Fournisseurs" },
  UNITS_OF_MEASURE: { segment: "units-of-measure", label: "Unités de mesure" },
  WAREHOUSES: { segment: "warehouses", label: "Entrepôts" },
} as const;

export type CertifiedFormImportCode = keyof typeof CERTIFIED_FORM_IMPORT_TARGETS;

export const CERTIFIED_FORM_IMPORT_CODES = Object.keys(CERTIFIED_FORM_IMPORT_TARGETS) as CertifiedFormImportCode[];

export function getCertifiedFormImportTarget(code: string) {
  return CERTIFIED_FORM_IMPORT_TARGETS[code as CertifiedFormImportCode] || null;
}
