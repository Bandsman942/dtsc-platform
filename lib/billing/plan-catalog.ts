import { planMeetsRequirement, type SaasPlanCode } from "@/lib/billing/plans";
import {
  getEnterpriseModuleGroupLabel,
  listEnterpriseModuleDefinitions,
} from "@/lib/enterprise/module-registry";
import { compareEnterpriseModuleDefinitions } from "@/lib/enterprise/module-order";

export type PlanCommercialProfile = {
  code: SaasPlanCode;
  labelFr: string;
  labelEn: string;
  audienceFr: string;
  promiseFr: string;
};

export const PLAN_COMMERCIAL_PROFILES: Record<SaasPlanCode, PlanCommercialProfile> = {
  STARTER: {
    code: "STARTER",
    labelFr: "Essentiel",
    labelEn: "Starter",
    audienceFr: "Petites structures et équipes qui démarrent leur gestion numérique.",
    promiseFr: "Centraliser les clients, le catalogue, les documents, les demandes et les premiers projets.",
  },
  BUSINESS: {
    code: "BUSINESS",
    labelFr: "Professionnel",
    labelEn: "Business",
    audienceFr: "PME structurées avec ventes, achats, stocks, équipes et trésorerie opérationnelle.",
    promiseFr: "Piloter les opérations de bout en bout avec workflows, contrôle des accès et finance courante.",
  },
  ENTERPRISE: {
    code: "ENTERPRISE",
    labelFr: "Entreprise",
    labelEn: "Enterprise",
    audienceFr: "Organisations multisites, secteurs réglementés et directions exigeant une gouvernance avancée.",
    promiseFr: "Couvrir la comptabilité complète, la clôture, les secteurs Health et Pharmacy et les contrôles avancés.",
  },
};

export function getPlanCommercialLabel(planCode: SaasPlanCode, locale?: string | null) {
  const profile = PLAN_COMMERCIAL_PROFILES[planCode];
  return locale === "en" ? profile.labelEn : profile.labelFr;
}

export function getPlanModuleCatalog(planCode: SaasPlanCode, locale?: string | null) {
  const definitions = listEnterpriseModuleDefinitions({ statuses: ["ACTIVE", "BETA"] })
    .filter((definition) => definition.routeKind !== "ADMIN_SECTION" && definition.routeKind !== "HIDDEN")
    .filter((definition) => planMeetsRequirement(planCode, definition.minimumPlan))
    .sort(compareEnterpriseModuleDefinitions);

  const groups = new Map<string, { label: string; modules: Array<{ code: string; label: string; sectorSpecific: boolean }> }>();
  for (const definition of definitions) {
    const key = definition.navigationGroup;
    const group = groups.get(key) || {
      label: getEnterpriseModuleGroupLabel(definition.navigationGroup, locale),
      modules: [],
    };
    group.modules.push({
      code: definition.code,
      label: locale === "en" ? definition.labelEn : definition.labelFr,
      sectorSpecific: definition.applicableSectors !== "ALL",
    });
    groups.set(key, group);
  }

  return {
    totalModules: definitions.length,
    commonModules: definitions.filter((definition) => definition.applicableSectors === "ALL").length,
    sectorModules: definitions.filter((definition) => definition.applicableSectors !== "ALL").length,
    groups: Array.from(groups.entries()).map(([code, group]) => ({ code, ...group })),
  };
}
