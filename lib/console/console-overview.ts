import { DocumentStatus, PaymentStatus, TicketPriority, TicketStatus, UserStatus } from "@prisma/client";
import { getConsoleSectionHref } from "@/lib/console/console-routes";
import { classifyAuditSeverity, buildMetricPoints, type RawMetricRow } from "@/lib/console/console-utils";
import { prisma } from "@/lib/prisma";

type RawModelRow = { model: string; count: number | bigint; tokens: number | bigint };

export type ConsoleMetric = {
  code: string;
  label: string;
  value: number | string;
  helper: string;
  icon: "organizations" | "subscriptions" | "expiring" | "tickets" | "critical" | "users" | "modules" | "platform";
  source: string;
  definition: string;
  period: string;
  freshness: string;
  unit: string;
  href: string;
};

export type ConsoleActionItem = {
  id: string;
  source: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  detail: string;
  count: number;
  href: string;
  capability: string;
  dueAt: string | null;
};

export type ConsoleHealthSignal = {
  code: string;
  label: string;
  status: "OPERATIONAL" | "DEGRADED" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "MAINTENANCE" | "UNKNOWN";
  source: string;
  detail: string;
  checkedAt: string;
};

export async function getConsoleOverviewMetrics(input: {
  selectedDate?: string;
  selectedPeriod: number;
  visitEnd: Date;
  visitStart: Date;
}) {
  const { selectedDate, selectedPeriod, visitEnd, visitStart } = input;
  const periodWhere = { createdAt: { gte: visitStart, lte: visitEnd } };
  const now = new Date();
  const freshness = now.toISOString();
  const periodLabel = selectedDate ? selectedDate : `${selectedPeriod}d`;
  const expiryLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    visitRows, messageRows, tokenRows,
    userCount, activeUserCount, usersInPeriod, conversationCount, conversationsInPeriod, messageCount, messagesInPeriod,
    totalTokenAggregate, periodTokenAggregate, periodAiCostAggregate, visitTotal, ticketsInPeriod, resolvedTicketsInPeriod,
    contactsInPeriod, subscribersInPeriod, paidPaymentsInPeriod, failedPayments, apiErrorsInPeriod, webhookFailures,
    readyDocuments, publishedPublicationsCount, draftPublicationsCount, roleBreakdown, ticketBreakdown, paymentBreakdown, topModels,
    activeClientOrganizations, clientOrganizations, activeSubscriptions, trialSubscriptions, expiringSubscriptions, pastDueSubscriptions,
    openTickets, criticalTickets, enabledModules, persistedIncidents, recentApiIncidents, recentWebhookIncidents, sensitiveAudits, securityEvents,
    averageResolutionRows, maturityEvidencePending,
  ] = await Promise.all([
    prisma.$queryRaw<RawMetricRow[]>`SELECT DATE("createdAt") AS date, COUNT(*)::int AS count FROM "SiteVisit" WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd} GROUP BY DATE("createdAt") ORDER BY DATE("createdAt") ASC`,
    prisma.$queryRaw<RawMetricRow[]>`SELECT DATE("createdAt") AS date, COUNT(*)::int AS count FROM "Message" WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd} GROUP BY DATE("createdAt") ORDER BY DATE("createdAt") ASC`,
    prisma.$queryRaw<RawMetricRow[]>`SELECT DATE("createdAt") AS date, COALESCE(SUM("totalTokens"), 0)::int AS count FROM "UsageLog" WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd} GROUP BY DATE("createdAt") ORDER BY DATE("createdAt") ASC`,
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: periodWhere }),
    prisma.conversation.count(),
    prisma.conversation.count({ where: periodWhere }),
    prisma.message.count(),
    prisma.message.count({ where: periodWhere }),
    prisma.usageLog.aggregate({ _sum: { totalTokens: true } }),
    prisma.usageLog.aggregate({ where: periodWhere, _sum: { totalTokens: true } }),
    prisma.usageLog.aggregate({ where: periodWhere, _sum: { estimatedCost: true } }),
    prisma.siteVisit.count({ where: periodWhere }),
    prisma.supportTicket.count({ where: periodWhere }),
    prisma.supportTicket.count({ where: { resolvedAt: { gte: visitStart, lte: visitEnd } } }),
    prisma.contactMessage.count({ where: periodWhere }),
    prisma.newsletterSubscriber.count({ where: periodWhere }),
    prisma.payment.aggregate({ where: { ...periodWhere, status: { in: [PaymentStatus.ACCEPTED, PaymentStatus.PAID] } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.payment.count({ where: { ...periodWhere, status: PaymentStatus.FAILED } }),
    prisma.apiLog.count({ where: { ...periodWhere, statusCode: { gte: 400 } } }),
    prisma.webhookEvent.count({ where: { ...periodWhere, status: { in: ["FAILED", "ERROR", "RETRY_REQUIRED"] } } }),
    prisma.knowledgeDocument.count({ where: { status: DocumentStatus.READY } }),
    prisma.publicPublication.count({ where: { published: true } }),
    prisma.publicPublication.count({ where: { published: false } }),
    prisma.user.groupBy({ by: ["role"], where: periodWhere, _count: { _all: true } }),
    prisma.supportTicket.groupBy({ by: ["status"], where: periodWhere, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["status"], where: periodWhere, _count: { _all: true } }),
    prisma.$queryRaw<RawModelRow[]>`SELECT "model", COUNT(*)::int AS count, COALESCE(SUM("totalTokens"), 0)::int AS tokens FROM "UsageLog" WHERE "createdAt" >= ${visitStart} AND "createdAt" <= ${visitEnd} GROUP BY "model" ORDER BY tokens DESC LIMIT 5`,
    prisma.organization.count({ where: { organizationType: "CLIENT", status: "ACTIVE", deletedAt: null } }),
    prisma.organization.count({ where: { organizationType: "CLIENT", deletedAt: null } }),
    prisma.organizationSubscription.count({ where: { status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], organization: { organizationType: "CLIENT", deletedAt: null } } }),
    prisma.organizationSubscription.count({ where: { status: "TRIAL", organization: { organizationType: "CLIENT", deletedAt: null } } }),
    prisma.organizationSubscription.count({ where: { status: "ACTIVE", expiresAt: { gte: now, lte: expiryLimit }, organization: { organizationType: "CLIENT", deletedAt: null } } }),
    prisma.organizationSubscription.count({ where: { status: { in: ["PAST_DUE", "PENDING_PAYMENT", "SUSPENDED"] }, organization: { organizationType: "CLIENT", deletedAt: null } } }),
    prisma.supportTicket.count({ where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.supportTicket.count({ where: { priority: TicketPriority.URGENT, status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.enterpriseModule.count({ where: { isEnabled: true, organization: { organizationType: "CLIENT", deletedAt: null } } }),
    prisma.platformIncident.findMany({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } }, orderBy: [{ severity: "desc" }, { startedAt: "desc" }], take: 8 }),
    prisma.apiLog.findMany({ where: { statusCode: { gte: 500 } }, orderBy: { createdAt: "desc" }, select: { id: true, method: true, path: true, statusCode: true, createdAt: true }, take: 5 }),
    prisma.webhookEvent.findMany({ where: { status: { in: ["FAILED", "ERROR", "RETRY_REQUIRED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, provider: true, eventType: true, status: true, lastError: true, createdAt: true }, take: 5 }),
    prisma.auditLog.findMany({ where: { OR: [{ action: { contains: "DELETE" } }, { action: { contains: "ARCHIVE" } }, { action: { contains: "ROLE" } }, { action: { contains: "PERMISSION" } }, { action: { contains: "DENIED" } }] }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } }, take: 6 }),
    prisma.auditLog.findMany({ where: { OR: [{ action: { contains: "ACCESS_DENIED" } }, { action: { contains: "FORBIDDEN" } }, { action: { contains: "UNAUTHORIZED" } }, { action: { contains: "LOGIN" } }, { action: { contains: "SECURITY" } }] }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } }, take: 6 }),
    prisma.supportTicket.findMany({ where: { resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true }, orderBy: { resolvedAt: "desc" }, take: 1000 }),
    prisma.commercialMaturityEvidence.count({ where: { ownerValidated: false } }),
  ]);

  const resolutionHours = averageResolutionRows
    .map((ticket) => ticket.resolvedAt ? (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 3_600_000 : null)
    .filter((value): value is number => value !== null && value >= 0);
  const averageResolutionHours = resolutionHours.length ? Number((resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length).toFixed(1)) : null;
  const totalTokens = totalTokenAggregate._sum.totalTokens || 0;
  const periodTokens = periodTokenAggregate._sum.totalTokens || 0;
  const aiCost = Number(periodAiCostAggregate._sum.estimatedCost || 0);
  const validatedRevenue = Number(paidPaymentsInPeriod._sum.amount || 0);

  const metric = (data: Omit<ConsoleMetric, "period" | "freshness">): ConsoleMetric => ({ ...data, period: periodLabel, freshness });
  const metrics: ConsoleMetric[] = [
    metric({ code: "ACTIVE_CLIENT_ORGANIZATIONS", label: "Entreprises clientes actives", value: activeClientOrganizations, helper: `${clientOrganizations} entreprise(s) cliente(s) enregistrée(s).`, icon: "organizations", source: "Organization", definition: "Organisation CLIENT, ACTIVE et non supprimée.", unit: "organisations", href: getConsoleSectionHref("organizations", { status: "ACTIVE" }) }),
    metric({ code: "ACTIVE_SUBSCRIPTIONS", label: "Abonnements actifs", value: activeSubscriptions, helper: `${trialSubscriptions} essai(s) actif(s).`, icon: "subscriptions", source: "OrganizationSubscription", definition: "Abonnement organisationnel ACTIVE non expiré.", unit: "abonnements", href: getConsoleSectionHref("subscriptions", { status: "ACTIVE" }) }),
    metric({ code: "EXPIRING_SUBSCRIPTIONS", label: "Expirent bientôt", value: expiringSubscriptions, helper: "Échéance dans les 30 prochains jours.", icon: "expiring", source: "OrganizationSubscription.expiresAt", definition: "Abonnement ACTIVE dont l’échéance est comprise entre maintenant et J+30.", unit: "abonnements", href: getConsoleSectionHref("subscriptions", { expiring: "30" }) }),
    metric({ code: "OPEN_TICKETS", label: "Tickets ouverts", value: openTickets, helper: averageResolutionHours === null ? "Temps moyen indisponible." : `${averageResolutionHours} h de résolution moyenne.`, icon: "tickets", source: "SupportTicket", definition: "Ticket OPEN ou IN_PROGRESS.", unit: "tickets", href: getConsoleSectionHref("support", { status: "OPEN" }) }),
    metric({ code: "URGENT_TICKETS", label: "Tickets urgents", value: criticalTickets, helper: "Priorité URGENT encore ouverte.", icon: "critical", source: "SupportTicket.priority", definition: "Ticket URGENT, OPEN ou IN_PROGRESS.", unit: "tickets", href: getConsoleSectionHref("support", { priority: "URGENT" }) }),
    metric({ code: "ACTIVE_USERS", label: "Utilisateurs actifs", value: activeUserCount, helper: `${usersInPeriod} nouvelle(s) inscription(s) sur la période.`, icon: "users", source: "User.status", definition: "Compte utilisateur au statut ACTIVE.", unit: "utilisateurs", href: getConsoleSectionHref("users", { status: "ACTIVE" }) }),
    metric({ code: "ENABLED_MODULES", label: "Modules activés", value: enabledModules, helper: "Modules entreprise actifs chez les clients.", icon: "modules", source: "EnterpriseModule.isEnabled", definition: "Module entreprise activé pour une organisation CLIENT non supprimée.", unit: "modules", href: getConsoleSectionHref("organizations", { modules: "enabled" }) }),
    metric({ code: "API_ERRORS", label: "Erreurs API", value: apiErrorsInPeriod, helper: `${webhookFailures} webhook(s) en échec sur la période.`, icon: "platform", source: "ApiLog + WebhookEvent", definition: "Réponse HTTP ≥ 400 et webhook au statut d’échec.", unit: "événements", href: getConsoleSectionHref("security-audit", { source: "API", result: "ERROR" }) }),
    metric({ code: "VALIDATED_REVENUE", label: "Revenus validés", value: `${validatedRevenue.toFixed(2)} USD`, helper: `${paidPaymentsInPeriod._count._all} paiement(s) ACCEPTED ou PAID.`, icon: "subscriptions", source: "Payment", definition: "Somme des paiements ACCEPTED ou PAID sur la période, sans montant ambigu.", unit: "USD", href: getConsoleSectionHref("subscriptions", { paymentStatus: "PAID" }) }),
    metric({ code: "AI_USAGE", label: "Consommation IA", value: periodTokens, helper: `${aiCost.toFixed(4)} USD de coût estimé.`, icon: "platform", source: "UsageLog", definition: "Somme des tokens et du coût estimé sur la période.", unit: "tokens", href: getConsoleSectionHref("overview", { period: selectedPeriod }) }),
  ];

  const actionQueue = ([
    { id: "past-due", source: "OrganizationSubscription", priority: "HIGH", title: "Abonnements à traiter", detail: "Retards, paiements en attente ou suspensions.", count: pastDueSubscriptions, href: getConsoleSectionHref("subscriptions", { status: "PAST_DUE" }), capability: "CONSOLE_SUBSCRIPTIONS_MANAGE", dueAt: null },
    { id: "failed-payments", source: "Payment", priority: "HIGH", title: "Paiements échoués", detail: "Paiements FAILED sur la période sélectionnée.", count: failedPayments, href: getConsoleSectionHref("subscriptions", { paymentStatus: "FAILED" }), capability: "CONSOLE_SUBSCRIPTIONS_MANAGE", dueAt: null },
    { id: "urgent-tickets", source: "SupportTicket", priority: "CRITICAL", title: "Tickets urgents", detail: "Tickets urgents encore ouverts.", count: criticalTickets, href: getConsoleSectionHref("support", { priority: "URGENT" }), capability: "CONSOLE_SUPPORT_MANAGE", dueAt: null },
    { id: "webhooks", source: "WebhookEvent", priority: "HIGH", title: "Webhooks en échec", detail: "Événements nécessitant diagnostic ou retry contrôlé.", count: webhookFailures, href: getConsoleSectionHref("security-audit", { source: "WEBHOOK", result: "FAILED" }), capability: "CONSOLE_WEBHOOK_RETRY", dueAt: null },
    { id: "incidents", source: "PlatformIncident", priority: "CRITICAL", title: "Incidents ouverts", detail: "Incidents plateforme persistés non résolus.", count: persistedIncidents.length, href: getConsoleSectionHref("overview", { view: "health" }), capability: "CONSOLE_SECURITY_MANAGE", dueAt: null },
    { id: "maturity", source: "CommercialMaturityEvidence", priority: "MEDIUM", title: "Preuves de maturité en attente", detail: "Preuves non validées ou E2E non exécutés.", count: maturityEvidencePending, href: getConsoleSectionHref("module-maturity", { validation: "pending" }), capability: "CONSOLE_MODULE_MATURITY_MANAGE", dueAt: null },
  ] satisfies ConsoleActionItem[]).filter((item) => item.count > 0);

  const healthSignals: ConsoleHealthSignal[] = [
    { code: "APPLICATION", label: "Application", status: apiErrorsInPeriod > 50 ? "DEGRADED" : "OPERATIONAL", source: "ApiLog", detail: `${apiErrorsInPeriod} erreur(s) HTTP sur la période.`, checkedAt: freshness },
    { code: "DATABASE", label: "Base de données", status: "OPERATIONAL", source: "Requêtes Console réussies", detail: "Les agrégations canoniques de la Console ont répondu.", checkedAt: freshness },
    { code: "WEBHOOKS", label: "Webhooks", status: webhookFailures > 0 ? "DEGRADED" : "OPERATIONAL", source: "WebhookEvent", detail: `${webhookFailures} événement(s) en échec.`, checkedAt: freshness },
    { code: "PAYMENTS", label: "Paiements", status: failedPayments > 0 ? "DEGRADED" : "OPERATIONAL", source: "Payment", detail: `${failedPayments} paiement(s) FAILED sur la période.`, checkedAt: freshness },
    { code: "AI", label: "Fournisseurs IA", status: apiErrorsInPeriod > 0 && periodTokens === 0 ? "UNKNOWN" : "OPERATIONAL", source: "UsageLog + ApiLog", detail: `${periodTokens} token(s) consommé(s).`, checkedAt: freshness },
    { code: "EMAIL", label: "E-mails", status: "UNKNOWN", source: "Aucun health-check fournisseur persisté", detail: "Aucun signal fournisseur fiable disponible dans le schéma actuel.", checkedAt: freshness },
    { code: "PUSH", label: "Web Push", status: "UNKNOWN", source: "Aucun health-check fournisseur persisté", detail: "La Console ne fabrique pas un statut sans signal.", checkedAt: freshness },
    { code: "CALLS", label: "Appels audio/vidéo", status: "UNKNOWN", source: "Aucun health-check LiveKit persistant", detail: "État indéterminé sans télémétrie fournisseur persistée.", checkedAt: freshness },
  ];

  const incidentEvents = [
    ...persistedIncidents.map((event) => ({ id: event.id, title: event.title, detail: `${event.service} · ${event.status}`, severity: event.severity, createdAt: event.startedAt.toISOString() })),
    ...recentApiIncidents.map((event) => ({ id: event.id, title: `${event.method} ${event.path}`, detail: `HTTP ${event.statusCode}`, severity: "CRITICAL", createdAt: event.createdAt.toISOString() })),
    ...recentWebhookIncidents.map((event) => ({ id: event.id, title: `${event.provider} · ${event.eventType}`, detail: event.lastError || event.status, severity: "ERROR", createdAt: event.createdAt.toISOString() })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  return {
    visitPoints: buildMetricPoints({ rows: visitRows, selectedDate, selectedPeriod }),
    visitTotal,
    overviewMetrics: {
      totals: { users: userCount, activeUsers: activeUserCount, conversations: conversationCount, messages: messageCount, tokens: totalTokens },
      period: {
        users: usersInPeriod, conversations: conversationsInPeriod, messages: messagesInPeriod, tokens: periodTokens, tickets: ticketsInPeriod,
        resolvedTickets: resolvedTicketsInPeriod, visits: visitTotal, contacts: contactsInPeriod, subscribers: subscribersInPeriod,
        payments: paidPaymentsInPeriod._count._all, revenue: validatedRevenue, apiErrors: apiErrorsInPeriod, readyDocuments,
        publishedPublications: publishedPublicationsCount, draftPublications: draftPublicationsCount,
      },
      series: {
        visits: buildMetricPoints({ rows: visitRows, selectedDate, selectedPeriod }).map((point) => ({ label: point.label, value: point.count })),
        messages: buildMetricPoints({ rows: messageRows, selectedDate, selectedPeriod }).map((point) => ({ label: point.label, value: point.count })),
        tokens: buildMetricPoints({ rows: tokenRows, selectedDate, selectedPeriod }).map((point) => ({ label: point.label, value: point.count })),
      },
      breakdowns: {
        roles: roleBreakdown.map((item) => ({ label: item.role, value: item._count._all })),
        tickets: ticketBreakdown.map((item) => ({ label: item.status, value: item._count._all })),
        payments: paymentBreakdown.map((item) => ({ label: item.status, value: item._count._all })),
      },
      topModels: topModels.map((item) => ({ model: item.model, count: Number(item.count), tokens: Number(item.tokens) })),
    },
    consoleSaasOverview: {
      metrics,
      actionQueue,
      healthSignals,
      incidents: incidentEvents,
      sensitiveAudits: sensitiveAudits.map((event) => ({ id: event.id, title: `${event.action} · ${event.entity}`, detail: event.user ? `${event.user.name} · ${event.user.email}` : "Action système", severity: event.result || classifyAuditSeverity(event.action), createdAt: event.createdAt.toISOString() })),
      securityEvents: securityEvents.map((event) => ({ id: event.id, title: `${event.action} · ${event.entity}`, detail: event.user ? `${event.user.name} · ${event.user.email}` : "Action système", severity: event.result || classifyAuditSeverity(event.action), createdAt: event.createdAt.toISOString() })),
      freshness,
    },
  };
}
