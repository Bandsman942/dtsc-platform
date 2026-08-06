import Link from "next/link";
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { SupportForm } from "@/components/support/support-form";
import { SupportGuestEntry } from "@/components/support/support-guest-entry";
import { SupportPagination } from "@/components/support/support-pagination";
import { SupportProductShell } from "@/components/support/support-product-shell";
import { TicketBoard } from "@/components/support/ticket-board";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getCurrentUser, getSession } from "@/lib/auth";
import { getPublicUrl } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { canManageSupportTickets, supportTicketVisibilityWhere } from "@/lib/support-access";
import { getIteration07UserGuide } from "@/lib/user-guides/iteration07-guides";

type PageProps = { searchParams: Promise<{ ticketId?: string; page?: string; status?: string; priority?: string; q?: string }> };
const PAGE_SIZE = 24;
const statuses = new Set<TicketStatus>(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
const priorities = new Set<TicketPriority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);

function positivePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function SupportPage({ searchParams }: PageProps) {
  const [user, session, params] = await Promise.all([getCurrentUser(), getSession(), searchParams]);
  const locale = user?.locale === "en" ? "en" : "fr";
  const isDtscInternal = isDtscInternalSession(session);
  if (!user || !session) return <SupportProductShell locale={locale}><SupportGuestEntry /></SupportProductShell>;

  const canManageTickets = canManageSupportTickets(session);
  const baseWhere = supportTicketVisibilityWhere(session);
  const page = positivePage(params.page);
  const status = statuses.has(params.status as TicketStatus) ? params.status as TicketStatus : undefined;
  const priority = priorities.has(params.priority as TicketPriority) ? params.priority as TicketPriority : undefined;
  const q = (params.q || "").trim().slice(0, 120);
  const conditions: Prisma.SupportTicketWhereInput[] = [baseWhere];
  if (status) conditions.push({ status });
  if (priority) conditions.push({ priority });
  if (q) conditions.push({ OR: [{ subject: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  const where: Prisma.SupportTicketWhereInput = { AND: conditions };

  const [ticketCount, tickets, assignees, openCount, inProgressCount, completedCount] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { name: true, email: true, role: true } },
        messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21, include: { user: { select: { id: true, name: true, role: true } }, replyTo: { select: { id: true, content: true, deletedAt: true, user: { select: { name: true } } } } } },
      },
    }),
    canManageTickets ? prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPPORT", "MANAGER"] }, status: "ACTIVE", organizationMemberships: { some: { organization: { organizationType: "DTSC_INTERNAL", deletedAt: null }, status: "ACTIVE", removedAt: null } } }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" }, take: 100 }) : Promise.resolve([]),
    prisma.supportTicket.count({ where: { AND: [baseWhere, { status: "OPEN" }] } }),
    prisma.supportTicket.count({ where: { AND: [baseWhere, { status: "IN_PROGRESS" }] } }),
    prisma.supportTicket.count({ where: { AND: [baseWhere, { status: { in: ["RESOLVED", "CLOSED"] } }] } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(ticketCount / PAGE_SIZE));
  const guide = getIteration07UserGuide("CONSOLE_SUPPORT", locale);

  return (
    <SupportProductShell authenticated isDtscInternal={isDtscInternal} locale={locale}>
      <ModuleWorkspace>
        <ModuleHeader eyebrow={locale === "en" ? "Assistance" : "Assistance"} title="Support DTSC" count={`${ticketCount} ticket${ticketCount > 1 ? "s" : ""}`} description="Créez, filtrez et suivez vos demandes dans un produit Support distinct. Les données restent limitées à votre périmètre autorisé." secondaryActions={<ContextualUserGuide guide={guide} />} />
        <ModuleMetrics label="Indicateurs du support"><ModuleMetric label="Résultats" value={ticketCount} hint="Filtres actifs" /><ModuleMetric label="Ouverts" value={openCount} hint="À prendre en charge" /><ModuleMetric label="En traitement" value={inProgressCount} hint="Suivi actif" /><ModuleMetric label="Résolus / clos" value={completedCount} hint="Traitement terminé" /></ModuleMetrics>
        <ModuleContent>
          <ModuleSection id="new-ticket" title="Nouvelle demande" description="Décrivez le contexte, l’impact, les étapes déjà testées et les contraintes connues."><SupportForm /></ModuleSection>
          <ModuleSection id="tickets" title={canManageTickets ? "Tickets utilisateurs" : "Mes tickets"} count={`${ticketCount}`} description="La liste est paginée côté serveur et peut être filtrée sans charger tout l’historique.">
            <form method="get" action="/support#tickets" className="mb-5 grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 sm:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
              <label className="grid gap-1 text-xs font-bold text-dtsc-muted">Recherche<input name="q" defaultValue={q} placeholder="Objet ou description" className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" /></label>
              <label className="grid gap-1 text-xs font-bold text-dtsc-muted">Statut<select name="status" defaultValue={status || ""} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="">Tous</option><option value="OPEN">Ouvert</option><option value="IN_PROGRESS">En traitement</option><option value="RESOLVED">Résolu</option><option value="CLOSED">Clos</option></select></label>
              <label className="grid gap-1 text-xs font-bold text-dtsc-muted">Priorité<select name="priority" defaultValue={priority || ""} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="">Toutes</option><option value="URGENT">Urgente</option><option value="HIGH">Haute</option><option value="MEDIUM">Normale</option><option value="LOW">Faible</option></select></label>
              <button className="self-end rounded-xl bg-dtsc-blue px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--dtsc-brand-secondary-hover)]">Filtrer</button>
            </form>
            <TicketBoard tickets={JSON.parse(JSON.stringify(tickets))} canManage={canManageTickets} currentUserId={user.id} focusTicketId={params.ticketId} assignees={assignees} />
            <SupportPagination page={Math.min(page, pageCount)} pageCount={pageCount} query={{ q, status, priority }} />
          </ModuleSection>
          <ModuleSection id="support-guide" title="Guides et ressources utiles" description="Consultez l’aide native ou une publication réelle avant de créer une nouvelle demande." action={<ContextualUserGuide guide={guide} />}>
            <div className="grid gap-3 md:grid-cols-3"><Link href={getPublicUrl("/ressources")} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm font-semibold text-dtsc-blue hover:bg-dtsc-soft">Ressources DTSC</Link><Link href={getPublicUrl("/services")} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm font-semibold text-dtsc-blue hover:bg-dtsc-soft">Comprendre les 7 leviers</Link><Link href={getPublicUrl("/contact")} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm font-semibold text-dtsc-blue hover:bg-dtsc-soft">Contact général</Link></div>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </SupportProductShell>
  );
}
