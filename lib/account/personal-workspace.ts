import { TicketStatus } from "@prisma/client";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { getPendingEnterpriseInvitationsForUser } from "@/lib/enterprise-invitations";
import { listUserIdentityLinks } from "@/lib/enterprise/identity-links/service";
import { getVisibleNotificationWhereForSession } from "@/lib/notification-access";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export type PersonalWorkspaceContext = "PERSONAL" | "DTSC_INTERNAL" | "ORGANIZATION";
export type WorkspaceActionPriority = "URGENT" | "IMPORTANT" | "NORMAL";

export type WorkspaceAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: "INVITATION" | "RELATION" | "NOTIFICATION" | "SUPPORT" | "SUBSCRIPTION" | "SECURITY";
  priority: WorkspaceActionPriority;
  contextLabel: string;
};

export type WorkspaceActivity = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: "NOTIFICATION" | "INVITATION" | "RELATION" | "CONVERSATION" | "SUPPORT";
  occurredAt: string;
};

export type PersonalWorkspaceSummary = {
  context: {
    type: PersonalWorkspaceContext;
    label: string;
    organizationId: string | null;
    organizationName: string | null;
    organizationRole: string | null;
  };
  account: {
    membershipCount: number;
    pendingInvitationCount: number;
    pendingRelationshipCount: number;
    unreadNotificationCount: number;
    openSupportTicketCount: number;
  };
  subscription: {
    source: "PERSONAL" | "ORGANIZATION";
    planLabel: string;
    status: string;
    active: boolean;
    periodStart: string | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    messageLimit: number | null;
    tokenLimit: number | null;
    documentLimit: number | null;
    usedMessagesToday: number;
    usedTokensToday: number;
    usedDocuments: number;
  };
  organizations: Array<{
    id: string;
    name: string;
    type: string;
    role: string;
    active: boolean;
  }>;
  actions: WorkspaceAction[];
  recentActivity: WorkspaceActivity[];
};

type WorkspaceUser = {
  id: string;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
};

function resolveContext(session: SessionPayload): PersonalWorkspaceSummary["context"] {
  if (session.activeContext === "DTSC_INTERNAL") {
    return {
      type: "DTSC_INTERNAL",
      label: "Environnement DTSC interne",
      organizationId: session.activeOrganizationId || null,
      organizationName: session.activeOrganizationName || "DTSC",
      organizationRole: session.activeOrganizationRole || null,
    };
  }
  if (session.activeContext === "ORGANIZATION" && session.activeOrganizationId) {
    return {
      type: "ORGANIZATION",
      label: `Espace entreprise · ${session.activeOrganizationName || "Organisation"}`,
      organizationId: session.activeOrganizationId,
      organizationName: session.activeOrganizationName || "Organisation",
      organizationRole: session.activeOrganizationRole || null,
    };
  }
  return {
    type: "PERSONAL",
    label: "Compte personnel",
    organizationId: null,
    organizationName: null,
    organizationRole: null,
  };
}

function priorityForNotification(type: string, title: string, body: string): WorkspaceActionPriority {
  const searchable = `${type} ${title} ${body}`.toUpperCase();
  if (/CRITICAL|URGENT|SECURITY|PAST_DUE|SUSPEND/.test(searchable)) return "URGENT";
  if (/INVITATION|CONSENT|RELATION|ACTION|PAYMENT|SUPPORT/.test(searchable)) return "IMPORTANT";
  return "NORMAL";
}

export async function getPersonalWorkspaceSummary({
  user,
  session,
}: {
  user: WorkspaceUser;
  session: SessionPayload;
}): Promise<PersonalWorkspaceSummary> {
  const context = resolveContext(session);
  const activeOrganizationId = getActiveOrganizationId(session);
  const notificationWhere = await getVisibleNotificationWhereForSession(session);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    memberships,
    pendingInvitations,
    identityLinks,
    unreadNotificationCount,
    recentNotifications,
    openSupportTicketCount,
    recentTickets,
    recentConversations,
    personalSubscription,
    usageToday,
    usedDocuments,
    organizationEntitlements,
  ] = await Promise.all([
    prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
        removedAt: null,
        organization: { status: "ACTIVE", deletedAt: null },
      },
      select: {
        role: true,
        organization: { select: { id: true, name: true, organizationType: true } },
      },
      orderBy: { organization: { name: "asc" } },
      take: 20,
    }),
    getPendingEnterpriseInvitationsForUser(user.id),
    listUserIdentityLinks(user.id),
    prisma.notification.count({ where: { ...notificationWhere, readAt: null } }),
    prisma.notification.findMany({
      where: notificationWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, body: true, type: true, targetUrl: true, readAt: true, createdAt: true },
    }),
    prisma.supportTicket.count({
      where: { userId: user.id, status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } },
    }),
    prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, subject: true, status: true, updatedAt: true },
    }),
    prisma.conversation.findMany({
      where: { userId: user.id, organizationId: activeOrganizationId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
    }),
    prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    prisma.usageLog.aggregate({
      where: { userId: user.id, organizationId: activeOrganizationId, createdAt: { gte: today } },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
    prisma.knowledgeDocument.count({ where: { userId: user.id, organizationId: activeOrganizationId } }),
    getOrganizationEntitlements(activeOrganizationId),
  ]);

  const actionableRelationshipStatuses = new Set(["INVITED", "PENDING_CONSENT", "PENDING_USER", "PENDING_USER_APPROVAL", "PENDING"]);
  const pendingRelationships = identityLinks.filter((identityLink) => actionableRelationshipStatuses.has(identityLink.status));
  const activeRelationshipCount = identityLinks.filter((identityLink) => identityLink.status === "ACTIVE").length;

  const actions: WorkspaceAction[] = [];
  for (const invitation of pendingInvitations.slice(0, 5)) {
    actions.push({
      id: `invitation:${invitation.id}`,
      title: `Invitation de ${invitation.organization.name}`,
      description: `Examiner le rôle ${invitation.role} proposé avant de rejoindre cet espace.`,
      href: `/enterprise-invitations?organizationId=${encodeURIComponent(invitation.organizationId)}`,
      category: "INVITATION",
      priority: "IMPORTANT",
      contextLabel: "Compte personnel",
    });
  }
  for (const identityLink of pendingRelationships.slice(0, 5)) {
    actions.push({
      id: `relationship:${identityLink.id}`,
      title: `Relation avec ${identityLink.organization.name}`,
      description: "Une demande, une invitation ou un consentement attend votre intervention.",
      href: `/enterprise-links?link=${encodeURIComponent(identityLink.id)}`,
      category: "RELATION",
      priority: "IMPORTANT",
      contextLabel: "Compte global",
    });
  }
  for (const notification of recentNotifications.filter((item) => !item.readAt).slice(0, 5)) {
    const priority = priorityForNotification(notification.type, notification.title, notification.body);
    if (priority === "NORMAL") continue;
    actions.push({
      id: `notification:${notification.id}`,
      title: notification.title,
      description: notification.body,
      href: notification.targetUrl || `/notifications?notificationId=${encodeURIComponent(notification.id)}`,
      category: "NOTIFICATION",
      priority,
      contextLabel: notification.organizationId ? "Organisation" : "Compte global",
    });
  }
  if (openSupportTicketCount > 0) {
    actions.push({
      id: "support:open",
      title: `${openSupportTicketCount} ticket${openSupportTicketCount > 1 ? "s" : ""} support en cours`,
      description: "Consultez les réponses et complétez les informations demandées lorsque nécessaire.",
      href: "/support",
      category: "SUPPORT",
      priority: "NORMAL",
      contextLabel: "Support DTSC",
    });
  }
  if (personalSubscription?.status === "PAST_DUE" || personalSubscription?.status === "PENDING_PAYMENT") {
    actions.push({
      id: "subscription:payment",
      title: "Abonnement à régulariser",
      description: "Le statut de votre abonnement nécessite une intervention avant la poursuite de certains usages.",
      href: "/billing",
      category: "SUBSCRIPTION",
      priority: personalSubscription.status === "PAST_DUE" ? "URGENT" : "IMPORTANT",
      contextLabel: "Compte personnel",
    });
  }

  const recentActivity: WorkspaceActivity[] = [
    ...recentNotifications.map((notification) => ({
      id: `notification:${notification.id}`,
      title: notification.title,
      description: notification.body,
      href: notification.targetUrl || "/notifications",
      category: "NOTIFICATION" as const,
      occurredAt: notification.createdAt.toISOString(),
    })),
    ...pendingInvitations.map((invitation) => ({
      id: `invitation:${invitation.id}`,
      title: `Invitation · ${invitation.organization.name}`,
      description: `Rôle proposé : ${invitation.role}`,
      href: `/enterprise-invitations?organizationId=${encodeURIComponent(invitation.organizationId)}`,
      category: "INVITATION" as const,
      occurredAt: invitation.createdAt.toISOString(),
    })),
    ...identityLinks.slice(0, 6).map((identityLink) => ({
      id: `relationship:${identityLink.id}`,
      title: `Relation · ${identityLink.organization.name}`,
      description: `Statut ${identityLink.status}`,
      href: `/enterprise-links?link=${encodeURIComponent(identityLink.id)}`,
      category: "RELATION" as const,
      occurredAt: identityLink.createdAt.toISOString(),
    })),
    ...recentConversations.map((conversation) => ({
      id: `conversation:${conversation.id}`,
      title: conversation.title,
      description: `${conversation._count.messages} message${conversation._count.messages > 1 ? "s" : ""}`,
      href: `/chat?conversationId=${encodeURIComponent(conversation.id)}`,
      category: "CONVERSATION" as const,
      occurredAt: conversation.updatedAt.toISOString(),
    })),
    ...recentTickets.map((ticket) => ({
      id: `support:${ticket.id}`,
      title: ticket.subject,
      description: `Ticket support · ${ticket.status}`,
      href: `/support?ticketId=${encodeURIComponent(ticket.id)}`,
      category: "SUPPORT" as const,
      occurredAt: ticket.updatedAt.toISOString(),
    })),
  ]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 12);

  const organizationSubscription = organizationEntitlements && !organizationEntitlements.isDtscInternal
    ? organizationEntitlements
    : null;
  const plan = personalSubscription?.plan || null;
  const subscription = organizationSubscription
    ? {
        source: "ORGANIZATION" as const,
        planLabel: organizationSubscription.planLabel,
        status: organizationSubscription.subscriptionStatus,
        active: organizationSubscription.subscriptionActive,
        periodStart: organizationSubscription.startedAt,
        periodEnd: organizationSubscription.expiresAt || organizationSubscription.trialEndsAt,
        cancelAtPeriodEnd: false,
        messageLimit: null,
        tokenLimit: null,
        documentLimit: organizationSubscription.limits.maxDocuments,
        usedMessagesToday: usageToday._count._all,
        usedTokensToday: usageToday._sum.totalTokens || 0,
        usedDocuments,
      }
    : {
        source: "PERSONAL" as const,
        planLabel: plan?.name || "Gratuit",
        status: personalSubscription?.status || "FREE",
        active: personalSubscription?.status === "ACTIVE" || !personalSubscription,
        periodStart: personalSubscription?.currentPeriodStart?.toISOString() || null,
        periodEnd: personalSubscription?.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: personalSubscription?.cancelAtPeriodEnd || false,
        messageLimit: plan?.dailyMessageLimit ?? user.dailyMessageLimit,
        tokenLimit: plan?.dailyTokenLimit ?? user.dailyTokenLimit,
        documentLimit: plan?.maxDocuments ?? 0,
        usedMessagesToday: usageToday._count._all,
        usedTokensToday: usageToday._sum.totalTokens || 0,
        usedDocuments,
      };

  return {
    context,
    account: {
      membershipCount: memberships.length,
      pendingInvitationCount: pendingInvitations.length,
      pendingRelationshipCount: pendingRelationships.length,
      unreadNotificationCount,
      openSupportTicketCount,
    },
    subscription,
    organizations: memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      type: membership.organization.organizationType,
      role: membership.role,
      active: membership.organization.id === activeOrganizationId,
    })),
    actions: actions
      .sort((left, right) => {
        const weight: Record<WorkspaceActionPriority, number> = { URGENT: 0, IMPORTANT: 1, NORMAL: 2 };
        return weight[left.priority] - weight[right.priority];
      })
      .slice(0, 12),
    recentActivity,
  };
}
