import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";

export async function getEnterpriseActivityHealthcareRecords(organizationId: string, sectorCode: string | null | undefined) {
  if (sectorCode !== HEALTHCARE_SECTOR_CODE) {
    return [];
  }
  const entitlements = await getOrganizationEntitlements(organizationId);
  const allowedModuleCodes = (entitlements?.modules || []).filter((enterpriseModule) => enterpriseModule.allowed).map((enterpriseModule) => enterpriseModule.moduleCode);
  if (!allowedModuleCodes.length) {
    return [];
  }

  return prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: HEALTHCARE_SECTOR_CODE, moduleCode: { in: allowedModuleCodes }, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      moduleCode: true,
      title: true,
      status: true,
      payloadJson: true,
    },
  });
}
