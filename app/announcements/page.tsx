import type { Prisma } from "@prisma/client";
import { AnnouncementMediaEnhancer } from "@/components/announcements/announcement-media-enhancer";
import { AnnouncementWall } from "@/components/announcements/announcement-wall";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { translate } from "@/lib/i18n";
import { getActiveOrganizationId, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const dtscInternalContext = isDtscInternalSession(session);
  const globalAnnouncementScopes = ["GLOBAL_PUBLIC", "GLOBAL_PRIVATE", "COMMUNITY", "DTSC_OFFICIAL"];
  const announcementWhere: Prisma.AnnouncementWhereInput = dtscInternalContext
    ? { deletedAt: null }
    : activeOrganizationId
      ? {
          deletedAt: null,
          moderationStatus: "PUBLISHED",
          OR: [{ scope: { in: globalAnnouncementScopes } }, { scope: "ORGANIZATION_ONLY", organizationId: activeOrganizationId }],
        }
      : { deletedAt: null, moderationStatus: "PUBLISHED", scope: { in: globalAnnouncementScopes } };
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
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
        },
        reactions: { select: { value: true } },
        shares: { select: { id: true } },
        reports: { select: { id: true, status: true } },
      },
      take: 200,
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
  if (announcements.length) {
    await prisma.announcement.updateMany({
      where: { id: { in: announcements.map((announcement) => announcement.id) } },
      data: { viewCount: { increment: 1 }, lastAction: "Annonce consultée" },
    });
  }

  const commentCount = announcements.reduce((total, announcement) => total + announcement.comments.length, 0);
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
                announcements={JSON.parse(JSON.stringify(announcements))}
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
