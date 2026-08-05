import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { buildConsolePagination, normalizeConsoleSearch, parseConsolePagination } from "@/lib/console/console-pagination";
import { prisma } from "@/lib/prisma";

export async function getConsoleSupportDataset(input: {
  page?: string | number | null;
  pageSize?: string | number | null;
  search?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  organizationId?: string | null;
  assignedToDtscUserId?: string | null;
  overdueOnly?: boolean;
} = {}) {
  const paging = parseConsolePagination({ page: input.page, pageSize: input.pageSize, defaultPageSize: 25, maxPageSize: 100 });
  const search = normalizeConsoleSearch(input.search);
  const now = new Date();
  const where: Prisma.SupportTicketWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.assignedToDtscUserId ? { assignedToDtscUserId: input.assignedToDtscUserId } : {}),
    ...(input.overdueOnly
      ? {
          OR: [
            { slaFirstResponseDueAt: { lt: now }, firstRespondedAt: null },
            { slaResolutionDueAt: { lt: now }, resolvedAt: null },
          ],
        }
      : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
            { user: { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } },
            { organization: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [tickets, total, openCount, urgentCount, overdueCount, resolvedRows, assignees] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        organization: { select: { id: true, name: true, status: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
          take: 10,
        },
        _count: { select: { messages: true } },
      },
      skip: paging.skip,
      take: paging.take,
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.count({ where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.supportTicket.count({ where: { priority: TicketPriority.URGENT, status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.supportTicket.count({ where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] }, OR: [{ slaFirstResponseDueAt: { lt: now }, firstRespondedAt: null }, { slaResolutionDueAt: { lt: now }, resolvedAt: null }] } }),
    prisma.supportTicket.findMany({ where: { resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true }, orderBy: { resolvedAt: "desc" }, take: 1000 }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPPORT", "MANAGER"] }, status: "ACTIVE", organizationMemberships: { some: { organization: { organizationType: "DTSC_INTERNAL", deletedAt: null }, status: "ACTIVE", removedAt: null } } }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" }, take: 100 }),
  ]);

  const resolutionDurations = resolvedRows
    .map((ticket) => ticket.resolvedAt ? ticket.resolvedAt.getTime() - ticket.createdAt.getTime() : null)
    .filter((value): value is number => value !== null && value >= 0);

  return {
    tickets,
    conversations: [],
    assignees,
    pagination: buildConsolePagination(total, paging.page, paging.pageSize),
    summary: {
      open: openCount,
      urgent: urgentCount,
      overdue: overdueCount,
      averageResolutionHours: resolutionDurations.length
        ? Number((resolutionDurations.reduce((sum, value) => sum + value, 0) / resolutionDurations.length / 3_600_000).toFixed(1))
        : null,
    },
    filters: {
      search,
      status: input.status || null,
      priority: input.priority || null,
      organizationId: input.organizationId || null,
      assignedToDtscUserId: input.assignedToDtscUserId || null,
      overdueOnly: Boolean(input.overdueOnly),
    },
    freshness: new Date().toISOString(),
  };
}
