import type { OrganizationEntitlements } from "@/lib/billing/entitlements";
import {
  getEnterpriseModuleDefinition,
  isEnterpriseModuleImplemented,
  isEnterpriseModuleSectorCompatible,
  normalizeEnterpriseModuleCode,
} from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export async function getEnterpriseModulesDataset(organizationId: string, entitlements?: OrganizationEntitlements | null) {
  const [organization, modules, activityBlocks] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { sectorCode: true },
    }),
    prisma.enterpriseModule.findMany({
      where: { organizationId },
      orderBy: [{ moduleCategory: "asc" }, { sortOrder: "asc" }, { labelFr: "asc" }],
    }),
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
    }),
  ]);

  const moduleEntitlementByCode = new Map(
    (entitlements?.modules || []).map((item) => [normalizeEnterpriseModuleCode(item.moduleCode), item]),
  );
  const annotatedModules = modules.map((enterpriseModule) => {
    const canonicalCode = normalizeEnterpriseModuleCode(enterpriseModule.moduleCode);
    const definition = getEnterpriseModuleDefinition(canonicalCode);
    const moduleEntitlement = moduleEntitlementByCode.get(canonicalCode);
    const sectorCompatible = Boolean(definition && isEnterpriseModuleSectorCompatible(definition, organization?.sectorCode));
    const implemented = Boolean(definition && isEnterpriseModuleImplemented(definition.code));
    const registryAllowsAccess = implemented && sectorCompatible && definition?.routeKind !== "HIDDEN";
    return {
      ...enterpriseModule,
      canonicalCode: definition?.code || null,
      implementationStatus: definition?.implementationStatus || null,
      navigationGroup: definition?.navigationGroup || null,
      routeKind: definition?.routeKind || null,
      sectorCompatible,
      registryKnown: Boolean(definition),
      requiredPlan: moduleEntitlement?.requiredPlan || definition?.minimumPlan || null,
      includedInPlan: moduleEntitlement?.includedInPlan ?? true,
      accessAllowed: registryAllowsAccess && (moduleEntitlement?.allowed ?? enterpriseModule.isEnabled),
      accessMessage: !definition
        ? "Code module absent du registre canonique."
        : !implemented
          ? `Module ${definition.implementationStatus.toLowerCase()} et non ouvrable.`
          : !sectorCompatible
            ? "Module incompatible avec le secteur de l’entreprise."
            : moduleEntitlement?.message || null,
    };
  });

  const allowedModuleCodes = new Set(
    annotatedModules
      .filter((enterpriseModule) => enterpriseModule.accessAllowed)
      .flatMap((enterpriseModule) => [enterpriseModule.moduleCode, enterpriseModule.canonicalCode].filter((code): code is string => Boolean(code))),
  );
  const filteredActivityBlocks = activityBlocks.filter((block) => {
    if (!block.targetModuleCode) {
      return true;
    }
    return allowedModuleCodes.has(block.targetModuleCode) || allowedModuleCodes.has(normalizeEnterpriseModuleCode(block.targetModuleCode));
  });

  return { modules: annotatedModules, activityBlocks: filteredActivityBlocks };
}
