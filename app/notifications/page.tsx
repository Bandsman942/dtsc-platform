import { AppShell } from "@/components/layout/app-shell";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export default async function NotificationsPage() {
  const user = await requireUser();
  const settings = await getAppSettings();
  const retentionStart = new Date();
  retentionStart.setDate(retentionStart.getDate() - settings.notificationRetentionDays);
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, createdAt: { gte: retentionStart } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Centre d&apos;activité</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Notifications</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Retrouvez les tickets, annonces, réponses support, alertes de limites, messages administratifs et événements importants de la plateforme.
          </p>
          <div className="mt-5 rounded-2xl bg-dtsc-soft p-4 text-sm font-bold text-dtsc-blue">
            {unreadCount} notification(s) non lue(s)
          </div>
        </section>
        <NotificationList notifications={JSON.parse(JSON.stringify(notifications))} />
      </div>
    </AppShell>
  );
}
