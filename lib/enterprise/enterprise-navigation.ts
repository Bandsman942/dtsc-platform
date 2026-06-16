import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { getEnterpriseModulesDataset } from "@/lib/enterprise/enterprise-modules-loader";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";

export type EnterpriseNavigationModule = {
  code: string;
  label: string;
  description: string;
  category: string;
  isCore: boolean;
  icon: string | null;
};

export async function getEnterpriseNavigationModules(organizationId: string, userId: string, locale?: string | null): Promise<EnterpriseNavigationModule[]> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) {
    return [];
  }
  const dataset = await getEnterpriseModulesDataset(organizationId, entitlements);
  const coreModules = dataset.modules.filter((enterpriseModule) => enterpriseModule.isCore && enterpriseModule.isEnabled && enterpriseModule.accessAllowed);
  const accessChecks = await Promise.all(
    coreModules.map(async (enterpriseModule) => ({
      enterpriseModule,
      allowed: await canAccessEnterpriseModule(userId, organizationId, enterpriseModule.moduleCode, "read"),
    }))
  );
  return accessChecks
    .filter((item) => item.allowed)
    .map(({ enterpriseModule }) => ({
      code: enterpriseModule.moduleCode,
      label: locale === "en" ? enterpriseModule.labelEn : enterpriseModule.labelFr,
      description: locale === "en" ? enterpriseModule.descriptionEn || enterpriseModule.moduleCode : enterpriseModule.descriptionFr || enterpriseModule.moduleCode,
      category: enterpriseModule.moduleCategory,
      isCore: enterpriseModule.isCore,
      icon: enterpriseModule.icon,
    }));
}
