export type ModuleNavigationGroupCode =
  | "PILOTAGE"
  | "AI_COLLABORATION"
  | "ORGANIZATION_ERP"
  | "ACCOUNT_SUPPORT"
  | "DTSC_INTERNAL";

export type ModuleNavigationSubgroupDefinition = {
  code: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  standardModuleCodes: string[];
};

export type ModuleNavigationGroupDefinition = {
  code: ModuleNavigationGroupCode;
  labelFr: string;
  labelEn: string;
  shortLabelFr: string;
  shortLabelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  subgroups: ModuleNavigationSubgroupDefinition[];
};

export const MODULE_NAVIGATION_GROUPS: ModuleNavigationGroupDefinition[] = [
  {
    code: "PILOTAGE",
    labelFr: "Pilotage & organisation",
    labelEn: "Steering & planning",
    shortLabelFr: "Pilotage",
    shortLabelEn: "Steering",
    descriptionFr: "Vue d’ensemble, calendrier et signaux qui structurent votre journée.",
    descriptionEn: "Overview, calendar and signals that structure your day.",
    subgroups: [
      {
        code: "OVERVIEW",
        labelFr: "Vue d’ensemble",
        labelEn: "Overview",
        descriptionFr: "Comprendre la situation et organiser le travail à venir.",
        descriptionEn: "Understand the current situation and plan upcoming work.",
        standardModuleCodes: ["DASHBOARD", "CALENDAR"],
      },
      {
        code: "SIGNALS",
        labelFr: "Alertes & suivi",
        labelEn: "Alerts & follow-up",
        descriptionFr: "Retrouver les éléments qui requièrent votre attention.",
        descriptionEn: "Find the items that require your attention.",
        standardModuleCodes: ["NOTIFICATIONS"],
      },
    ],
  },
  {
    code: "AI_COLLABORATION",
    labelFr: "IA & collaboration",
    labelEn: "AI & collaboration",
    shortLabelFr: "IA & équipe",
    shortLabelEn: "AI & team",
    descriptionFr: "Travailler avec l’IA DTSC, vos collaborateurs et les espaces de communication.",
    descriptionEn: "Work with DTSC AI, your collaborators and communication spaces.",
    subgroups: [
      {
        code: "INTELLIGENCE",
        labelFr: "Intelligence DTSC",
        labelEn: "DTSC intelligence",
        descriptionFr: "Accéder aux expériences IA réellement disponibles pour votre compte.",
        descriptionEn: "Access the AI experiences actually available to your account.",
        standardModuleCodes: ["GLOBAL_CHATBOT"],
      },
      {
        code: "COLLABORATION",
        labelFr: "Collaboration & communication",
        labelEn: "Collaboration & communication",
        descriptionFr: "Échanger, publier et travailler avec les personnes autorisées.",
        descriptionEn: "Communicate, publish and work with authorized people.",
        standardModuleCodes: ["COLLABORATORS", "ANNOUNCEMENTS"],
      },
    ],
  },
  {
    code: "ORGANIZATION_ERP",
    labelFr: "Entreprise & ERP",
    labelEn: "Company & ERP",
    shortLabelFr: "Entreprise",
    shortLabelEn: "Company",
    descriptionFr: "Relations entreprise, abonnement, activités et modules ERP autorisés dans le contexte actif.",
    descriptionEn: "Company relationships, subscription, activities and ERP modules allowed in the active context.",
    subgroups: [
      {
        code: "COMPANY",
        labelFr: "Entreprise & relations",
        labelEn: "Company & relationships",
        descriptionFr: "Gérer votre entreprise, vos relations et les invitations disponibles.",
        descriptionEn: "Manage your company, relationships and available invitations.",
        standardModuleCodes: ["COMPANY_PROFILE", "COMPANY_RELATIONSHIPS", "ENTERPRISE_INVITATIONS"],
      },
      {
        code: "ERP_ENTRY",
        labelFr: "Espaces entreprise",
        labelEn: "Company workspaces",
        descriptionFr: "Accéder aux activités, au catalogue ERP et à l’administration lorsque le serveur l’autorise.",
        descriptionEn: "Access activities, the ERP catalog and administration when allowed by the server.",
        standardModuleCodes: ["ENTERPRISE_ACTIVITIES", "ENTERPRISE_MODULES_SUBSCRIPTION", "ENTERPRISE_ADMINISTRATION"],
      },
      {
        code: "COMMERCIAL",
        labelFr: "Offre & abonnement",
        labelEn: "Offer & subscription",
        descriptionFr: "Comprendre le plan actif, ses capacités et sa consommation.",
        descriptionEn: "Understand the active plan, its capabilities and usage.",
        standardModuleCodes: ["SUBSCRIPTION"],
      },
    ],
  },
  {
    code: "ACCOUNT_SUPPORT",
    labelFr: "Compte & assistance",
    labelEn: "Account & support",
    shortLabelFr: "Compte",
    shortLabelEn: "Account",
    descriptionFr: "Préférences personnelles, profil et accompagnement DTSC.",
    descriptionEn: "Personal preferences, profile and DTSC support.",
    subgroups: [
      {
        code: "ACCOUNT",
        labelFr: "Mon compte",
        labelEn: "My account",
        descriptionFr: "Gérer votre identité et vos préférences d’utilisation.",
        descriptionEn: "Manage your identity and usage preferences.",
        standardModuleCodes: ["PROFILE", "SETTINGS"],
      },
      {
        code: "SUPPORT",
        labelFr: "Assistance DTSC",
        labelEn: "DTSC support",
        descriptionFr: "Obtenir de l’aide et suivre vos demandes de support.",
        descriptionEn: "Get help and track your support requests.",
        standardModuleCodes: ["SUPPORT"],
      },
    ],
  },
  {
    code: "DTSC_INTERNAL",
    labelFr: "DTSC interne",
    labelEn: "DTSC internal",
    shortLabelFr: "DTSC",
    shortLabelEn: "DTSC",
    descriptionFr: "Espaces de travail internes et console accessibles selon votre contexte DTSC réel.",
    descriptionEn: "Internal workspaces and console available according to your actual DTSC context.",
    subgroups: [
      {
        code: "INTERNAL_WORK",
        labelFr: "Travail interne",
        labelEn: "Internal work",
        descriptionFr: "Accéder aux activités internes liées à votre dossier collaborateur.",
        descriptionEn: "Access internal activities linked to your employee record.",
        standardModuleCodes: ["DTSC_ACTIVITIES"],
      },
      {
        code: "INTERNAL_ADMIN",
        labelFr: "Administration DTSC",
        labelEn: "DTSC administration",
        descriptionFr: "Ouvrir la console DTSC lorsque votre rôle et votre contexte serveur l’autorisent.",
        descriptionEn: "Open the DTSC console when your server-side role and context allow it.",
        standardModuleCodes: ["DTSC_INTERNAL_ADMIN"],
      },
    ],
  },
];

const groupByCode = new Map(MODULE_NAVIGATION_GROUPS.map((group) => [group.code, group]));

export function isModuleNavigationGroupCode(value: string | null | undefined): value is ModuleNavigationGroupCode {
  return Boolean(value && groupByCode.has(value as ModuleNavigationGroupCode));
}

export function getModuleNavigationGroup(code: ModuleNavigationGroupCode) {
  return groupByCode.get(code) || null;
}

export function getModuleNavigationGroupHref(code: ModuleNavigationGroupCode) {
  return `/modules?group=${encodeURIComponent(code)}`;
}

export function getModuleNavigationGroupLabel(group: ModuleNavigationGroupDefinition, locale?: string | null, short = false) {
  if (locale === "en") return short ? group.shortLabelEn : group.labelEn;
  return short ? group.shortLabelFr : group.labelFr;
}

export function getModuleNavigationGroupDescription(group: ModuleNavigationGroupDefinition, locale?: string | null) {
  return locale === "en" ? group.descriptionEn : group.descriptionFr;
}

export function getModuleNavigationSubgroupLabel(subgroup: ModuleNavigationSubgroupDefinition, locale?: string | null) {
  return locale === "en" ? subgroup.labelEn : subgroup.labelFr;
}

export function getModuleNavigationSubgroupDescription(subgroup: ModuleNavigationSubgroupDefinition, locale?: string | null) {
  return locale === "en" ? subgroup.descriptionEn : subgroup.descriptionFr;
}
