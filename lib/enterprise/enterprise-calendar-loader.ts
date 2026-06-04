import { prisma } from "@/lib/prisma";

export async function getEnterpriseCalendarDataset(organizationId: string) {
  return prisma.internalCalendarEvent.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ startDateTime: "asc" }, { createdAt: "desc" }],
    take: 40,
    include: { participants: true },
  });
}
