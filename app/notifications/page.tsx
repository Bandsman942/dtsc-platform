import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { NotificationList } from "@/components/notifications/notification-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getVisibleNotificationWhereForSession } from "@/lib/notification-access";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

const pageSize = 30;

function positivePage(value: string | undefined) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requireUser();
  const session = await getSession();
  const params = await searchParams;
  const requestedPage = positivePage(params?.page);
  const query = params?.q?.trim().slice(0, 120) || "";
  const notificationWhere = session
    ? await getVisibleNotificationWhereForSession(session)
    : { userId: user.id, organizationId: null };
  const settings = await getAppSettings();
  const retentionStart = new Date();
  retentionStart.setDate(retentionStart.getDate() - settings.notificationRetentionDays);
  const searchWhere: Prisma.NotificationWhereInput = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { body: { contains: query, mode: "insensitive" } },
          { type: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};
  const where: Prisma.NotificationWhereInput = {
    AND: [notificationWhere, { createdAt: { gte: retentionStart } }, searchWhere],
  };

  const [totalCount, unreadCount, readCount] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { AND: [where, { readAt: null }] } }),
    prisma.notification.count({ where: { AND: [where, { readAt: { not: null } }] } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const notifications = await prisma.notification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const previousHref = `/notifications?page=${Math.max(1, page - 1)}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const nextHref = `/notifications?page=${Math.min(pageCount, page + 1)}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Centre d’activité"
          title="Notifications"
          count={`${totalCount}`}
          description="Retrouvez les événements autorisés de votre compte, y compris les invitations et relations visibles avant l’adhésion à une entreprise. Chaque notification actionnable doit viser l’objet précis."
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=notifications">Guide des notifications</Link>
            </Button>
          )}
        />
        <ModuleMetrics label="Synthèse des notifications">
          <ModuleMetric label="Résultats" value={totalCount} hint={query ? `Recherche « ${query} »` : "Période conservée"} />
          <ModuleMetric label="Non lues" value={unreadCount} hint="À consulter" />
          <ModuleMetric label="Lues" value={readCount} hint="Déjà consultées" />
          <ModuleMetric label="Rétention" value={`${settings.notificationRetentionDays} j`} hint="Historique disponible" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Recherche serveur" description="La recherche et la pagination sont appliquées avant le chargement afin de ne pas lire tout l’historique en mémoire.">
            <form action="/notifications" method="get" className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input name="q" defaultValue={query} placeholder="Rechercher par titre, catégorie ou contenu..." className="min-w-0 flex-1" />
              <Button type="submit" className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Rechercher</Button>
              {query ? <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/notifications">Réinitialiser</Link></Button> : null}
            </form>
          </ModuleSection>
          <ModuleSection title="Centre de notifications" description={`Page ${page} sur ${pageCount}. Les filtres rapides s’appliquent aux éléments déjà chargés sur cette page.`}>
            <NotificationList notifications={JSON.parse(JSON.stringify(notifications))} />
            <nav aria-label="Pagination des notifications" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4">
              <Button asChild={page > 1} disabled={page <= 1} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                {page > 1 ? <Link href={previousHref}>Page précédente</Link> : <span>Page précédente</span>}
              </Button>
              <p className="text-sm font-bold text-dtsc-muted">{totalCount ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} sur ${totalCount}` : "Aucun résultat"}</p>
              <Button asChild={page < pageCount} disabled={page >= pageCount} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                {page < pageCount ? <Link href={nextHref}>Page suivante</Link> : <span>Page suivante</span>}
              </Button>
            </nav>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
