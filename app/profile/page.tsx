import { AppShell } from "@/components/layout/app-shell";
import { ProfileActivityHistory, type ProfileActivityItem } from "@/components/profile/profile-activity-history";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export default async function ProfilePage() {
  const user = await requireUser();
  const [settings, notifications, conversations, tickets, groupMessages] = await Promise.all([
    getAppSettings(),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, title: true, body: true, createdAt: true },
    }),
    prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
    }),
    prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, subject: true, status: true, updatedAt: true },
    }),
    prisma.collaborationGroupMessage.findMany({
      where: { authorId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, content: true, createdAt: true, group: { select: { name: true } } },
    }),
  ]);
  const activityItems: ProfileActivityItem[] = [
    ...notifications.map((item) => ({
      id: item.id,
      type: "notification" as const,
      title: item.title,
      detail: item.body,
      createdAt: item.createdAt.toISOString(),
    })),
    ...conversations.map((item) => ({
      id: item.id,
      type: "conversation" as const,
      title: item.title,
      detail: `${item._count.messages} messages dans le chatbot privé.`,
      createdAt: item.updatedAt.toISOString(),
    })),
    ...tickets.map((item) => ({
      id: item.id,
      type: "ticket" as const,
      title: item.subject,
      detail: `Ticket support ${formatEnumLabel(item.status)}.`,
      createdAt: item.updatedAt.toISOString(),
    })),
    ...groupMessages.map((item) => ({
      id: item.id,
      type: "group_message" as const,
      title: item.group.name,
      detail: item.content,
      createdAt: item.createdAt.toISOString(),
    })),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 30);

  return (
    <AppShell user={user}>
      <section className="dtsc-panel max-w-6xl overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-[#001736] p-8 text-white">
          <p className="text-sm font-semibold text-cyan-300">Compte client</p>
          <h1 className="mt-2 text-3xl font-black">Profil utilisateur</h1>
          <p className="mt-2 text-sm text-slate-300">Informations de contact, identité professionnelle et visibilité publique maîtrisée.</p>
        </div>
        <div className="p-4 sm:p-6">
          <Accordion>
            <AccordionItem title="Informations du compte" defaultOpen>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <dt className="text-sm text-dtsc-muted">Nom</dt>
                  <dd className="mt-1 font-bold text-dtsc-ink">{user.name}</dd>
                </div>
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <dt className="text-sm text-dtsc-muted">Email</dt>
                  <dd className="mt-1 font-bold text-dtsc-ink">{user.email}</dd>
                </div>
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <dt className="text-sm text-dtsc-muted">Entreprise</dt>
                  <dd className="mt-1 font-bold text-dtsc-ink">{user.companyName || "Non renseignée"}</dd>
                </div>
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <dt className="text-sm text-dtsc-muted">Téléphone</dt>
                  <dd className="mt-1 font-bold text-dtsc-ink">{user.phone || "Non renseigné"}</dd>
                </div>
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <dt className="text-sm text-dtsc-muted">Rôle</dt>
                  <dd className="mt-1 inline-flex rounded-full bg-[#d5e3fd] px-3 py-1 text-sm font-bold text-[#002b5b]">{formatEnumLabel(user.role)}</dd>
                </div>
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
                  <dt className="text-sm text-dtsc-muted">Inscription</dt>
                  <dd className="mt-1 font-bold text-dtsc-ink">{formatDate(user.createdAt)}</dd>
                </div>
              </dl>
            </AccordionItem>
            <AccordionItem title="Modifier le profil">
              <ProfileEditor user={JSON.parse(JSON.stringify(user))} />
            </AccordionItem>
            <AccordionItem title="Historique d'activité">
              <ProfileActivityHistory items={activityItems} retentionDays={settings.notificationRetentionDays} />
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </AppShell>
  );
}
