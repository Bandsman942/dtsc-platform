import { AppShell } from "@/components/layout/app-shell";
import { AnnouncementWall } from "@/components/announcements/announcement-wall";
import { requireUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const [settings, announcements, users] = await Promise.all([
    getAppSettings(),
    prisma.announcement.findMany({
      where: { deletedAt: null },
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
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        jobTitle: true,
        hrcfoEmployee: { select: { departmentName: true, jobTitle: true, position: { select: { title: true } } } },
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
          <p className="text-sm font-bold text-cyan-600">Fil d&apos;actualités</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Annonces DTSC</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Consultez les annonces internes, réagissez et échangez en commentaires. Les rôles ADMIN, MANAGER et SUPPORT peuvent publier.
          </p>
        </section>
        <AnnouncementWall
          announcements={JSON.parse(JSON.stringify(announcements))}
          currentUserId={user.id}
          role={user.role}
          allowClientAnnouncements={settings.allowClientAnnouncements}
          commentEditWindowMinutes={settings.commentEditWindowMinutes}
          transferRecipients={users.map((item) => ({
            id: item.id,
            name: item.name,
            email: item.email,
            role: item.role,
            avatarUrl: item.avatarUrl,
            jobTitle: item.hrcfoEmployee?.jobTitle || item.jobTitle,
            departmentName: item.hrcfoEmployee?.departmentName,
            positionTitle: item.hrcfoEmployee?.position?.title,
          }))}
        />
      </div>
    </AppShell>
  );
}
