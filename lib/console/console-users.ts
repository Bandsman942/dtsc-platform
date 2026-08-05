import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { buildConsolePagination, normalizeConsoleSearch, parseConsolePagination } from "@/lib/console/console-pagination";
import { prisma } from "@/lib/prisma";

export type ConsoleUserQuery = {
  page?: string | number | null;
  pageSize?: string | number | null;
  search?: string | null;
  role?: UserRole;
  status?: UserStatus;
  organizationId?: string | null;
};

export async function getConsoleUsersDataset(input: ConsoleUserQuery = {}) {
  const paging = parseConsolePagination({ page: input.page, pageSize: input.pageSize, defaultPageSize: 25, maxPageSize: 100 });
  const search = normalizeConsoleSearch(input.search);
  const where: Prisma.UserWhereInput = {
    ...(input.role ? { role: input.role } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.organizationId
      ? { organizationMemberships: { some: { organizationId: input.organizationId, status: "ACTIVE", removedAt: null } } }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { companyName: { contains: search, mode: "insensitive" } },
            { jobTitle: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, filteredTotal, userCount, activeUserCount, newUsers30Days, tokenAggregate, aiCostAggregate] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        _count: { select: { conversations: true, supportTickets: true, organizationMemberships: true } },
        organizationMemberships: {
          where: { status: "ACTIVE", removedAt: null },
          select: { organizationId: true, role: true, organization: { select: { name: true, status: true } } },
          take: 10,
        },
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: { plan: { select: { name: true, slug: true } } },
        },
      },
      skip: paging.skip,
      take: paging.take,
    }),
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    prisma.usageLog.aggregate({ _sum: { totalTokens: true } }),
    prisma.usageLog.aggregate({ _sum: { estimatedCost: true } }),
  ]);

  return {
    users,
    userCount,
    activeUserCount,
    newUsers30Days,
    totalTokens: tokenAggregate._sum.totalTokens || 0,
    estimatedAiCost: Number(aiCostAggregate._sum.estimatedCost || 0),
    pagination: buildConsolePagination(filteredTotal, paging.page, paging.pageSize),
    filters: { search, role: input.role || null, status: input.status || null, organizationId: input.organizationId || null },
    freshness: new Date().toISOString(),
  };
}
