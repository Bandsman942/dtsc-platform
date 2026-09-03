import "server-only";

import { createHash } from "node:crypto";
import { ensureBillingPlans } from "@/lib/billing";
import { getPlanModuleCatalog } from "@/lib/billing/plan-catalog";
import { getPlanUsageLimits, type OrganizationUsageLimits } from "@/lib/billing/plan-limits";
import { getSaasPlanLabel, resolveSaasPlanCode, type SaasPlanCode } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

export const BILLING_CATALOG_RELEASE = "2026.09";
export const BILLING_CATALOG_PUBLISHED_AT = "2026-09-03T00:00:00.000Z";

export const PUBLISHED_BILLING_OFFER_IDS = [
  "freemium",
  "starter",
  "growth",
  "premium",
  "org-starter",
  "org-growth",
  "org-premium",
] as const;

type PublishedBillingOfferId = (typeof PUBLISHED_BILLING_OFFER_IDS)[number];

type CommercialCopy = {
  positioningFr: string;
  audienceFr: string;
  aiModeFr: string;
  highlightsFr: string[];
};

const COMMERCIAL_COPY: Record<PublishedBillingOfferId, CommercialCopy> = {
  freemium: {
    positioningFr: "Découvrir DTSC Platform et tester l’assistance IA avec un volume volontairement limité.",
    audienceFr: "Utilisateurs qui souhaitent découvrir DTSC avant de passer à un usage professionnel régulier.",
    aiModeFr: "Chat DTSC limité et sources de connaissance personnelles.",
    highlightsFr: ["Accès individuel gratuit", "Assistant DTSC", "1 source de connaissance IA"],
  },
  starter: {
    positioningFr: "Démarrer un usage individuel professionnel léger sans changer d’environnement de travail.",
    audienceFr: "Indépendants, consultants et professionnels avec des besoins IA ponctuels mais réguliers.",
    aiModeFr: "Assistant DTSC individuel avec quotas renforcés.",
    highlightsFr: ["Usage individuel professionnel", "Quotas IA renforcés", "2 sources de connaissance IA"],
  },
  growth: {
    positioningFr: "Analyser, documenter et travailler régulièrement avec l’IA dans un espace individuel.",
    audienceFr: "Professionnels qui utilisent DTSC de façon quotidienne pour l’analyse et la documentation.",
    aiModeFr: "Analyses individuelles avancées avec capacité documentaire étendue.",
    highlightsFr: ["Usage quotidien", "Analyses avancées", "20 sources de connaissance IA"],
  },
  premium: {
    positioningFr: "Soutenir un usage individuel intensif avec de grands volumes IA et documentaires.",
    audienceFr: "Professionnels intensifs qui ont besoin des plus hauts quotas individuels DTSC.",
    aiModeFr: "Usage individuel intensif, grands volumes et priorité de service.",
    highlightsFr: ["Usage intensif", "Quotas individuels maximum", "100 sources de connaissance IA"],
  },
  "org-starter": {
    positioningFr: "Structurer et collaborer avec les fondamentaux ERP, l’administration d’équipe et l’IA en lecture.",
    audienceFr: "Petites organisations qui centralisent leurs premières opérations et leur collaboration.",
    aiModeFr: "Lecture, recherche, résumé et analyse. Aucune préparation d’action IA.",
    highlightsFr: [
      "Administration, collaborateurs, postes, départements et permissions de base",
      "Demandes internes, documents, rapports, tiers, catalogue et projets",
      "Calendrier et appels collaboratifs",
      "IA Assistant Entreprise en lecture et analyse",
    ],
  },
  "org-growth": {
    positioningFr: "Gérer et automatiser les opérations de bout en bout avec une équipe structurée.",
    audienceFr: "PME et organisations en croissance avec ventes, achats, stocks, RH, projets et finance opérationnelle.",
    aiModeFr: "Lecture et analyse, avec préparation d’actions soumise aux permissions et confirmations existantes.",
    highlightsFr: [
      "Tout le socle Essentiel",
      "Ventes, achats, stocks, RH, temps, livrables, actifs et maintenance",
      "Tâches, validations, réunions, workflows et finances opérationnelles",
      "IA avec préparation d’actions contrôlées",
    ],
  },
  "org-premium": {
    positioningFr: "Piloter, comptabiliser et sectorialiser les opérations avec les capacités DTSC les plus avancées.",
    audienceFr: "Organisations multisites, directions exigeantes et secteurs avancés Health/Pharmacy.",
    aiModeFr: "Lecture, préparation d’actions et orchestration avancée, toujours soumises aux permissions et confirmations.",
    highlightsFr: [
      "Tout le périmètre Croissance",
      "Paie opérationnelle et finance/comptabilité avancée",
      "Banque, rapprochement, fiscalité, clôture et états financiers",
      "Gouvernance avancée et secteurs Health/Pharmacy selon le registre canonique",
    ],
  },
};

export type PublishedBillingOffer = {
  id: PublishedBillingOfferId;
  name: string;
  slug: string;
  description: string;
  audience: "PERSONAL" | "ORGANIZATION";
  priceUsd: number;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxKnowledgeSources: number;
  isActive: boolean;
  sortOrder: number;
  capabilityCode: SaasPlanCode;
  capabilityLabel: string;
  positioningFr: string;
  audienceFr: string;
  aiModeFr: string;
  highlightsFr: string[];
  organizationLimits: OrganizationUsageLimits | null;
  moduleCatalog: ReturnType<typeof getPlanModuleCatalog> | null;
  offerVersion: number;
  updatedAt: string;
};

export type PublishedBillingCatalog = {
  release: string;
  releaseId: string;
  revision: string;
  publishedAt: string;
  offers: PublishedBillingOffer[];
};

function isPublishedOfferId(value: string): value is PublishedBillingOfferId {
  return (PUBLISHED_BILLING_OFFER_IDS as readonly string[]).includes(value);
}

function organizationLimitsForOffer(planCode: SaasPlanCode, dailyMessageLimit: number, dailyTokenLimit: number, maxKnowledgeSources: number) {
  const defaults = getPlanUsageLimits(planCode);
  return {
    ...defaults,
    maxEnterpriseAiMonthlyMessages: Math.max(1, dailyMessageLimit) * 30,
    maxEnterpriseAiMonthlyTokens: Math.max(1, dailyTokenLimit) * 30,
    maxEnterpriseAiKnowledgeSources: Math.max(0, maxKnowledgeSources),
  } satisfies OrganizationUsageLimits;
}

export async function getPublishedBillingCatalog(options: { includeInactive?: boolean } = {}): Promise<PublishedBillingCatalog> {
  await ensureBillingPlans();
  const plans = await prisma.billingPlan.findMany({
    where: {
      id: { in: [...PUBLISHED_BILLING_OFFER_IDS] },
      ...(options.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sortOrder: "asc" }, { priceUsd: "asc" }],
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true },
      },
    },
  });

  const offers = plans.flatMap((plan): PublishedBillingOffer[] => {
    if (!isPublishedOfferId(plan.id)) return [];
    const capabilityCode = resolveSaasPlanCode(plan);
    const copy = COMMERCIAL_COPY[plan.id];
    const maxKnowledgeSources = Math.max(0, plan.maxDocuments);
    const organizationLimits = plan.audience === "ORGANIZATION"
      ? organizationLimitsForOffer(capabilityCode, plan.dailyMessageLimit, plan.dailyTokenLimit, maxKnowledgeSources)
      : null;
    return [{
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      audience: plan.audience === "ORGANIZATION" ? "ORGANIZATION" : "PERSONAL",
      priceUsd: Number(plan.priceUsd),
      dailyMessageLimit: plan.dailyMessageLimit,
      dailyTokenLimit: plan.dailyTokenLimit,
      maxKnowledgeSources,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      capabilityCode,
      capabilityLabel: getSaasPlanLabel(capabilityCode, "fr"),
      positioningFr: copy.positioningFr,
      audienceFr: copy.audienceFr,
      aiModeFr: copy.aiModeFr,
      highlightsFr: copy.highlightsFr,
      organizationLimits,
      moduleCatalog: plan.audience === "ORGANIZATION" ? getPlanModuleCatalog(capabilityCode, "fr") : null,
      offerVersion: plan.versions[0]?.version || 0,
      updatedAt: plan.updatedAt.toISOString(),
    }];
  });

  const revisionInput = offers.map((offer) => ({
    id: offer.id,
    offerVersion: offer.offerVersion,
    updatedAt: offer.updatedAt,
    priceUsd: offer.priceUsd,
    dailyMessageLimit: offer.dailyMessageLimit,
    dailyTokenLimit: offer.dailyTokenLimit,
    maxKnowledgeSources: offer.maxKnowledgeSources,
    isActive: offer.isActive,
  }));
  const revision = createHash("sha256").update(JSON.stringify(revisionInput)).digest("hex").slice(0, 12);

  return {
    release: BILLING_CATALOG_RELEASE,
    releaseId: `${BILLING_CATALOG_RELEASE}-${revision}`,
    revision,
    publishedAt: BILLING_CATALOG_PUBLISHED_AT,
    offers,
  };
}

function storageLabel(maxStorageMb: number) {
  if (maxStorageMb >= 1024) return `${Math.round(maxStorageMb / 1024)} Go`;
  return `${maxStorageMb} Mo`;
}

export function formatPublishedBillingCatalogForAi(catalog: PublishedBillingCatalog) {
  const lines = catalog.offers.map((offer) => {
    const common = `${offer.name}: ${offer.priceUsd === 0 ? "gratuit" : `${offer.priceUsd.toFixed(2)} USD/mois`}; ${offer.dailyMessageLimit.toLocaleString("fr-FR")} messages IA/jour; ${offer.dailyTokenLimit.toLocaleString("fr-FR")} tokens/jour; ${offer.maxKnowledgeSources.toLocaleString("fr-FR")} sources de connaissance IA.`;
    if (!offer.organizationLimits) return `- ${common}`;
    const limits = offer.organizationLimits;
    return `- ${common} ${limits.maxUsers.toLocaleString("fr-FR")} utilisateurs; ${storageLabel(limits.maxStorageMb)} de stockage; ${limits.maxMonthlyCallMinutes.toLocaleString("fr-FR")} min d’appels/mois; ${limits.maxActiveModules.toLocaleString("fr-FR")} modules actifs; ${limits.maxDocuments.toLocaleString("fr-FR")} documents métier. Mode IA: ${offer.aiModeFr}`;
  });
  return [
    `CATALOGUE COMMERCIAL DTSC PUBLIÉ — release ${catalog.releaseId}.`,
    "Ce catalogue est l’autorité commerciale courante pour les offres, prix et quotas. Les prix ci-dessous sont des prix d’abonnement DTSC Platform, pas des devis de prestation de conseil.",
    ...lines,
    "Pour une organisation, les permissions, le rôle, les modules activés, le secteur et l’état de l’abonnement restent obligatoires même si une capacité est incluse commercialement.",
  ].join("\n");
}
