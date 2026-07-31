import { listEnterpriseModuleDefinitions } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export const COMMON_ERP_MODULE_CODES = [
  "CRM_CUSTOMERS",
  "CATALOG",
  "SITES_WAREHOUSES",
  "CRM_PIPELINE",
  "SALES_QUOTES_ORDERS",
  "CONTRACTS",
  "INVENTORY_LOGISTICS",
  "HUMAN_RESOURCES",
  "TIME_ATTENDANCE",
  "PAYROLL_OPERATIONS",
  "PROJECTS_SERVICES",
  "TIME_DELIVERABLES",
  "ASSETS_MAINTENANCE",
] as const;

const commonModuleCodeSet = new Set<string>(COMMON_ERP_MODULE_CODES);

export async function ensureCanonicalCommonModulesForOrganization({
  organizationId,
  enableNewModules = true,
}: {
  organizationId: string;
  enableNewModules?: boolean;
}) {
  const definitions = listEnterpriseModuleDefinitions({ statuses: ["ACTIVE", "BETA"] })
    .filter((definition) => commonModuleCodeSet.has(definition.code));

  const modules = [];
  for (const definition of definitions) {
    const saved = await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode: definition.code } },
      update: {
        sectorId: null,
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isCore: true,
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
      create: {
        organizationId,
        sectorId: null,
        moduleCode: definition.code,
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isEnabled: enableNewModules,
        isCore: true,
        sourceTemplateId: null,
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
    });
    modules.push(saved);
  }

  return modules;
}
