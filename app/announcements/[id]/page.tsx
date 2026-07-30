import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { AnnouncementDeepLinkActivator } from "@/components/announcements/announcement-deep-link-activator";
import { AnnouncementMediaEnhancer } from "@/components/announcements/announcement-media-enhancer";
import { AnnouncementWall } from "@/components/announcements/announcement-wall";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getActiveOrganizationId, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ commentId?: string }>;
};

export default async function AnnouncementDetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const session = await getSession();
  const { id } = await params;
  const { commentId } = await searchParams;
  const activeOrganizationId = getActiveOrganizationId(session);
  const dtscInternalContext = isDtscInternalSession(session);
  const globalAnnouncementScopes = ["GLOBAL_PUBLIC", "GLOBAL_PRIVATE", "COMMUNITY", "DTSC_OFFICIAL"];
  const visibilityWhere: Prisma.AnnouncementWhereInput = dtscInternalContext
    ? { id, deletedAt: null }
    : activeOrganizationId
      ? {
          id,
          deletedAt: null,
          moderationStatus: "PUBLISHED",
          OR: [{ scope: { in: globalAnnouncementScopes } }, { scope: "ORGANIZATION_ONLY", organizationId: activeOrganizationId }],
        }
      : { id, deletedAt: null, moderationStatus: "PUBLISHED", scope: { in: globalAnnouncementScopes } };
  const transferRecipientWhere: Prisma.UserWhereInput = activeOrganizationId
    ? {
        status: "ACTIVE" as const,
        organizationMemberships: { some: { organizationId: activeOrganizationId, status: "ACTIVE", removedAt: null } },
      }
    : { status: "ACTIVE" as const, id: user.id };

  const [settings, announcement, users] = await Promise.all([
    getAppSettings(),
    prisma.announcement.findFirst({
      where: visibilityWhere,
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
  await prisma.announcement.update({ where: { id: announcement.id }, data: { viewCount: { increment: 1 }, lastAction: "Annonce consultée depuis une notification" } });

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Annonce notifiée"
          title={announcement.title}
          count={`${announcement.comments.length} commentaire${announcement.comments.length > 1 ? "s" : ""}`}
          description="Vous consultez directement l’annonce ou le commentaire à l’origine de la notification."
        />
        <ModuleContent>
          <ModuleSection title="Publication" description="Les images peuvent être ouvertes en plein écran et les commentaires restent repliables.">
            <div data-announcement-media-root className="min-w-0">
              <AnnouncementMediaEnhancer />
              <AnnouncementDeepLinkActivator commentId={commentId} />
              <AnnouncementWall
                announcements={JSON.parse(JSON.stringify([announcement]))}
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
