import { UserStatus } from "@prisma/client";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { AppShell } from "@/components/layout/app-shell";
import { CollaboratorsWorkspace } from "@/components/collaborators/collaborators-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { canUseFeature, getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { collaborationGroupScopeWhere, touchUserPresence } from "@/lib/collaboration";
import { DTSC_INTERNAL_ORGANIZATION_ID, getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export default async function CollaboratorsPage({ searchParams }: { searchParams?: Promise<{ groupId?: string; joinCall?: string }> }) {
  const user = await requireUser();
  const session = await getSession();
  const params = await searchParams;
  await touchUserPresence(user.id);
  const activeOrganizationId = getActiveOrganizationId(session);
  if (activeOrganizationId && activeOrganizationId !== DTSC_INTERNAL_ORGANIZATION_ID) {
    const featureAccess = await canUseFeature(activeOrganizationId, "collaborators");
    if (!featureAccess.allowed) {
      const entitlements = await getOrganizationEntitlements(activeOrganizationId);
      return (
        <AppShell user={user}>
          <SaasAccessNotice
            title="Collaboration indisponible"
            message={featureAccess.message}
            planLabel={entitlements?.planLabel}
            subscriptionStatus={entitlements?.subscriptionStatus}
          />
        </AppShell>
      );
    }
  }
  const scopedGroupFilter = collaborationGroupScopeWhere(session);
  const [groups, invitations, conversations] = await Promise.all([
    prisma.collaborationGroup.findMany({
      where: { status: "ACTIVE", members: { some: { userId: user.id, status: "ACTIVE" } }, ...scopedGroupFilter },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        members: {
          where: { status: "ACTIVE" },
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } } },
          orderBy: { joinedAt: "asc" },
        },
        invitations: {
          where: { status: "PENDING" },
          include: { invitedUser: { select: { id: true, name: true, email: true } }, invitedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { name: true } } },
        },
        calls: {
          orderBy: { startedAt: "desc" },
          take: 5,
          select: {
            id: true,
            groupId: true,
            meetingId: true,
            callType: true,
            status: true,
            startedById: true,
            startedAt: true,
            endedAt: true,
            durationSeconds: true,
            participants: true,
          },
        },
        _count: { select: { messages: true, members: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.collaborationGroupInvitation.findMany({
      where: {
        status: "PENDING",
        OR: [{ invitedUserId: user.id }, { invitedEmail: user.email.toLowerCase() }],
        group: { is: scopedGroupFilter },
      },
      include: { group: { select: { id: true, name: true, description: true } }, invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.conversation.findMany({
      where: { userId: user.id, organizationId: activeOrganizationId },
      select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const users = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE },
    select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, role: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  const groupIds = groups.map((group) => group.id);
  const unreadMentions = groupIds.length
    ? await prisma.collaborationMessageMention.findMany({
        where: {
          mentionedUserId: user.id,
          isRead: false,
          message: { groupId: { in: groupIds }, deletedAt: null },
        },
        select: { message: { select: { groupId: true, content: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const unreadMessages = groupIds.length
    ? await prisma.collaborationGroupMessage.groupBy({
        by: ["groupId"],
        where: {
          groupId: { in: groupIds },
          authorId: { not: user.id },
          deletedAt: null,
          messageType: { not: "SYSTEM" },
          reads: { none: { userId: user.id } },
        },
        _count: { _all: true },
      })
    : [];
  const unreadMentionByGroup = new Map<string, { count: number; preview: string; createdAt: Date }>();
  const unreadMessageByGroup = new Map(unreadMessages.map((item) => [item.groupId, item._count._all]));
  for (const mention of unreadMentions) {
    const current = unreadMentionByGroup.get(mention.message.groupId);
    unreadMentionByGroup.set(mention.message.groupId, {
      count: (current?.count || 0) + 1,
      preview: current?.preview || mention.message.content,
      createdAt: current?.createdAt || mention.message.createdAt,
    });
  }
  const groupsWithMentionState = groups.map((group) => {
    const mention = unreadMentionByGroup.get(group.id);
    return {
      ...group,
      unreadMessageCount: unreadMessageByGroup.get(group.id) || 0,
      unreadMentionCount: mention?.count || 0,
      unreadMentionPreview: mention?.preview || null,
      lastMentionAt: mention?.createdAt || null,
    };
  });

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Collaboration privée</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Mes collaborateurs</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Créez des groupes, invitez des membres, échangez en messagerie privée et partagez des conversations chatbot avec les personnes autorisées.
          </p>
        </section>
        <CollaboratorsWorkspace
          currentUserId={user.id}
          initialActiveGroupId={params?.groupId || null}
          initialJoinCallId={params?.joinCall || null}
          userPreferences={{ locale: user.locale, timezone: user.timezone, dateFormat: user.dateFormat }}
          initialGroups={JSON.parse(JSON.stringify(groupsWithMentionState))}
          initialInvitations={JSON.parse(JSON.stringify(invitations))}
          users={JSON.parse(JSON.stringify(users))}
          conversations={JSON.parse(JSON.stringify(conversations))}
          callPreferences={{
            callSoundsEnabled: user.callSoundsEnabled,
            callNotificationsEnabled: user.callNotificationsEnabled,
            floatingCallAlertsEnabled: user.floatingCallAlertsEnabled,
            participantEventAlertsEnabled: user.participantEventAlertsEnabled,
            callAlertSoundEnabled: user.callAlertSoundEnabled,
            incomingCallBannerEnabled: user.incomingCallBannerEnabled,
            connectionIssueSoundsEnabled: user.connectionIssueSoundsEnabled,
            startMutedByDefault: user.startMutedByDefault,
            startCameraOffByDefault: user.startCameraOffByDefault,
            callSoundVolume: user.callSoundVolume,
            callAlertDisplayDuration: user.callAlertDisplayDuration,
          }}
        />
      </div>
    </AppShell>
  );
}
