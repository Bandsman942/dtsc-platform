import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { buildConsolePagination, normalizeConsoleSearchParams } from "@/lib/console/console-utils";
import { prisma } from "@/lib/prisma";

export async function getConsoleSupport(searchParams: Record<string, string | string[] | undefined> = {}) {
  const paging = normalizeConsoleSearchParams(searchParams, { pageSize: 30 });
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  const priority = typeof searchParams.priority === "string" ? searchParams.priority : undefined;
  const assignedToUserId = typeof searchParams.assignedToUserId === "string" ? searchParams.assignedToUserId : undefined;
  const organizationId = typeof searchParams.organizationId === "string" ? searchParams.organizationId : undefined;
  const overdue = searchParams.overdue === "true";
  const now = new Date();

  const filters: Prisma.SupportTicketWhereInput[] = [];
  if (status && Object.values(TicketStatus).includes(status as TicketStatus)) filters.push({ status: status as TicketStatus });
  if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) filters.push({ priority: priority as TicketPriority });
  if (assignedToUserId) filters.push({ assignedToUserId });
  if (organizationId) filters.push({ organizationId });
  if (paging.query) {
    filters.push({
      OR: [
        { ticketNumber: { contains: paging.query, mode: "insensitive" } },
        { subject: { contains: paging.query, mode: "insensitive" } },
        { message: { contains: paging.query, mode: "insensitive" } },
        { user: { is: { OR: [{ name: { contains: paging.query, mode: "insensitive" } }, { email: { contains: paging.query, mode: "insensitive" } }] } } },
        { organization: { is: { name: { contains: paging.query, mode: "insensitive" } } } },
      ],
    });
  }
  if (overdue) {
    filters.push({
      status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
      OR: [
        { slaFirstResponseDueAt: { lt: now }, firstRespondedAt: null },
        { slaResolutionDueAt: { lt: now }, resolvedAt: null },
      ],
    });
  }

  const where: Prisma.SupportTicketWhereInput = filters.length ? { AND: filters } : {};
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
    filters: { status, priority, assignedToUserId, organizationId, overdue, query: paging.query },
  };
}
