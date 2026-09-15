import type { SectorTemplatePreview } from "@/lib/enterprise-sector-templates";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { GAMING_BUSINESS_SUBTYPE_CODE, GAMING_MODULE_CODES, GAMING_SECTOR_CODE } from "@/lib/enterprise/gaming/domain";

export type GamingTemplateLayer = {
  code: "ERP_COMMON" | "HOSPITALITY_EVENTS" | "GAMING_LOUNGE";
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  modules: Array<{ code: string; labelFr: string; labelEn: string }>;
};

export function buildGamingTemplateLayers(preview: SectorTemplatePreview, businessSubtypeCode: string | null | undefined): GamingTemplateLayer[] | null {
  if (preview.sector.code !== GAMING_SECTOR_CODE || businessSubtypeCode !== GAMING_BUSINESS_SUBTYPE_CODE) return null;
  const commonModules = preview.modules.filter((module) => module.isCore).map((module) => ({ code: module.code, labelFr: module.labelFr, labelEn: module.labelEn }));
  const hospitalityModules = preview.modules.filter((module) => !module.isCore).map((module) => ({ code: module.code, labelFr: module.labelFr, labelEn: module.labelEn }));
  const gamingModules = GAMING_MODULE_CODES.map((code) => {
    const definition = getEnterpriseModuleDefinition(code);
    if (!definition) throw new Error(`GAMING_MODULE_DEFINITION_MISSING:${code}`);
    return { code, labelFr: definition.labelFr, labelEn: definition.labelEn };
  });
  return [
    {
      code: "ERP_COMMON",
      labelFr: "ERP commun",
      labelEn: "Common ERP",
      descriptionFr: "CRM, catalogue, sites, actifs, achats, ventes, Finance, RH, rapports et services transverses selon le plan et les permissions.",
      descriptionEn: "CRM, catalog, sites, assets, procurement, sales, Finance, HR, reports and cross-functional services according to plan and permissions.",
      modules: commonModules,
    },
    {
      code: "HOSPITALITY_EVENTS",
      labelFr: "Hôtellerie / événementiel",
      labelEn: "Hospitality / events",
      descriptionFr: "Couche sectorielle commune HOSPITALITY_EVENTS, sans lecture de données privées d’une entreprise cliente.",
      descriptionEn: "Shared HOSPITALITY_EVENTS sector layer without reading private client-organization data.",
      modules: hospitalityModules,
    },
    {
      code: "GAMING_LOUNGE",
      labelFr: "Gaming Lounge",
      labelEn: "Gaming Lounge",
      descriptionFr: "Postes, sessions, réservations, tarifs, checkout, clôture, tournois, dashboard et rapports Gaming intégrés aux autorités ERP communes.",
      descriptionEn: "Gaming stations, sessions, bookings, pricing, checkout, daily close, tournaments, dashboard and reports integrated with shared ERP authorities.",
      modules: gamingModules,
    },
  ];
}

export function gamingLayerSummaryModules(layers: GamingTemplateLayer[]) {
  return layers.map((layer, index) => ({
    code: `LAYER_${layer.code}`,
    labelFr: `${index + 1}. ${layer.labelFr} — ${layer.modules.length} modules`,
    labelEn: `${index + 1}. ${layer.labelEn} — ${layer.modules.length} modules`,
    category: layer.code,
    icon: null,
    isCore: layer.code === "ERP_COMMON",
  }));
}
