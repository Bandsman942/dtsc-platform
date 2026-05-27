import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { AnnouncementWall } from "@/components/announcements/announcement-wall";
import { getSession, requireUser } from "@/lib/auth";
import { translate } from "@/lib/i18n";
import { getActiveOrganizationId, isDtscInternalSession } from "@/lib/organizations";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

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

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">{t("announcements.feedEyebrow")}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">{t("announcements.pageTitle")}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            {t("announcements.pageDescription")}
          </p>
        </section>
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
    </AppShell>
  );
}
