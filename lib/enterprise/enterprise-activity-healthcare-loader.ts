import { prisma } from "@/lib/prisma";

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";

export async function getEnterpriseActivityHealthcareRecords(organizationId: string, sectorCode: string | null | undefined) {
  if (sectorCode !== HEALTHCARE_SECTOR_CODE) {
    return [];
  }

  return prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: HEALTHCARE_SECTOR_CODE, deletedAt: null },
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
