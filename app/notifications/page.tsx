import { AppShell } from "@/components/layout/app-shell";
import { NotificationList } from "@/components/notifications/notification-list";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getVisibleNotificationWhereForSession } from "@/lib/notification-access";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export default async function NotificationsPage() {
  const user = await requireUser();
  const session = await getSession();
  const notificationWhere = session
    ? await getVisibleNotificationWhereForSession(session)
    : { userId: user.id, organizationId: null };
  const settings = await getAppSettings();
  const retentionStart = new Date();
  retentionStart.setDate(retentionStart.getDate() - settings.notificationRetentionDays);
  const notifications = await prisma.notification.findMany({
    where: { ...notificationWhere, createdAt: { gte: retentionStart } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const readCount = notifications.length - unreadCount;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Centre d’activité"
          title="Notifications"
          count={`${notifications.length}`}
          description="Retrouvez les tickets, annonces, réponses support, alertes de limites, messages administratifs et événements importants de la plateforme. Une notification liée à un objet ouvre désormais directement cet élément."
        />
        <ModuleMetrics label="Synthèse des notifications">
          <ModuleMetric label="Total" value={notifications.length} hint="Période conservée" />
          <ModuleMetric label="Non lues" value={unreadCount} hint="À consulter" />
          <ModuleMetric label="Lues" value={readCount} hint="Déjà consultées" />
          <ModuleMetric label="Rétention" value={`${settings.notificationRetentionDays} j`} hint="Historique disponible" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Centre de notifications" description="Filtrez, recherchez ou ouvrez directement l’élément précis à l’origine de la notification.">
            <NotificationList notifications={JSON.parse(JSON.stringify(notifications))} />
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
