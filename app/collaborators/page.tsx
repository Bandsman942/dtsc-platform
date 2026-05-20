import { AppShell } from "@/components/layout/app-shell";
import { CollaboratorsWorkspace } from "@/components/collaborators/collaborators-workspace";
import { requireUser } from "@/lib/auth";
import { touchUserPresence } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

export default async function CollaboratorsPage() {
  const user = await requireUser();
  await touchUserPresence(user.id);
  const [groups, invitations, users, conversations] = await Promise.all([
    prisma.collaborationGroup.findMany({
      where: { status: "ACTIVE", members: { some: { userId: user.id, status: "ACTIVE" } } },
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
        _count: { select: { messages: true, members: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.collaborationGroupInvitation.findMany({
      where: { status: "PENDING", OR: [{ invitedUserId: user.id }, { invitedEmail: user.email.toLowerCase() }] },
      include: { group: { select: { id: true, name: true, description: true } }, invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, role: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    prisma.conversation.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
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
  const unreadMentionByGroup = new Map<string, { count: number; preview: string; createdAt: Date }>();
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
          userPreferences={{ locale: user.locale, timezone: user.timezone, dateFormat: user.dateFormat }}
          initialGroups={JSON.parse(JSON.stringify(groupsWithMentionState))}
          initialInvitations={JSON.parse(JSON.stringify(invitations))}
          users={JSON.parse(JSON.stringify(users))}
          conversations={JSON.parse(JSON.stringify(conversations))}
        />
      </div>
    </AppShell>
  );
}
