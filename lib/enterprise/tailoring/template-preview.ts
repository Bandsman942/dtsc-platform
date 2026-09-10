import type { SectorTemplatePreview } from "@/lib/enterprise-sector-templates";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { TAILORING_BUSINESS_SUBTYPE_CODE, TAILORING_MODULE_CODES } from "@/lib/enterprise/tailoring/constants";

export type TailoringTemplateLayer = {
  code: "ERP_COMMON" | "MANUFACTURING_CORE" | "TAILORING_APPAREL";
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  modules: Array<{ code: string; labelFr: string; labelEn: string }>;
};

export function buildTailoringTemplateLayers(
  preview: SectorTemplatePreview,
  businessSubtypeCode: string | null | undefined,
): TailoringTemplateLayer[] | null {
  if (preview.sector.code !== "MANUFACTURING" || businessSubtypeCode !== TAILORING_BUSINESS_SUBTYPE_CODE) return null;

  const commonModules = preview.modules
    .filter((module) => module.isCore)
    .map((module) => ({ code: module.code, labelFr: module.labelFr, labelEn: module.labelEn }));
  const manufacturingModules = preview.modules
    .filter((module) => !module.isCore)
    .map((module) => ({ code: module.code, labelFr: module.labelFr, labelEn: module.labelEn }));
  const tailoringModules = TAILORING_MODULE_CODES.map((code) => {
    const definition = getEnterpriseModuleDefinition(code);
    if (!definition) throw new Error(`TAILORING_MODULE_DEFINITION_MISSING:${code}`);
    return { code, labelFr: definition.labelFr, labelEn: definition.labelEn };
  });

  return [
    {
      code: "ERP_COMMON",
      labelFr: "ERP commun",
      labelEn: "Common ERP",
      descriptionFr: "Référentiels communs : administration, CRM, catalogue, stock, achats, ventes, finance, RH et services transverses selon le plan.",
      descriptionEn: "Shared records: administration, CRM, catalog, inventory, procurement, sales, finance, HR and cross-functional services according to the plan.",
      modules: commonModules,
    },
    {
      code: "MANUFACTURING_CORE",
      labelFr: "Manufacturing Core",
      labelEn: "Manufacturing Core",
      descriptionFr: "Moteur de production : nomenclatures, ordres, gammes, centres de travail, matières, exécution, qualité, rebuts et rapports.",
      descriptionEn: "Production engine: BOMs, orders, routings, work centers, materials, execution, quality, scrap and reporting.",
      modules: manufacturingModules,
    },
    {
      code: "TAILORING_APPAREL",
      labelFr: "Couture, confection & habillement",
      labelEn: "Tailoring, garment making & apparel",
      descriptionFr: "Extension atelier : mensurations, patrons/styles, gradation, tissus, coupe, essayages, retouches, lots de vêtements et finition.",
      descriptionEn: "Workshop extension: measurements, patterns/styles, grading, materials, cutting, fittings, alterations, garment bundles and finishing.",
      modules: tailoringModules,
    },
  ];
}

export function tailoringLayerSummaryModules(layers: TailoringTemplateLayer[]) {
  return layers.map((layer, index) => ({
    code: `LAYER_${layer.code}`,
    labelFr: `${index + 1}. ${layer.labelFr} — ${layer.modules.length} modules`,
    labelEn: `${index + 1}. ${layer.labelEn} — ${layer.modules.length} modules`,
    category: layer.code,
    icon: null,
    isCore: layer.code === "ERP_COMMON",
  }));
}
