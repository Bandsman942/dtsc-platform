export const SAAS_PLAN_CODES = ["STARTER", "BUSINESS", "ENTERPRISE"] as const;

export type SaasPlanCode = (typeof SAAS_PLAN_CODES)[number];

export type SaasPlanDefinition = {
  code: SaasPlanCode;
  slug: string;
  label: string;
  labelEn: string;
  description: string;
  descriptionEn: string;
  level: number;
};

export const SAAS_PLANS: Record<SaasPlanCode, SaasPlanDefinition> = {
  STARTER: {
    code: "STARTER",
    slug: "starter",
    label: "Essentiel",
    labelEn: "Starter",
    description: "Les fondamentaux pour structurer les clients, le catalogue, les documents, les demandes et les premiers projets.",
    descriptionEn: "Core tools for customers, catalog, documents, requests and first projects.",
    level: 1,
  },
  BUSINESS: {
    code: "BUSINESS",
    slug: "business",
    label: "Professionnel",
    labelEn: "Business",
    description: "Une gestion intégrée des ventes, achats, stocks, équipes, workflows et finances opérationnelles.",
    descriptionEn: "Integrated sales, procurement, inventory, workforce, workflow and operational finance management.",
    level: 2,
  },
  ENTERPRISE: {
    code: "ENTERPRISE",
    slug: "enterprise",
    label: "Entreprise",
    labelEn: "Enterprise",
    description: "La couverture complète pour la comptabilité avancée, les organisations multisites et les secteurs Health et Pharmacy.",
    descriptionEn: "Complete coverage for advanced accounting, multi-site organizations and Health and Pharmacy sectors.",
    level: 3,
  },
};

const LEGACY_PLAN_SLUGS: Record<string, SaasPlanCode> = {
  freemium: "STARTER",
  starter: "STARTER",
  essentiel: "STARTER",
  business: "BUSINESS",
  growth: "BUSINESS",
  professionnel: "BUSINESS",
  premium: "ENTERPRISE",
  enterprise: "ENTERPRISE",
  entreprise: "ENTERPRISE",
};

export function resolveSaasPlanCode(plan?: { slug?: string | null; name?: string | null } | null): SaasPlanCode {
  const candidates = [plan?.slug, plan?.name].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    const direct = LEGACY_PLAN_SLUGS[normalized];
    if (direct) {
      return direct;
    }
    if (normalized.includes("enterprise") || normalized.includes("entreprise") || normalized.includes("premium")) {
      return "ENTERPRISE";
    }
    if (normalized.includes("business") || normalized.includes("growth") || normalized.includes("professionnel")) {
      return "BUSINESS";
    }
    if (normalized.includes("starter") || normalized.includes("essentiel") || normalized.includes("freemium")) {
      return "STARTER";
    }
  }
  return "STARTER";
}

export function getSaasPlanLabel(planCode: SaasPlanCode, locale?: string | null) {
  return locale === "en" ? SAAS_PLANS[planCode].labelEn : SAAS_PLANS[planCode].label;
}

export function getSaasPlanDescription(planCode: SaasPlanCode, locale?: string | null) {
  return locale === "en" ? SAAS_PLANS[planCode].descriptionEn : SAAS_PLANS[planCode].description;
}

export function planMeetsRequirement(planCode: SaasPlanCode, requiredPlanCode: SaasPlanCode) {
  return SAAS_PLANS[planCode].level >= SAAS_PLANS[requiredPlanCode].level;
}

export function normalizePlanRequirement(value?: string | null): SaasPlanCode | null {
  if (!value) {
    return null;
  }
  return resolveSaasPlanCode({ slug: value, name: value });
}
