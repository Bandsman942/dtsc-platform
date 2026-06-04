import { prisma } from "@/lib/prisma";

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";

export async function getEnterpriseHealthcareDataset(organizationId: string, sectorCode: string | null | undefined) {
  if (sectorCode !== HEALTHCARE_SECTOR_CODE) {
    return [];
  }

  return prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: HEALTHCARE_SECTOR_CODE, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
}
