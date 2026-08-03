import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AnnouncementMediaEnhancer } from "@/components/announcements/announcement-media-enhancer";
import { AnnouncementWall } from "@/components/announcements/announcement-wall";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { translate } from "@/lib/i18n";
import { announcementVisibilityWhere } from "@/lib/announcement-access";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export default async function AnnouncementsPage({ searchParams }: { searchParams?: Promise<{ comment?: string }> }) {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const params = await searchParams;
  const announcementWhere: Prisma.AnnouncementWhereInput = session ? announcementVisibilityWhere(session) : { deletedAt: null, moderationStatus: "PUBLISHED" };
  const transferRecipientWhere: Prisma.UserWhereInput = activeOrganizationId
    ? {
        status: "ACTIVE" as const,
        organizationMemberships: {
          some: { organizationId: activeOrganizationId, status: "ACTIVE", removedAt: null },
        },
      }
    : { status: "ACTIVE" as const, id: user.id };
  const t = (key: string) => translate(user.locale, key);
  const [settings, announcements, users] = await Promise.all([
    getAppSettings(),
    prisma.announcement.findMany({
      where: announcementWhere,
      orderBy: [{ pinnedAt: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { id: true, name: true, role: true, avatarUrl: true, jobTitle: true } },
        comments: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            user: { select: { id: true, name: true, role: true, avatarUrl: true } },
            reactions: { select: { id: true, userId: true, reactionType: true } },
            mentions: { select: { mentionedUserId: true } },
          },
        },
        _count: { select: { comments: true } },
        reactions: { select: { value: true } },
        shares: { select: { id: true } },
        reports: { select: { id: true, status: true } },
      },
      take: 50,
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
  for (const announcement of announcements) announcement.comments.reverse();
  if (params?.comment && !announcements.some((announcement) => announcement.comments.some((comment) => comment.id === params.comment))) {
    const targetedComment = await prisma.announcementComment.findFirst({
      where: { id: params.comment, announcement: announcementWhere },
      include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } }, reactions: { select: { id: true, userId: true, reactionType: true } }, mentions: { select: { mentionedUserId: true } } },
    });
    const targetAnnouncement = announcements.find((announcement) => announcement.id === targetedComment?.announcementId);
    if (targetedComment && targetAnnouncement) targetAnnouncement.comments.push(targetedComment);
  }
  if (announcements.length) {
    await prisma.announcement.updateMany({
      where: { id: { in: announcements.map((announcement) => announcement.id) } },
      data: { viewCount: { increment: 1 }, lastAction: "Annonce consultée" },
    });
  }

  const internalModerator = session?.activeContext === "DTSC_INTERNAL" && ["ADMIN", "SUPPORT"].includes(user.role);
  const organizationModerator = ["OWNER", "ADMIN"].includes(session?.activeOrganizationRole || "");
  const announcementsWithCapabilities = announcements.map((announcement) => {
    const contextualModerator = announcement.organizationId
      ? Boolean(activeOrganizationId === announcement.organizationId && organizationModerator)
      : internalModerator;
    const author = announcement.authorId === user.id;
    return {
      ...announcement,
      capabilities: {
        edit: contextualModerator || (author && Date.now() <= announcement.createdAt.getTime() + settings.announcementEditWindowMinutes * 60 * 1000),
        moderate: contextualModerator || author,
      },
    };
  });

  const commentCount = announcements.reduce((total, announcement) => total + announcement._count.comments, 0);
  const reactionCount = announcements.reduce((total, announcement) => total + announcement.reactions.length, 0);
  const pinnedCount = announcements.filter((announcement) => announcement.pinnedAt).length;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={t("announcements.feedEyebrow")}
          title={t("announcements.pageTitle")}
          count={`${announcements.length}`}
          description={t("announcements.pageDescription")}
          secondaryActions={
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=announcements"><BookOpen className="h-4 w-4" />Guide utilisateur</Link>
            </Button>
          }
        />
        <ModuleMetrics label="Indicateurs des annonces">
          <ModuleMetric label="Annonces visibles" value={announcements.length} hint="Dans votre périmètre" />
          <ModuleMetric label="Commentaires" value={commentCount} hint="Interactions du fil" />
          <ModuleMetric label="Réactions" value={reactionCount} hint="Avis enregistrés" />
          <ModuleMetric label="Épinglées" value={pinnedCount} hint="Prioritaires" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Fil d’actualité" description="Les commentaires restent repliables et chaque image publiée peut être ouverte en plein écran sans recadrage.">
            <div data-announcement-media-root className="min-w-0">
              <AnnouncementMediaEnhancer />
              <AnnouncementWall
                announcements={JSON.parse(JSON.stringify(announcementsWithCapabilities))}
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
