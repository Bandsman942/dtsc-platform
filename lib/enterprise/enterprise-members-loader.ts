import { prisma } from "@/lib/prisma";

export async function getEnterpriseMembersDataset(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId, removedAt: null },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    include: { user: { select: { id: true, name: true, email: true } } },
    take: 200,
  });
}
