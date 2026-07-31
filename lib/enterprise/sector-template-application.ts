import {
  applySectorTemplateToOrganization,
  type ApplySectorTemplateMode,
} from "@/lib/enterprise-sector-templates";
import { ensureCanonicalCommonModulesForOrganization } from "@/lib/enterprise/common-modules";
import {
  getEnterpriseModuleDefinition,
  isEnterpriseModuleImplemented,
  isEnterpriseModuleSectorCompatible,
  normalizeEnterpriseModuleCode,
} from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

export async function applyCanonicalSectorTemplateToOrganization({
  organizationId,
  sectorId,
  actorUserId,
  mode = "merge",
}: {
  organizationId: string;
  sectorId: string;
  actorUserId: string;
  mode?: ApplySectorTemplateMode;
}) {
  const result = await applySectorTemplateToOrganization({ organizationId, sectorId, actorUserId, mode });
  const commonModules = await ensureCanonicalCommonModulesForOrganization({ organizationId });
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: {
      sectorCode: true,
      enterpriseModules: {
        select: { id: true, moduleCode: true, isEnabled: true },
      },
      enterpriseActivityBlocks: {
        select: { id: true, targetModuleCode: true, isEnabled: true },
      },
    },
  });
  if (!organization) {
    return { ...result, commonModuleCount: commonModules.length };
  }

  const moduleIdsToDisable = new Set<string>();
  const activityBlockIdsToDisable = new Set<string>();
  const canonicalRows = new Set(
    organization.enterpriseModules
      .filter((tenantModule) => tenantModule.moduleCode === normalizeEnterpriseModuleCode(tenantModule.moduleCode))
      .map((tenantModule) => tenantModule.moduleCode),
  );

  for (const tenantModule of organization.enterpriseModules) {
    const canonicalCode = normalizeEnterpriseModuleCode(tenantModule.moduleCode);
    const definition = getEnterpriseModuleDefinition(canonicalCode);
    const aliasIsDuplicated = tenantModule.moduleCode !== canonicalCode && canonicalRows.has(canonicalCode);
    const mustRemainDisabled =
      !definition ||
      !isEnterpriseModuleImplemented(canonicalCode) ||
      !isEnterpriseModuleSectorCompatible(definition, organization.sectorCode) ||
      definition.routeKind === "ADMIN_SECTION" ||
      definition.routeKind === "HIDDEN" ||
      aliasIsDuplicated;
    if (tenantModule.isEnabled && mustRemainDisabled) {
      moduleIdsToDisable.add(tenantModule.id);
    }
  }

  for (const activityBlock of organization.enterpriseActivityBlocks) {
    if (!activityBlock.targetModuleCode) {
      continue;
    }
    const definition = getEnterpriseModuleDefinition(activityBlock.targetModuleCode);
    if (
      !definition ||
      !isEnterpriseModuleImplemented(definition.code) ||
      !isEnterpriseModuleSectorCompatible(definition, organization.sectorCode) ||
      definition.routeKind === "ADMIN_SECTION" ||
      definition.routeKind === "HIDDEN"
    ) {
      activityBlockIdsToDisable.add(activityBlock.id);
    }
  }

  await prisma.$transaction([
    prisma.enterpriseModule.updateMany({
      where: { id: { in: Array.from(moduleIdsToDisable) } },
      data: { isEnabled: false },
    }),
    prisma.enterpriseActivityBlock.updateMany({
      where: { id: { in: Array.from(activityBlockIdsToDisable) } },
      data: { isEnabled: false },
    }),
  ]);

  return {
    ...result,
    commonModuleCount: commonModules.length,
    registryNormalization: {
      disabledModuleCount: moduleIdsToDisable.size,
      disabledActivityBlockCount: activityBlockIdsToDisable.size,
    },
  };
}
