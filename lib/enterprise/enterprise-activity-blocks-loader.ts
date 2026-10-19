import { prisma } from "@/lib/prisma";
import { getOrganizationEntitlements, resolveFeatureAccessFromEntitlements } from "@/lib/billing/entitlements";
import { canAccessEnterpriseActivity, ENTERPRISE_ADMIN_ROLES } from "@/lib/enterprise-sector-templates";
import { canonicalSectorActivityDestination } from "@/lib/enterprise/sector-activity-canonical-handoffs";

export async function getEnterpriseActivityBlocks(organizationId: string, userId?: string, sectorCode?: string | null) {
  const [blocks, entitlements, membership] = await Promise.all([
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      select: {
        id: true,
        blockCode: true,
        labelFr: true,
        labelEn: true,
        descriptionFr: true,
        icon: true,
        targetModuleCode: true,
      },
    }),
    getOrganizationEntitlements(organizationId),
    userId
      ? prisma.organizationMember.findFirst({
          where: {
            organizationId,
            userId,
            status: "ACTIVE",
            removedAt: null,
            organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
          },
          select: { role: true },
        })
      : Promise.resolve(null),
  ]);
  const allowedModuleCodes = new Set((entitlements?.modules || []).filter((enterpriseModule) => enterpriseModule.allowed).map((enterpriseModule) => enterpriseModule.moduleCode));
  // Legacy PROFESSIONAL_SERVICES template uses non-canonical TIMESHEETS / DELIVERABLES
  // codes. Only the dedicated Activities page passes sectorCode and may expose
  // their canonical handoffs; shells preserve the existing entitlement filter.
  const entitledBlocks = blocks.filter((block) => {
    if (!block.targetModuleCode || allowedModuleCodes.has(block.targetModuleCode)) return true;
    const destination = canonicalSectorActivityDestination(sectorCode, block.blockCode);
    return Boolean(destination && allowedModuleCodes.has(destination.moduleCode));
  });
  if (!userId) {
    return entitledBlocks;
  }
  const activityFeatureAccess = resolveFeatureAccessFromEntitlements(entitlements, "enterprise-activities");
  if (!activityFeatureAccess.allowed || !membership) {
    return [];
  }
  if (ENTERPRISE_ADMIN_ROLES.has(membership.role)) {
    return entitledBlocks;
  }
  const accessChecks = await Promise.all(
    entitledBlocks.map(async (block) => ({
      block,
      allowed: await canAccessEnterpriseActivity(userId, organizationId, block.blockCode, "read"),
    }))
  );
  return accessChecks.filter((item) => item.allowed).map((item) => item.block);
}
