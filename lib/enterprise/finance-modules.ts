import { ENTERPRISE_FINANCE_MODULE_CODES } from "@/lib/enterprise/accounting/constants";
import { listEnterpriseModuleDefinitions } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

const financeModuleCodeSet = new Set<string>(ENTERPRISE_FINANCE_MODULE_CODES);

export async function ensureCanonicalFinanceModulesForOrganization({
  organizationId,
  enableNewModules = true,
}: {
  organizationId: string;
  enableNewModules?: boolean;
}) {
  const definitions = listEnterpriseModuleDefinitions({ statuses: ["ACTIVE", "BETA"] })
    .filter((definition) => financeModuleCodeSet.has(definition.code));

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
