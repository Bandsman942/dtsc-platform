import { AppShell } from "@/components/layout/app-shell";
import { AnnouncementWall } from "@/components/announcements/announcement-wall";
import { requireUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const [settings, announcements] = await Promise.all([
    getAppSettings(),
    prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, role: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, role: true } } },
        },
        reactions: { select: { value: true } },
      },
      take: 200,
    }),
  ]);

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
        />
      </div>
    </AppShell>
  );
}
