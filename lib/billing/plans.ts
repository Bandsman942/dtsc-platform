export const SAAS_PLAN_CODES = ["STARTER", "BUSINESS", "ENTERPRISE"] as const;

export type SaasPlanCode = (typeof SAAS_PLAN_CODES)[number];

export type SaasPlanDefinition = {
  code: SaasPlanCode;
  slug: string;
  label: string;
  description: string;
  level: number;
};

export const SAAS_PLANS: Record<SaasPlanCode, SaasPlanDefinition> = {
  STARTER: {
    code: "STARTER",
    slug: "starter",
    label: "Starter",
    description: "Socle SaaS pour une organisation active avec support, collaboration et suivi simple.",
    level: 1,
  },
  BUSINESS: {
    code: "BUSINESS",
    slug: "business",
    label: "Business",
    description: "Modules d'administration, calendrier, workflows et activités internes pour équipes structurées.",
    level: 2,
  },
  ENTERPRISE: {
    code: "ENTERPRISE",
    slug: "enterprise",
    label: "Enterprise",
    description: "Couverture complète avec modules sectoriels avancés, santé, reporting et limites élevées.",
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

export function planMeetsRequirement(planCode: SaasPlanCode, requiredPlanCode: SaasPlanCode) {
  return SAAS_PLANS[planCode].level >= SAAS_PLANS[requiredPlanCode].level;
}

export function normalizePlanRequirement(value?: string | null): SaasPlanCode | null {
  if (!value) {
    return null;
  }
  return resolveSaasPlanCode({ slug: value, name: value });
}
