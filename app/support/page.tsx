import { AppShell } from "@/components/layout/app-shell";
import { SupportForm } from "@/components/support/support-form";
import { TicketBoard } from "@/components/support/ticket-board";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ProductSectionNavigation } from "@/components/workspace/product-section-navigation";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSupportTickets, supportTicketVisibilityWhere } from "@/lib/support-access";
import { getIteration07UserGuide } from "@/lib/user-guides/iteration07-guides";

type PageProps = { searchParams: Promise<{ ticketId?: string }> };

export default async function SupportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const session = await getSession();
  const { ticketId } = await searchParams;
  const canManageTickets = canManageSupportTickets(session);
  const [tickets, assignees] = await Promise.all([
    prisma.supportTicket.findMany({
      where: session ? supportTicketVisibilityWhere(session) : { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { name: true, email: true, role: true } },
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 21,
          include: {
            user: { select: { id: true, name: true, role: true } },
            replyTo: { select: { id: true, content: true, deletedAt: true, user: { select: { name: true } } } },
          },
        },
      },
      take: canManageTickets ? 200 : 100,
    }),
    canManageTickets
      ? prisma.user.findMany({
          where: {
            role: { in: ["ADMIN", "SUPPORT", "MANAGER"] },
            status: "ACTIVE",
            organizationMemberships: {
              some: {
                organization: { organizationType: "DTSC_INTERNAL", deletedAt: null },
                status: "ACTIVE",
                removedAt: null,
              },
            },
          },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: "asc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const openCount = tickets.filter((ticket) => ticket.status === "OPEN").length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === "IN_PROGRESS").length;
  const completedCount = tickets.filter((ticket) => ticket.status === "RESOLVED" || ticket.status === "CLOSED").length;
  const locale = user.locale === "en" ? "en" : "fr";
  const guide = getIteration07UserGuide("CONSOLE_SUPPORT", locale);

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Assistance"
          title="Support DTSC"
          count={`${tickets.length} ticket${tickets.length > 1 ? "s" : ""}`}
          description="Créez une demande lorsqu’un sujet nécessite une validation humaine, un cadrage commercial, une étude technique ou un accompagnement stratégique. Les notifications ouvrent directement le ticket concerné."
          secondaryActions={<ContextualUserGuide guide={guide} />}
        />

        <ProductSectionNavigation
          productLabel="Support DTSC"
          title="Espaces du support"
          activeSection={ticketId ? "tickets" : "new-ticket"}
          groups={[{ id: "support", label: "Parcours support", description: "Une expérience identique sur mobile et ordinateur, de la demande au suivi." }]}
          sections={[
            { id: "new-ticket", groupId: "support", label: "Nouvelle demande", description: "Créer un ticket structuré", href: "/support#new-ticket", icon: "create" },
            { id: "tickets", groupId: "support", label: canManageTickets ? "Tickets utilisateurs" : "Mes tickets", description: "Consulter les commentaires et le statut", href: "/support#tickets", icon: "support" },
            { id: "guide", groupId: "support", label: "Guide utilisateur", description: "Comprendre le workflow, le SLA et les limites", href: "/support#support-guide", icon: "help" },
          ]}
        />

        <ModuleMetrics label="Indicateurs du support">
          <ModuleMetric label="Total" value={tickets.length} hint={canManageTickets ? "Périmètre support" : "Vos demandes"} />
          <ModuleMetric label="Ouverts" value={openCount} hint="À prendre en charge" />
          <ModuleMetric label="En traitement" value={inProgressCount} hint="Suivi actif" />
          <ModuleMetric label="Résolus / clos" value={completedCount} hint="Traitement terminé" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection id="new-ticket" title="Nouvelle demande" description="Décrivez le contexte, les outils concernés, les délais et les contraintes connues.">
            <SupportForm />
          </ModuleSection>
          <ModuleSection
            id="tickets"
            title={canManageTickets ? "Tickets utilisateurs" : "Mes tickets"}
            count={`${tickets.length}`}
            description={canManageTickets ? "Traitez les demandes visibles dans votre périmètre support." : "Suivez les commentaires et l’état de vos demandes."}
          >
            <TicketBoard tickets={JSON.parse(JSON.stringify(tickets))} canManage={canManageTickets} currentUserId={user.id} focusTicketId={ticketId} assignees={assignees} />
          </ModuleSection>
          <ModuleSection
            id="support-guide"
            title="Guide utilisateur du Support"
            description="Le guide contextuel couvre la création, le suivi, les commentaires, le SLA et les limites du produit."
            action={<ContextualUserGuide guide={guide} />}
          >
            <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm leading-6 text-dtsc-muted">
              Ouvrez le guide pour consulter les capacités réelles, les étapes recommandées et les restrictions liées à votre rôle.
            </p>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
