import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileActivityHistory, type ProfileActivityItem } from "@/components/profile/profile-activity-history";
import { ProfileAccountInfo } from "@/components/profile/profile-account-info";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
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
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Compte client"
          title="Profil utilisateur"
          count={formatEnumLabel(user.role)}
          description="Gérez l’identité personnelle et professionnelle du compte. Les informations sensibles restent privées par défaut et l’adresse e-mail principale n’est jamais modifiée silencieusement depuis ce formulaire."
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=profile">Guide du Profil</Link>
            </Button>
          )}
        />
        <ModuleMetrics label="Indicateurs du profil">
          <ModuleMetric label="Notifications récentes" value={notifications.length} hint="Activité enregistrée" />
          <ModuleMetric label="Conversations" value={conversations.length} hint="Historique récent" />
          <ModuleMetric label="Tickets support" value={tickets.length} hint="Demandes suivies" />
          <ModuleMetric label="Messages de groupe" value={groupMessages.length} hint="Contributions récentes" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Visibilité et responsabilités" description="Le profil ne remplace ni le membership d’une organisation, ni son poste officiel, ni ses permissions.">
            <BusinessList ariaLabel="Politique de visibilité du profil">
              <BusinessListItem title="Adresse e-mail" description={user.email} status={<StatusBadge tone="warning">Identifiant principal</StatusBadge>} />
              <BusinessListItem title="Profil public" description={user.publicProfileConsent ? "Consentement accordé pour les surfaces explicitement prévues." : "Aucune visibilité publique consentie."} status={<StatusBadge tone={user.publicProfileConsent ? "success" : "neutral"}>{user.publicProfileConsent ? "Autorisé" : "Privé"}</StatusBadge>} />
              <BusinessListItem title="Photo et informations professionnelles" description="Utilisées dans la navigation, les messages et publications uniquement selon les droits et préférences applicables." status={<StatusBadge>Contrôlé</StatusBadge>} />
            </BusinessList>
          </ModuleSection>
          <ModuleSection title="Compte et activité" description={`Historique limité selon la politique de rétention de ${settings.notificationRetentionDays} jours.`}>
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
              <AccordionItem title="Historique d’activité">
                <ProfileActivityHistory items={activityItems} retentionDays={settings.notificationRetentionDays} />
              </AccordionItem>
            </Accordion>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
