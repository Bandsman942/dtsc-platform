import { AppShell } from "@/components/layout/app-shell";
import { SupportForm } from "@/components/support/support-form";
import { TicketBoard } from "@/components/support/ticket-board";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSupportTickets, supportTicketVisibilityWhere } from "@/lib/support-access";

type PageProps = { searchParams: Promise<{ ticketId?: string }> };

export default async function SupportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const session = await getSession();
  const { ticketId } = await searchParams;
  const canManageTickets = canManageSupportTickets(session);
  const tickets = await prisma.supportTicket.findMany({
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
  });

  const openCount = tickets.filter((ticket) => ticket.status === "OPEN").length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === "IN_PROGRESS").length;
  const completedCount = tickets.filter((ticket) => ticket.status === "RESOLVED" || ticket.status === "CLOSED").length;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Assistance"
          title="Support DTSC"
          count={`${tickets.length} ticket${tickets.length > 1 ? "s" : ""}`}
          description="Créez une demande lorsqu’un sujet nécessite une validation humaine, un cadrage commercial, une étude technique ou un accompagnement stratégique. Les notifications ouvrent directement le ticket concerné."
        />
        <ModuleMetrics label="Indicateurs du support">
          <ModuleMetric label="Total" value={tickets.length} hint={canManageTickets ? "Périmètre support" : "Vos demandes"} />
          <ModuleMetric label="Ouverts" value={openCount} hint="À prendre en charge" />
          <ModuleMetric label="En traitement" value={inProgressCount} hint="Suivi actif" />
          <ModuleMetric label="Résolus / clos" value={completedCount} hint="Traitement terminé" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Nouvelle demande" description="Décrivez le contexte, les outils concernés, les délais et les contraintes connues.">
            <SupportForm />
          </ModuleSection>
          <ModuleSection
            title={canManageTickets ? "Tickets utilisateurs" : "Mes tickets"}
            count={`${tickets.length}`}
            description={canManageTickets ? "Traitez les demandes visibles dans votre périmètre support." : "Suivez les réponses et l’état de vos demandes."}
          >
            <TicketBoard tickets={JSON.parse(JSON.stringify(tickets))} canManage={canManageTickets} currentUserId={user.id} focusTicketId={ticketId} />
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
