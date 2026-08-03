import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  CreditCard,
  ExternalLink,
  Headphones,
  Plus,
  Settings,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getPersonalWorkspaceSummary, type WorkspaceActionPriority } from "@/lib/account/personal-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getSupportUrl } from "@/lib/domains";
import { formatEnumLabel } from "@/lib/labels";

function actionTone(priority: WorkspaceActionPriority): "danger" | "warning" | "neutral" {
  if (priority === "URGENT") return "danger";
  if (priority === "IMPORTANT") return "warning";
  return "neutral";
}

function usageLabel(used: number, limit: number | null) {
  return limit === null ? `${used}` : `${used}/${limit}`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const session = await getSession();
  if (!session) redirect("/auth/sign-in");

  const workspace = await getPersonalWorkspaceSummary({ user, session });
  const subscription = workspace.subscription;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={`Bienvenue, ${user.name}`}
          title="Votre espace personnel DTSC"
          count={workspace.context.label}
          description="Comprenez votre contexte actif, traitez les actions qui vous attendent et accédez aux services réellement disponibles pour votre compte."
          primaryAction={(
            <Button asChild className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Link href="/chat"><Plus className="h-4 w-4" />Nouvelle conversation IA</Link>
            </Button>
          )}
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=dashboard">Guide du Dashboard</Link>
            </Button>
          )}
        />

        <ModuleMetrics label="Indicateurs du compte">
          <ModuleMetric label="Contexte" value={workspace.context.type === "PERSONAL" ? "Personnel" : workspace.context.type === "DTSC_INTERNAL" ? "DTSC" : "Entreprise"} hint={workspace.context.organizationName || "Compte global"} />
          <ModuleMetric label="Actions attendues" value={workspace.actions.length} hint="Priorisées et autorisées" />
          <ModuleMetric label="Notifications non lues" value={workspace.account.unreadNotificationCount} hint="Centre global" />
          <ModuleMetric label="Organisations" value={workspace.account.membershipCount} hint="Memberships actifs" />
          <ModuleMetric label="Invitations" value={workspace.account.pendingInvitationCount} hint="À accepter ou refuser" />
          <ModuleMetric label="Relations" value={workspace.account.pendingRelationshipCount} hint="Consentements et demandes" />
          <ModuleMetric label="Plan" value={subscription.planLabel} hint={formatEnumLabel(subscription.status)} />
        </ModuleMetrics>

        <ModuleContent>
          <ModuleSection title="Contexte actuel" description="Le contexte détermine les données, la navigation, les modules et les notifications autorisés.">
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
              <BusinessList ariaLabel="Résumé du contexte actif">
                <BusinessListItem title="Type de contexte" description={workspace.context.label} leading={<Building2 className="h-5 w-5 text-cyan-600" />} />
                <BusinessListItem title="Organisation active" description={workspace.context.organizationName || "Aucune organisation active"} status={workspace.context.organizationRole ? <StatusBadge>{formatEnumLabel(workspace.context.organizationRole)}</StatusBadge> : undefined} />
                <BusinessListItem title="Compte" description={user.email} status={<StatusBadge>{formatEnumLabel(user.role)}</StatusBadge>} />
              </BusinessList>
              <div className="min-w-0 rounded-2xl border border-dtsc-border bg-[#001736] p-5 text-white">
                <ShieldAlert className="h-6 w-6 text-cyan-300" />
                <h2 className="mt-4 text-lg font-black">Contexte contrôlé côté serveur</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">Un espace révoqué ou inactif n’est plus sélectionnable. Les routes et liens profonds revérifient toujours vos droits actuels.</p>
                <Button asChild variant="outline" className="mt-5 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20">
                  <Link href="/company">Voir mes organisations</Link>
                </Button>
              </div>
            </div>
          </ModuleSection>

          <ModuleSection title="Actions attendues" description="Invitations, consentements, alertes et demandes nécessitant réellement votre intervention.">
            {workspace.actions.length ? (
              <BusinessList ariaLabel="Actions attendues">
                {workspace.actions.map((action) => (
                  <BusinessListItem
                    key={action.id}
                    title={action.title}
                    description={action.description}
                    meta={`${formatEnumLabel(action.category)} · ${action.contextLabel}`}
                    status={<StatusBadge tone={actionTone(action.priority)}>{formatEnumLabel(action.priority)}</StatusBadge>}
                    actions={<Link href={action.href} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">Traiter <ExternalLink className="h-4 w-4" /></Link>}
                  />
                ))}
              </BusinessList>
            ) : (
              <EmptyState compact title="Aucune action prioritaire" description="Votre compte ne contient actuellement aucune invitation, relation ou alerte nécessitant une intervention." />
            )}
          </ModuleSection>

          <ModuleSection title="Accès rapides" description="Ouvrez les services principaux sans perdre votre contexte actif.">
            <div data-responsive-actions className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {[
                ["/chat", "Assistant IA", Bot],
                ["/profile", "Profil", UserRound],
                ["/billing", "Abonnement", CreditCard],
                ["/company", "Entreprise", BriefcaseBusiness],
                ["/notifications", "Notifications", Bell],
                [getSupportUrl("/support"), "Support", Headphones],
                ["/settings", "Paramètres", Settings],
              ].map(([href, label, Icon]) => (
                <Button key={String(href)} asChild variant="outline" className="min-w-0 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                  <Link href={String(href)}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{String(label)}</span></Link>
                </Button>
              ))}
            </div>
          </ModuleSection>

          <Accordion>
            <AccordionItem title="Abonnement et consommation" defaultOpen>
              <div className="min-w-0 space-y-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-dtsc-border pb-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{subscription.source === "ORGANIZATION" ? "Abonnement organisation" : "Abonnement personnel"}</p>
                    <h2 className="mt-1 text-xl font-black text-dtsc-ink">Plan {subscription.planLabel}</h2>
                    <p className="mt-2 text-sm font-semibold text-dtsc-muted">Statut {formatEnumLabel(subscription.status)}{subscription.cancelAtPeriodEnd ? " · annulation en fin de période" : ""}</p>
                  </div>
                  <StatusBadge tone={subscription.active ? "success" : "warning"}>{subscription.active ? "Actif" : "Intervention requise"}</StatusBadge>
                </div>
                <BusinessList ariaLabel="Consommation de l’abonnement">
                  <BusinessListItem title="Messages aujourd’hui" status={<StatusBadge>{usageLabel(subscription.usedMessagesToday, subscription.messageLimit)}</StatusBadge>} />
                  <BusinessListItem title="Tokens aujourd’hui" status={<StatusBadge>{usageLabel(subscription.usedTokensToday, subscription.tokenLimit)}</StatusBadge>} />
                  <BusinessListItem title="Documents" status={<StatusBadge>{usageLabel(subscription.usedDocuments, subscription.documentLimit)}</StatusBadge>} />
                  <BusinessListItem title="Période" description={subscription.periodEnd ? `Échéance ${new Date(subscription.periodEnd).toLocaleDateString("fr-FR")}` : "Aucune échéance définie"} />
                </BusinessList>
                <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/billing">Ouvrir l’abonnement</Link></Button>
              </div>
            </AccordionItem>

            <AccordionItem title="Organisations et relations">
              {workspace.organizations.length ? (
                <BusinessList ariaLabel="Organisations accessibles">
                  {workspace.organizations.map((organization) => (
                    <BusinessListItem
                      key={organization.id}
                      title={organization.name}
                      description={`${formatEnumLabel(organization.type)} · ${formatEnumLabel(organization.role)}`}
                      status={<StatusBadge tone={organization.active ? "success" : "neutral"}>{organization.active ? "Contexte actif" : "Accessible"}</StatusBadge>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title="Aucune organisation rejointe" description="Les invitations reçues restent visibles dans votre compte personnel avant toute adhésion." />}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/enterprise-invitations">Invitations</Link></Button>
                <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/enterprise-links">Relations avec les entreprises</Link></Button>
              </div>
            </AccordionItem>

            <AccordionItem title="Activité récente">
              {workspace.recentActivity.length ? (
                <BusinessList ariaLabel="Activité récente du compte">
                  {workspace.recentActivity.map((activity) => (
                    <BusinessListItem
                      key={activity.id}
                      title={activity.title}
                      description={activity.description}
                      meta={new Date(activity.occurredAt).toLocaleString("fr-FR")}
                      status={<StatusBadge>{formatEnumLabel(activity.category)}</StatusBadge>}
                      actions={<Link href={activity.href} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">Ouvrir</Link>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title="Aucune activité récente" />}
            </AccordionItem>
          </Accordion>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
