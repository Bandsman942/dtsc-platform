import { AppShell } from "@/components/layout/app-shell";
import { SupportForm } from "@/components/support/support-form";
import { TicketBoard } from "@/components/support/ticket-board";
import { getSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSupportTickets, supportTicketVisibilityWhere } from "@/lib/support-access";

export default async function SupportPage() {
  const user = await requireUser();
  const session = await getSession();
  const canManageTickets = canManageSupportTickets(session);
  const tickets = await prisma.supportTicket.findMany({
    where: session ? supportTicketVisibilityWhere(session) : { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { name: true, email: true, role: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true, role: true } } },
      },
    },
    take: canManageTickets ? 200 : 100,
  });

  return (
    <AppShell user={user}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <p className="text-sm font-bold text-cyan-600">Assistance</p>
          <h1 className="mt-2 text-4xl font-black text-dtsc-ink">Support DTSC</h1>
          <p className="mt-3 max-w-2xl leading-7 text-dtsc-muted">
            Créez une demande lorsqu&apos;un sujet nécessite une validation humaine, un cadrage commercial, une étude technique ou un accompagnement stratégique.
          </p>
          <div className="mt-6">
            <SupportForm />
          </div>
        </section>
        <aside className="dtsc-card p-6">
          <h2 className="font-black text-dtsc-ink">Bonnes pratiques</h2>
          <ul className="mt-4 space-y-3 text-sm text-dtsc-muted">
            <li>Décrivez le contexte métier.</li>
            <li>Indiquez les outils ou sources de données concernés.</li>
            <li>Précisez les délais et personnes impliquées.</li>
            <li>Ajoutez les contraintes techniques connues.</li>
          </ul>
        </aside>
      </div>
      <section className="mt-6">
        <div className="mb-4">
          <p className="text-sm font-bold text-cyan-600">{canManageTickets ? "Traitement support" : "Suivi de vos demandes"}</p>
          <h2 className="mt-1 text-2xl font-black text-dtsc-ink">
            {canManageTickets ? "Tickets utilisateurs" : "Mes tickets"}
          </h2>
        </div>
        <TicketBoard tickets={JSON.parse(JSON.stringify(tickets))} canManage={canManageTickets} />
      </section>
    </AppShell>
  );
}
