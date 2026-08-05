import { Prisma } from "@prisma/client";
import { buildConsolePagination, normalizeConsoleSearch, parseConsolePagination } from "@/lib/console/console-pagination";
import { prisma } from "@/lib/prisma";

export async function getConsoleClientOrganizationsDataset(input: {
  page?: string | number | null;
  pageSize?: string | number | null;
  search?: string | null;
  status?: string | null;
  sectorId?: string | null;
  planId?: string | null;
} = {}) {
  const paging = parseConsolePagination({ page: input.page, pageSize: input.pageSize, defaultPageSize: 20, maxPageSize: 100 });
  const search = normalizeConsoleSearch(input.search);
  const where: Prisma.OrganizationWhereInput = {
    organizationType: "CLIENT",
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.sectorId ? { sectorId: input.sectorId } : {}),
    ...(input.planId ? { subscriptions: { some: { planId: input.planId } } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { sector: { contains: search, mode: "insensitive" } },
            { industry: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [clientOrganizations, total, billingPlans, businessSectors, statusBreakdown] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        members: {
          where: { status: "ACTIVE", removedAt: null },
          include: { user: { select: { id: true, name: true, email: true, status: true } } },
          take: 20,
        },
        adminGrants: { where: { status: "ACTIVE", revokedAt: null }, select: { userId: true, grantedAt: true }, take: 10 },
        subscriptions: {
          include: { plan: { select: { id: true, name: true, slug: true, priceUsd: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        businessSector: { select: { id: true, code: true, labelFr: true, labelEn: true, icon: true, color: true } },
        enterpriseModules: { select: { moduleCode: true, isEnabled: true } },
        _count: { select: { members: true, supportTickets: true } },
      },
      skip: paging.skip,
      take: paging.take,
    }),
    prisma.organization.count({ where }),
    prisma.billingPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    prisma.businessSector.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
      select: { id: true, code: true, labelFr: true, labelEn: true, descriptionFr: true, descriptionEn: true, icon: true, color: true },
    }),
    prisma.organization.groupBy({ by: ["status"], where: { organizationType: "CLIENT", deletedAt: null }, _count: { _all: true } }),
  ]);

  return {
    clientOrganizations,
    billingPlans,
    businessSectors,
    pagination: buildConsolePagination(total, paging.page, paging.pageSize),
    filters: { search, status: input.status || null, sectorId: input.sectorId || null, planId: input.planId || null },
    statusBreakdown: statusBreakdown.map((item) => ({ status: item.status, count: item._count._all })),
    freshness: new Date().toISOString(),
  };
}
