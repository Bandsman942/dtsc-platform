import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

type SourceLinkDefinition = {
  moduleCode: string;
  labelFr: string;
  labelEn: string;
};

const SOURCE_LINKS: Record<string, SourceLinkDefinition> = Object.freeze({
  FINANCE_RECEIVABLES: { moduleCode: "FINANCE_RECEIVABLES", labelFr: "Ventes & créances", labelEn: "Sales & receivables" },
  FINANCE_PAYABLES: { moduleCode: "FINANCE_PAYABLES", labelFr: "Achats & dettes", labelEn: "Purchases & payables" },
  FINANCE_PAYMENTS: { moduleCode: "FINANCE_PAYMENTS", labelFr: "Paiements", labelEn: "Payments" },
  FINANCE_TREASURY: { moduleCode: "FINANCE_TREASURY", labelFr: "Trésorerie", labelEn: "Treasury" },
  FINANCE_CASH: { moduleCode: "FINANCE_CASH", labelFr: "Caisse", labelEn: "Cash" },
  FINANCE_BANK: { moduleCode: "FINANCE_BANK", labelFr: "Banque", labelEn: "Bank" },
  FINANCE_ASSETS: { moduleCode: "FINANCE_ASSETS", labelFr: "Immobilisations", labelEn: "Asset accounting" },
  FINANCE_INVENTORY: { moduleCode: "FINANCE_INVENTORY", labelFr: "Valorisation du stock", labelEn: "Inventory accounting" },
  PAYROLL_OPERATIONS: { moduleCode: "PAYROLL_OPERATIONS", labelFr: "Paie opérationnelle", labelEn: "Payroll operations" },
  PROJECTS_SERVICES: { moduleCode: "PROJECTS_SERVICES", labelFr: "Projets & services", labelEn: "Projects & services" },
});

export type AccountingSourceLink = {
  labelFr: string;
  labelEn: string;
  href: string;
  moduleCode: string;
};

export async function resolveAccountingSourceLink(input: {
  userId: string;
  organizationId: string;
  sourceModule?: string | null;
  sourceEntityId?: string | null;
  reference?: string | null;
}): Promise<AccountingSourceLink | null> {
  if (!input.sourceModule || !input.sourceEntityId) return null;
  const definition = SOURCE_LINKS[input.sourceModule];
  if (!definition) return null;

  const access = await resolveEnterpriseModuleAccess({
    userId: input.userId,
    organizationId: input.organizationId,
    moduleCode: definition.moduleCode,
    action: "read",
  });
  if (!access.allowed) return null;

  const query = new URLSearchParams({ recordId: input.sourceEntityId });
  if (input.reference?.trim()) query.set("search", input.reference.trim());
  return {
    labelFr: definition.labelFr,
    labelEn: definition.labelEn,
    href: `/enterprise-modules/${definition.moduleCode}?${query.toString()}`,
    moduleCode: definition.moduleCode,
  };
}
