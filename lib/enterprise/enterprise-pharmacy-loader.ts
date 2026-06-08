import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

const PHARMACY_SECTOR_CODE = "PHARMACY";

export async function getEnterprisePharmacyDataset(organizationId: string, sectorCode: string | null | undefined) {
  if (sectorCode !== PHARMACY_SECTOR_CODE) {
    return [];
  }
  const entitlements = await getOrganizationEntitlements(organizationId);
  const allowedModuleCodes = (entitlements?.modules || []).filter((enterpriseModule) => enterpriseModule.allowed).map((enterpriseModule) => enterpriseModule.moduleCode);
  if (!allowedModuleCodes.length) {
    return [];
  }

  return prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode: { in: allowedModuleCodes }, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
}
