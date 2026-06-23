import { AppShell } from "@/components/layout/app-shell";
import { ProfileActivityHistory, type ProfileActivityItem } from "@/components/profile/profile-activity-history";
import { ProfileAccountInfo } from "@/components/profile/profile-account-info";
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
      </section>

      <section className="dtsc-panel max-w-6xl overflow-hidden p-0">
        <div className="p-4 sm:p-6">
          <Accordion>
            <AccordionItem title="Informations du compte" defaultOpen>
              <ProfileAccountInfo
                account={{
                  name: user.name,
                  email: user.email,
                  companyName: user.companyName || "Non renseignée",
                  phone: user.phone || "Non renseigné",
                  role: formatEnumLabel(user.role),
                  createdAt: formatDate(user.createdAt),
                }}
              />
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
