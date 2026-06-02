import { DocumentStatus, PaymentStatus, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildMetricPoints, classifyAuditSeverity, type RawMetricRow } from "@/lib/console/console-utils";

type RawModelRow = { model: string; count: number | bigint; tokens: number | bigint };

export async function getConsoleOverviewMetrics({
  activeUserCount,
  conversationCount,
  messageCount,
  selectedDate,
  selectedPeriod,
  totalTokens,
  userCount,
  visitEnd,
  visitStart,
}: {
  activeUserCount: number;
  conversationCount: number;
  messageCount: number;
  selectedDate?: string;
  selectedPeriod: number;
  totalTokens: number;
  userCount: number;
  visitEnd: Date;
  visitStart: Date;
}) {
  const periodWhere = { createdAt: { gte: visitStart, lte: visitEnd } };
  const subscriptionExpiryLimit = new Date();
  subscriptionExpiryLimit.setDate(subscriptionExpiryLimit.getDate() + 30);

  const [
    visitRows,
    messageRows,
    tokenRows,
    visitTotal,
    usersInPeriod,
    conversationsInPeriod,
    messagesInPeriod,
    tokensInPeriod,
    ticketsInPeriod,
    resolvedTicketsInPeriod,
    contactsInPeriod,
    subscribersInPeriod,
    paidPaymentsInPeriod,
    apiErrorsInPeriod,
    readyDocuments,
    publishedPublicationsCount,
    draftPublicationsCount,
    roleBreakdown,
    ticketBreakdown,
    paymentBreakdown,
    topModels,
    consoleActiveClientOrganizations,
    consoleActiveSubscriptions,
    consoleExpiringSubscriptions,
    consoleOpenTickets,
    consoleCriticalTickets,
    consoleEnabledModules,
    consoleRecentIncidents,
    consoleSensitiveAudits,
    consoleSecurityEvents,
  ] = await Promise.all([
    prisma.$queryRaw<RawMetricRow[]>`
      SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
      FROM "SiteVisit"
      WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
      GROUP BY DATE("createdAt")
      ORDER BY DATE("createdAt") ASC
    `,
    prisma.$queryRaw<RawMetricRow[]>`
      SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
      FROM "Message"
      WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
      GROUP BY DATE("createdAt")
      ORDER BY DATE("createdAt") ASC
    `,
    prisma.$queryRaw<RawMetricRow[]>`
      SELECT DATE("createdAt") AS date, COALESCE(SUM("totalTokens"), 0)::int AS count
      FROM "UsageLog"
      WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
      GROUP BY DATE("createdAt")
      ORDER BY DATE("createdAt") ASC
    `,
    prisma.siteVisit.count({ where: periodWhere }),
    prisma.user.count({ where: periodWhere }),
    prisma.conversation.count({ where: periodWhere }),
    prisma.message.count({ where: periodWhere }),
    prisma.usageLog.aggregate({ where: periodWhere, _sum: { totalTokens: true } }),
    prisma.supportTicket.count({ where: periodWhere }),
    prisma.supportTicket.count({ where: { resolvedAt: { gte: visitStart, lte: visitEnd } } }),
    prisma.contactMessage.count({ where: periodWhere }),
    prisma.newsletterSubscriber.count({ where: periodWhere }),
    prisma.payment.aggregate({ where: { ...periodWhere, status: { in: [PaymentStatus.ACCEPTED, PaymentStatus.PAID] } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.apiLog.count({ where: { ...periodWhere, statusCode: { gte: 400 } } }),
    prisma.knowledgeDocument.count({ where: { status: DocumentStatus.READY } }),
    prisma.publicPublication.count({ where: { published: true } }),
    prisma.publicPublication.count({ where: { published: false } }),
    prisma.user.groupBy({ by: ["role"], where: periodWhere, _count: { _all: true } }),
    prisma.supportTicket.groupBy({ by: ["status"], where: periodWhere, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["status"], where: periodWhere, _count: { _all: true } }),
    prisma.$queryRaw<RawModelRow[]>`
      SELECT "model", COUNT(*)::int AS count, COALESCE(SUM("totalTokens"), 0)::int AS tokens
      FROM "UsageLog"
      WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd}
      GROUP BY "model"
      ORDER BY tokens DESC
      LIMIT 5
    `,
    prisma.organization.count({ where: { organizationType: "CLIENT", status: "ACTIVE", deletedAt: null } }),
    prisma.organizationSubscription.count({
      where: {
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        organization: { organizationType: "CLIENT", deletedAt: null },
      },
    }),
    prisma.organizationSubscription.count({
      where: {
        status: "ACTIVE",
        expiresAt: { gte: new Date(), lte: subscriptionExpiryLimit },
        organization: { organizationType: "CLIENT", deletedAt: null },
      },
    }),
    prisma.supportTicket.count({ where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.supportTicket.count({ where: { priority: TicketPriority.URGENT, status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.enterpriseModule.count({ where: { isEnabled: true, organization: { organizationType: "CLIENT", deletedAt: null } } }),
    prisma.apiLog.findMany({
      where: { statusCode: { gte: 500 } },
      orderBy: { createdAt: "desc" },
      select: { id: true, method: true, path: true, statusCode: true, createdAt: true },
      take: 6,
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { contains: "DELETE" } },
          { action: { contains: "ARCHIVE" } },
          { action: { contains: "ROLE" } },
          { action: { contains: "PERMISSION" } },
          { action: { contains: "DENIED" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
      take: 6,
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { contains: "ACCESS_DENIED" } },
          { action: { contains: "FORBIDDEN" } },
          { action: { contains: "UNAUTHORIZED" } },
          { action: { contains: "LOGIN" } },
          { action: { contains: "SECURITY" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
      take: 6,
    }),
  ]);

  const visitPoints = buildMetricPoints({ rows: visitRows, selectedDate, selectedPeriod });
  const messagePoints = buildMetricPoints({ rows: messageRows, selectedDate, selectedPeriod });
  const tokenPoints = buildMetricPoints({ rows: tokenRows, selectedDate, selectedPeriod });

  return {
    visitPoints,
    visitTotal,
    overviewMetrics: {
      totals: {
        users: userCount,
        activeUsers: activeUserCount,
        conversations: conversationCount,
        messages: messageCount,
        tokens: totalTokens,
      },
      period: {
        users: usersInPeriod,
        conversations: conversationsInPeriod,
        messages: messagesInPeriod,
        tokens: tokensInPeriod._sum.totalTokens || 0,
        tickets: ticketsInPeriod,
        resolvedTickets: resolvedTicketsInPeriod,
        visits: visitTotal,
        contacts: contactsInPeriod,
        subscribers: subscribersInPeriod,
        payments: paidPaymentsInPeriod._count._all,
        revenue: Number(paidPaymentsInPeriod._sum.amount || 0),
        apiErrors: apiErrorsInPeriod,
        readyDocuments,
        publishedPublications: publishedPublicationsCount,
        draftPublications: draftPublicationsCount,
      },
      series: {
        visits: visitPoints.map((point) => ({ label: point.label, value: point.count })),
        messages: messagePoints.map((point) => ({ label: point.label, value: point.count })),
        tokens: tokenPoints.map((point) => ({ label: point.label, value: point.count })),
      },
      breakdowns: {
        roles: roleBreakdown.map((item) => ({ label: item.role, value: item._count._all })),
        tickets: ticketBreakdown.map((item) => ({ label: item.status, value: item._count._all })),
        payments: paymentBreakdown.map((item) => ({ label: item.status, value: item._count._all })),
      },
      topModels: topModels.map((item) => ({
        model: item.model,
        count: Number(item.count),
        tokens: Number(item.tokens),
      })),
    },
    consoleSaasOverview: {
      metrics: [
        { label: "Entreprises clientes actives", value: consoleActiveClientOrganizations, helper: "Organisations CLIENT actives et non archivées.", icon: "organizations" as const },
        { label: "Abonnements actifs", value: consoleActiveSubscriptions, helper: "Abonnements organisationnels actifs.", icon: "subscriptions" as const },
        { label: "Expirent bientôt", value: consoleExpiringSubscriptions, helper: "Échéance dans les 30 prochains jours.", icon: "expiring" as const },
        { label: "Tickets ouverts", value: consoleOpenTickets, helper: "Tickets OPEN ou IN_PROGRESS.", icon: "tickets" as const },
        { label: "Tickets critiques", value: consoleCriticalTickets, helper: "Priorité urgente encore ouverte.", icon: "critical" as const },
        { label: "Utilisateurs actifs", value: activeUserCount, helper: "Comptes avec statut ACTIVE.", icon: "users" as const },
        { label: "Modules activés", value: consoleEnabledModules, helper: "Modules entreprise actifs côté clients.", icon: "modules" as const },
        { label: "Indicateurs plateforme", value: apiErrorsInPeriod, helper: "Erreurs API sur la période filtrée.", icon: "platform" as const },
      ],
      incidents: consoleRecentIncidents.map((event) => ({
        id: event.id,
        title: `${event.method} ${event.path}`,
        detail: `HTTP ${event.statusCode}`,
        severity: event.statusCode >= 500 ? "CRITICAL" : "ERROR",
        createdAt: event.createdAt.toISOString(),
      })),
      sensitiveAudits: consoleSensitiveAudits.map((event) => ({
        id: event.id,
        title: `${event.action} · ${event.entity}`,
        detail: event.user ? `${event.user.name} · ${event.user.email}` : "Action système ou utilisateur supprimé",
        severity: classifyAuditSeverity(event.action),
        createdAt: event.createdAt.toISOString(),
      })),
      securityEvents: consoleSecurityEvents.map((event) => ({
        id: event.id,
        title: `${event.action} · ${event.entity}`,
        detail: event.user ? `${event.user.name} · ${event.user.email}` : "Action système ou utilisateur supprimé",
        severity: classifyAuditSeverity(event.action),
        createdAt: event.createdAt.toISOString(),
      })),
    },
  };
}
