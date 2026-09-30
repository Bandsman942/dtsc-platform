export type FinanceNavigationSectionCode =
  | "FINANCE_STEERING"
  | "FINANCE_OPERATIONS"
  | "FINANCE_TREASURY"
  | "FINANCE_ACCOUNTING"
  | "FINANCE_ANALYTICS"
  | "FINANCE_SECTOR";

export type FinanceNavigationSectionDefinition = {
  code: FinanceNavigationSectionCode;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  moduleCodes: string[];
};

export const FINANCE_NAVIGATION_SECTIONS: FinanceNavigationSectionDefinition[] = [
  {
    code: "FINANCE_STEERING",
    labelFr: "Pilotage financier",
    labelEn: "Financial steering",
    descriptionFr: "Vue d’ensemble, budgets et préparation des décisions financières.",
    descriptionEn: "Overview, budgets and financial decision preparation.",
    moduleCodes: ["FINANCE_OVERVIEW", "FINANCE_BUDGETS"],
  },
  {
    code: "FINANCE_OPERATIONS",
    labelFr: "Opérations clients & fournisseurs",
    labelEn: "Customer & supplier operations",
    descriptionFr: "Créances, dettes et paiements issus des opérations commerciales.",
    descriptionEn: "Receivables, payables and payments from business operations.",
    moduleCodes: ["FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS"],
  },
  {
    code: "FINANCE_TREASURY",
    labelFr: "Trésorerie & encaissements",
    labelEn: "Treasury & collections",
    descriptionFr: "Trésorerie, caisse, banque et rapprochements.",
    descriptionEn: "Treasury, cash, banking and reconciliation.",
    moduleCodes: ["FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"],
  },
  {
    code: "FINANCE_ACCOUNTING",
    labelFr: "Comptabilité & conformité",
    labelEn: "Accounting & compliance",
    descriptionFr: "Comptabilité, fiscalité, clôture, états financiers et valorisations.",
    descriptionEn: "Accounting, tax, close, financial statements and valuations.",
    moduleCodes: [
      "FINANCE_ACCOUNTING",
      "FINANCE_TAX",
      "FINANCE_CLOSE",
      "FINANCE_STATEMENTS",
      "FINANCE_ASSETS",
      "FINANCE_INVENTORY",
    ],
  },
  {
    code: "FINANCE_ANALYTICS",
    labelFr: "Rapports & analyse",
    labelEn: "Reports & analytics",
    descriptionFr: "Rapports de pilotage construits à partir des sources métier autorisées.",
    descriptionEn: "Steering reports built from authorized business sources.",
    moduleCodes: ["REPORTS"],
  },
  {
    code: "FINANCE_SECTOR",
    labelFr: "Finance sectorielle",
    labelEn: "Sector finance",
    descriptionFr: "Extensions financières propres au secteur actif, sans moteur financier parallèle.",
    descriptionEn: "Financial extensions specific to the active sector, without a parallel finance engine.",
    moduleCodes: [],
  },
];

const commonFinanceCodes = new Set(
  FINANCE_NAVIGATION_SECTIONS
    .filter((section) => section.code !== "FINANCE_SECTOR")
    .flatMap((section) => section.moduleCodes),
);

export function getFinanceNavigationSectionCode(moduleCode: string): FinanceNavigationSectionCode {
  const normalized = moduleCode.trim().toUpperCase();
  for (const section of FINANCE_NAVIGATION_SECTIONS) {
    if (section.moduleCodes.includes(normalized)) return section.code;
  }
  return "FINANCE_SECTOR";
}

export function isCommonFinanceNavigationModule(moduleCode: string) {
  return commonFinanceCodes.has(moduleCode.trim().toUpperCase());
}

export function getFinanceNavigationSectionLabel(section: FinanceNavigationSectionDefinition, locale?: string | null) {
  return locale === "en" ? section.labelEn : section.labelFr;
}

export function getFinanceNavigationSectionDescription(section: FinanceNavigationSectionDefinition, locale?: string | null) {
  return locale === "en" ? section.descriptionEn : section.descriptionFr;
}
