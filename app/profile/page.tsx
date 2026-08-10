import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileActivityHistory, type ProfileActivityItem } from "@/components/profile/profile-activity-history";
import { ProfileAccountInfo } from "@/components/profile/profile-account-info";
import { ProfileContacts } from "@/components/profile/profile-contacts";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getSession, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { getAcceptedCollaborationContacts, getCollaborationPresenceMap } from "@/lib/standard-collaboration";

export default async function ProfilePage({ searchParams }: { searchParams?: Promise<{ contactId?: string }> }) {
  const user = await requireUser();
  const session = await getSession();
  const params = await searchParams;
  if (!session) throw new Error("SESSION_REQUIRED");
  const english = user.locale === "en";

  const [settings, notifications, conversations, tickets, groupMessages, acceptedContacts] = await Promise.all([
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
    getAcceptedCollaborationContacts(session, 200),
  ]);

  const presenceMap = await getCollaborationPresenceMap(acceptedContacts.map((contact) => contact.id));
  const contactsWithPresence = acceptedContacts.map((contact) => ({
    ...contact,
    lastSeenAt: presenceMap.get(contact.id) || contact.lastSeenAt,
  }));

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
      detail: english ? `${item._count.messages} messages in the private chatbot.` : `${item._count.messages} messages dans le chatbot privé.`,
      createdAt: item.updatedAt.toISOString(),
    })),
    ...tickets.map((item) => ({
      id: item.id,
      type: "ticket" as const,
      title: item.subject,
      detail: english ? `Support ticket ${formatEnumLabel(item.status)}.` : `Ticket support ${formatEnumLabel(item.status)}.`,
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
          eyebrow={english ? "Customer account" : "Compte client"}
          title={english ? "User profile" : "Profil utilisateur"}
          count={formatEnumLabel(user.role)}
          description={english ? "Manage your personal identity, professional information, accepted contacts and recent account activity from one foldable profile workspace." : "Gérez votre identité personnelle, vos informations professionnelles, vos contacts acceptés et l’activité récente du compte depuis un espace Profil organisé en sections repliables."}
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=profile">{english ? "Profile guide" : "Guide du Profil"}</Link>
            </Button>
          )}
        />
        <ModuleMetrics label={english ? "Profile indicators" : "Indicateurs du profil"}>
          <ModuleMetric label={english ? "Contacts" : "Contacts"} value={contactsWithPresence.length} hint={english ? "Accepted relationships" : "Relations acceptées"} />
          <ModuleMetric label={english ? "Recent notifications" : "Notifications récentes"} value={notifications.length} hint={english ? "Recorded activity" : "Activité enregistrée"} />
          <ModuleMetric label={english ? "Support tickets" : "Tickets support"} value={tickets.length} hint={english ? "Tracked requests" : "Demandes suivies"} />
          <ModuleMetric label={english ? "Group messages" : "Messages de groupe"} value={groupMessages.length} hint={english ? "Recent contributions" : "Contributions récentes"} />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection
            title={english ? "Profile sections" : "Sections du profil"}
            description={english ? `Open only the information you need. Activity history remains limited by the ${settings.notificationRetentionDays}-day retention policy.` : `Dépliez uniquement les informations utiles. L’historique reste limité selon la politique de rétention de ${settings.notificationRetentionDays} jours.`}
          >
            <Accordion>
              <AccordionItem title={english ? "Account and visibility" : "Compte et visibilité"} defaultOpen>
                <div className="grid min-w-0 gap-5">
                  <ProfileAccountInfo
                    account={{
                      name: user.name,
                      email: user.email,
                      companyName: user.companyName || (english ? "Not provided" : "Non renseignée"),
                      phone: user.phone || (english ? "Not provided" : "Non renseigné"),
                      role: formatEnumLabel(user.role),
                      createdAt: formatDate(user.createdAt),
                    }}
                  />
                  <BusinessList ariaLabel={english ? "Profile visibility policy" : "Politique de visibilité du profil"}>
                    <BusinessListItem title={english ? "Email address" : "Adresse e-mail"} description={user.email} status={<StatusBadge tone="warning">{english ? "Primary identifier" : "Identifiant principal"}</StatusBadge>} />
                    <BusinessListItem title={english ? "Public profile" : "Profil public"} description={user.publicProfileConsent ? (english ? "Consent granted for explicitly supported discovery surfaces." : "Consentement accordé pour les surfaces explicitement prévues.") : (english ? "No public profile discovery consent." : "Aucune visibilité publique consentie.")} status={<StatusBadge tone={user.publicProfileConsent ? "success" : "neutral"}>{user.publicProfileConsent ? (english ? "Allowed" : "Autorisé") : (english ? "Private" : "Privé")}</StatusBadge>} />
                    <BusinessListItem title={english ? "Professional photo and information" : "Photo et informations professionnelles"} description={english ? "Used in navigation, messages and publications only when the applicable rights and preferences allow it." : "Utilisées dans la navigation, les messages et publications uniquement selon les droits et préférences applicables."} status={<StatusBadge>{english ? "Controlled" : "Contrôlé"}</StatusBadge>} />
                  </BusinessList>
                </div>
              </AccordionItem>

              <AccordionItem title={`${english ? "Contacts" : "Contacts"} (${contactsWithPresence.length})`}>
                <ProfileContacts
                  contacts={JSON.parse(JSON.stringify(contactsWithPresence))}
                  locale={user.locale}
                  initialSelectedContactId={params?.contactId || null}
                />
              </AccordionItem>

              <AccordionItem title={english ? "Edit profile" : "Modifier le profil"}>
                <ProfileEditor user={JSON.parse(JSON.stringify(user))} />
              </AccordionItem>

              <AccordionItem title={english ? "Activity history" : "Historique d’activité"}>
                <ProfileActivityHistory items={activityItems} retentionDays={settings.notificationRetentionDays} />
              </AccordionItem>
            </Accordion>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
