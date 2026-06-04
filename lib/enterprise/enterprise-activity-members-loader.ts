import { prisma } from "@/lib/prisma";

export async function getEnterpriseActivityMembers(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", removedAt: null },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    include: { user: { select: { id: true, name: true, email: true } } },
    take: 200,
  });
}
