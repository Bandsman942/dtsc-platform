export type CanonicalUserGuideStep = {
  title: string;
  description: string;
  actions?: string[];
  cautions?: string[];
};

export type CanonicalUserGuideLink = {
  code: string;
  label: string;
  reason: string;
};

export type CanonicalUserGuide = {
  code: string;
  title: string;
  summary: string;
  audience: string;
  updatedAt: string;
  capabilities: string[];
  steps: CanonicalUserGuideStep[];
  limitations?: string[];
  relatedModules?: CanonicalUserGuideLink[];
};

export type LegacyEnterpriseUserGuide = {
  title: string;
  purpose: string;
  prerequisites: string[];
  steps: string[];
  workflow: string[];
  controls: string[];
  troubleshooting: string[];
  limitations?: string[];
  relatedModules?: CanonicalUserGuideLink[];
};

export function toCanonicalEnterpriseUserGuide(
  code: string,
  guide: LegacyEnterpriseUserGuide,
  locale?: string | null,
): CanonicalUserGuide {
  const english = locale === "en";
  return {
    code,
    title: guide.title,
    summary: guide.purpose,
    audience: english ? "Authorized users of this business module" : "Utilisateurs autorisés de ce module métier",
    updatedAt: "2026-09-17",
    capabilities: guide.controls.length ? guide.controls : [guide.purpose],
    steps: [
      {
        title: english ? "Before you start" : "Avant de commencer",
        description: english ? "Check the prerequisites before starting this workflow." : "Vérifiez les prérequis avant de commencer ce parcours.",
        actions: guide.prerequisites,
      },
      {
        title: english ? "Step-by-step procedure" : "Procédure pas à pas",
        description: english ? "Follow the business steps in the order below." : "Suivez les étapes métier dans l’ordre ci-dessous.",
        actions: guide.steps,
      },
      {
        title: english ? "Statuses and workflow" : "Statuts et workflow",
        description: english ? "These transitions describe the expected business lifecycle." : "Ces transitions décrivent le cycle métier attendu.",
        actions: guide.workflow,
      },
      {
        title: english ? "Controls and confidentiality" : "Contrôles et confidentialité",
        description: english ? "These controls remain authoritative throughout the workflow." : "Ces contrôles restent applicables pendant tout le parcours.",
        actions: guide.controls,
      },
      {
        title: english ? "Troubleshooting" : "Dépannage",
        description: english ? "Use these checks when an expected action or record is unavailable." : "Utilisez ces vérifications lorsqu’une action ou une donnée attendue n’est pas disponible.",
        actions: guide.troubleshooting,
      },
    ].filter((step) => step.actions.length > 0),
    limitations: guide.limitations,
    relatedModules: guide.relatedModules,
  };
}
