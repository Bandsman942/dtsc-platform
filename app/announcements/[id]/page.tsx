import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { AnnouncementDeepLinkActivator } from "@/components/announcements/announcement-deep-link-activator";
import { AnnouncementMediaEnhancer } from "@/components/announcements/announcement-media-enhancer";
import { AnnouncementWall } from "@/components/announcements/announcement-wall";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { announcementVisibilityWhere } from "@/lib/announcement-access";
import { getSession, requireUser } from "@/lib/auth";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ commentId?: string; comment?: string }>;
};

const commentInclude = {
  user: { select: { id: true, name: true, role: true, avatarUrl: true } },
  reactions: { select: { id: true, userId: true, reactionType: true } },
  mentions: { select: { mentionedUserId: true } },
} satisfies Prisma.AnnouncementCommentInclude;

export default async function AnnouncementDetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const session = await getSession();
  if (!session) notFound();

  const { id } = await params;
  const query = await searchParams;
  const commentId = query.commentId || query.comment;
  const activeOrganizationId = getActiveOrganizationId(session);
  const visibilityWhere: Prisma.AnnouncementWhereInput = {
    id,
    ...announcementVisibilityWhere(session),
  };
  const transferRecipientWhere: Prisma.UserWhereInput = activeOrganizationId
    ? {
        status: "ACTIVE",
        organizationMemberships: { some: { organizationId: activeOrganizationId, status: "ACTIVE", removedAt: null } },
      }
    : { status: "ACTIVE", id: user.id };

  const [settings, announcement, users] = await Promise.all([
    getAppSettings(),
    prisma.announcement.findFirst({
      where: visibilityWhere,
      include: {
        author: { select: { id: true, name: true, role: true, avatarUrl: true, jobTitle: true } },
        comments: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: commentInclude,
        },
        _count: { select: { comments: true } },
        reactions: { select: { value: true } },
        shares: { select: { id: true } },
        reports: { select: { id: true, status: true } },
      },
    }),
    prisma.user.findMany({
      where: transferRecipientWhere,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        jobTitle: true,
        hrcfoEmployee: { select: { department: true, jobTitle: true, positionTitle: true, position: { select: { title: true } } } },
      },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  if (!announcement) notFound();
  announcement.comments.reverse();

  if (commentId && !announcement.comments.some((comment) => comment.id === commentId)) {
    const targetedComment = await prisma.announcementComment.findFirst({
      where: { id: commentId, announcementId: announcement.id },
      include: commentInclude,
    });
    if (targetedComment) announcement.comments.push(targetedComment);
  }

  await prisma.announcement.update({
    where: { id: announcement.id },
    data: { viewCount: { increment: 1 }, lastAction: "Annonce consultée depuis une notification" },
  });

  const internalModerator = session.activeContext === "DTSC_INTERNAL" && ["ADMIN", "SUPPORT"].includes(user.role);
  const organizationModerator = ["OWNER", "ADMIN"].includes(session.activeOrganizationRole || "");
  const contextualModerator = announcement.organizationId
    ? Boolean(activeOrganizationId === announcement.organizationId && organizationModerator)
    : internalModerator;
  const author = announcement.authorId === user.id;
  const announcementWithCapabilities = {
    ...announcement,
    capabilities: {
      edit: contextualModerator || (author && Date.now() <= announcement.createdAt.getTime() + settings.announcementEditWindowMinutes * 60 * 1000),
      moderate: contextualModerator || author,
    },
  };

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Annonce notifiée"
          title={announcement.title}
          count={`${announcement._count.comments} commentaire${announcement._count.comments > 1 ? "s" : ""}`}
          description="Vous consultez directement l’annonce ou le commentaire à l’origine de la notification."
        />
        <ModuleContent>
          <ModuleSection title="Publication" description="Les images peuvent être ouvertes en plein écran et les commentaires restent repliables.">
            <div data-announcement-media-root className="min-w-0">
              <AnnouncementMediaEnhancer />
              <AnnouncementDeepLinkActivator commentId={commentId} />
              <AnnouncementWall
                announcements={JSON.parse(JSON.stringify([announcementWithCapabilities]))}
                currentUserId={user.id}
                role={user.role}
                locale={user.locale}
                allowClientAnnouncements={settings.allowClientAnnouncements}
                commentEditWindowMinutes={settings.commentEditWindowMinutes}
                transferRecipients={users.map((item) => ({
                  id: item.id,
                  name: item.name,
                  email: item.email,
                  role: item.role,
                  avatarUrl: item.avatarUrl,
                  jobTitle: item.hrcfoEmployee?.jobTitle || item.jobTitle,
                  departmentName: item.hrcfoEmployee?.department,
                  positionTitle: item.hrcfoEmployee?.position?.title || item.hrcfoEmployee?.positionTitle,
                }))}
              />
            </div>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
