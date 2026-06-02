import { prisma } from "@/lib/prisma";

export async function getConsoleClientOrganizationsDataset({ loadClientOrganizationDetails }: { loadClientOrganizationDetails: boolean }) {
  const [clientOrganizations, billingPlans, businessSectors] = await Promise.all([
    loadClientOrganizationDetails ? prisma.organization.findMany({
      where: { organizationType: "CLIENT", deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } }, take: 20 },
        subscriptions: {
          include: { plan: { select: { id: true, name: true, slug: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } },
      },
      take: 200,
    }) : Promise.resolve([]),
    loadClientOrganizationDetails ? prisma.billingPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }) : Promise.resolve([]),
    loadClientOrganizationDetails ? prisma.businessSector.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      select: { id: true, code: true, labelFr: true, labelEn: true, descriptionFr: true, descriptionEn: true, icon: true, color: true },
    }) : Promise.resolve([]),
  ]);

  return { clientOrganizations, billingPlans, businessSectors };
}
