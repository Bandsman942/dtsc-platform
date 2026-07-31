import { listNavigableEnterpriseModules } from "@/lib/enterprise/module-access";
import {
  getEnterpriseModuleDescription,
  getEnterpriseModuleGroupLabel,
  getEnterpriseModuleLabel,
  type EnterpriseModuleDomain,
  type EnterpriseModuleImplementationStatus,
  type EnterpriseModuleNavigationGroup,
} from "@/lib/enterprise/module-registry";

export type EnterpriseNavigationModule = {
  code: string;
  label: string;
  description: string;
  category: string;
  domain: EnterpriseModuleDomain;
  implementationStatus: EnterpriseModuleImplementationStatus;
  navigationGroup: EnterpriseModuleNavigationGroup;
  navigationGroupLabel: string;
  navigationOrder: number;
  isCore: boolean;
  icon: string | null;
  href: string;
};

export async function getEnterpriseNavigationModules(
  organizationId: string,
  userId: string,
  locale?: string | null,
): Promise<EnterpriseNavigationModule[]> {
  const decisions = await listNavigableEnterpriseModules({ organizationId, userId, action: "read" });
  return decisions.flatMap((decision) => {
    const definition = decision.definition;
    if (!definition?.routePath) {
      return [];
    }
    return [{
      code: definition.code,
      label: getEnterpriseModuleLabel(definition, locale),
      description: getEnterpriseModuleDescription(definition, locale),
      category: definition.domain,
      domain: definition.domain,
      implementationStatus: definition.implementationStatus,
      navigationGroup: definition.navigationGroup,
      navigationGroupLabel: getEnterpriseModuleGroupLabel(definition.navigationGroup, locale),
      navigationOrder: definition.navigationOrder,
      isCore: definition.routeKind === "DEDICATED_CORE" || definition.routeKind === "AI_SERVICE",
      icon: definition.iconKey,
      href: definition.routePath,
    }];
  });
}
