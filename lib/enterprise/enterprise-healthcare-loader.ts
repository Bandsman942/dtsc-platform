import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { safeHealthLegacyProjection } from "@/lib/health-legacy-projection";

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";

export async function getEnterpriseHealthcareDataset(organizationId: string, sectorCode: string | null | undefined) {
  if (sectorCode !== HEALTHCARE_SECTOR_CODE) {
    return [];
  }
  const entitlements = await getOrganizationEntitlements(organizationId);
  const allowedModuleCodes = (entitlements?.modules || []).filter((enterpriseModule) => enterpriseModule.allowed).map((enterpriseModule) => enterpriseModule.moduleCode);
  if (!allowedModuleCodes.length) {
    return [];
  }

  const records = await prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: HEALTHCARE_SECTOR_CODE, moduleCode: { in: allowedModuleCodes }, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  return records.map(safeHealthLegacyProjection);
}
