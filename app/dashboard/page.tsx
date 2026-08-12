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
import { fillExperienceTemplate, getExperienceCopy, getIntlLocale } from "@/lib/experience-i18n";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";

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

  const copy = getExperienceCopy(user.locale).dashboard;
  const intlLocale = getIntlLocale(user.locale);
  const workspace = await getPersonalWorkspaceSummary({ user, session });
  const subscription = workspace.subscription;
  const contextLabel = workspace.context.type === "PERSONAL"
    ? copy.personal
    : workspace.context.type === "DTSC_INTERNAL"
      ? "DTSC"
      : copy.company;
  const organizationHint = workspace.context.organizationName || copy.globalAccount;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={fillExperienceTemplate(copy.welcome, { name: user.name })}
          title={copy.title}
          description={copy.description}
          primaryAction={(
            <Button asChild className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Link href="/chat"><Plus className="h-4 w-4" />{copy.newChat}</Link>
            </Button>
          )}
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=dashboard">{copy.guide}</Link>
            </Button>
          )}
        />

        <ModuleMetrics label={copy.metricsLabel}>
          <ModuleMetric label={copy.context} value={contextLabel} hint={organizationHint} />
          <ModuleMetric label={copy.expectedActions} value={workspace.actions.length} hint={copy.authorizedPriorities} />
          <ModuleMetric label={copy.unreadNotifications} value={workspace.account.unreadNotificationCount} hint={copy.globalCenter} />
          <ModuleMetric label={copy.organizations} value={workspace.account.membershipCount} hint={copy.activeMemberships} />
          <ModuleMetric label={copy.invitations} value={workspace.account.pendingInvitationCount} hint={copy.toAcceptOrReject} />
          <ModuleMetric label={copy.relationships} value={workspace.account.pendingRelationshipCount} hint={copy.consentsAndRequests} />
          <ModuleMetric label={copy.plan} value={subscription.planLabel} hint={formatEnumLabelForLocale(subscription.status, user.locale)} />
        </ModuleMetrics>

        <ModuleContent>
          <ModuleSection title={copy.currentContext} description={copy.currentContextDescription}>
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
              <BusinessList ariaLabel={copy.currentContext}>
                <BusinessListItem title={copy.contextType} description={contextLabel} leading={<Building2 className="h-5 w-5 text-cyan-600" />} />
                <BusinessListItem title={copy.activeOrganization} description={workspace.context.organizationName || copy.noActiveOrganization} status={workspace.context.organizationRole ? <StatusBadge>{formatEnumLabelForLocale(workspace.context.organizationRole, user.locale)}</StatusBadge> : undefined} />
                <BusinessListItem title={copy.account} description={user.email} status={<StatusBadge>{formatEnumLabelForLocale(user.role, user.locale)}</StatusBadge>} />
              </BusinessList>
              <div className="min-w-0 rounded-2xl border border-dtsc-border bg-[#001736] p-5 text-white">
                <ShieldAlert className="h-6 w-6 text-cyan-300" />
                <h2 className="mt-4 text-lg font-black">{copy.serverControlledTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{copy.serverControlledDescription}</p>
                <Button asChild variant="outline" className="mt-5 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20">
                  <Link href="/company">{copy.viewOrganizations}</Link>
                </Button>
              </div>
            </div>
          </ModuleSection>

          <ModuleSection title={copy.expectedActions} description={copy.expectedActionsDescription}>
            {workspace.actions.length ? (
              <BusinessList ariaLabel={copy.expectedActions}>
                {workspace.actions.map((action) => (
                  <BusinessListItem
                    key={action.id}
                    title={action.title}
                    description={action.description}
                    meta={`${formatEnumLabelForLocale(action.category, user.locale)} · ${action.contextLabel}`}
                    status={<StatusBadge tone={actionTone(action.priority)}>{formatEnumLabelForLocale(action.priority, user.locale)}</StatusBadge>}
                    actions={<Link href={action.href} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-black text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:translate-y-px">{copy.process} <ExternalLink className="h-4 w-4" /></Link>}
                  />
                ))}
              </BusinessList>
            ) : (
              <EmptyState compact title={copy.noPriorityAction} description={copy.noPriorityActionDescription} />
            )}
          </ModuleSection>

          <ModuleSection title={copy.quickAccess} description={copy.quickAccessDescription}>
            <div data-responsive-actions className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {[
                ["/chat", copy.assistant, Bot],
                ["/profile", copy.profile, UserRound],
                ["/billing", copy.subscription, CreditCard],
                ["/company", copy.company, BriefcaseBusiness],
                ["/notifications", copy.notifications, Bell],
                [getSupportUrl("/support"), copy.support, Headphones],
                ["/settings", copy.settings, Settings],
              ].map(([href, label, Icon]) => (
                <Button key={String(href)} asChild variant="outline" className="min-w-0 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                  <Link href={String(href)}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{String(label)}</span></Link>
                </Button>
              ))}
            </div>
          </ModuleSection>

          <Accordion>
            <AccordionItem title={copy.subscriptionUsage} defaultOpen>
              <div className="min-w-0 space-y-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-dtsc-border pb-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{subscription.source === "ORGANIZATION" ? copy.organizationSubscription : copy.personalSubscription}</p>
                    <h2 className="mt-1 text-xl font-black text-dtsc-ink">{copy.plan} {subscription.planLabel}</h2>
                    <p className="mt-2 text-sm font-semibold text-dtsc-muted">{copy.status} {formatEnumLabelForLocale(subscription.status, user.locale)}{subscription.cancelAtPeriodEnd ? ` · ${formatEnumLabelForLocale("CANCELED", user.locale)}` : ""}</p>
                  </div>
                  <StatusBadge tone={subscription.active ? "success" : "warning"}>{subscription.active ? copy.active : copy.interventionRequired}</StatusBadge>
                </div>
                <BusinessList ariaLabel={copy.subscriptionUsage}>
                  <BusinessListItem title={copy.messagesToday} status={<StatusBadge>{usageLabel(subscription.usedMessagesToday, subscription.messageLimit)}</StatusBadge>} />
                  <BusinessListItem title={copy.tokensToday} status={<StatusBadge>{usageLabel(subscription.usedTokensToday, subscription.tokenLimit)}</StatusBadge>} />
                  <BusinessListItem title={copy.documents} status={<StatusBadge>{usageLabel(subscription.usedDocuments, subscription.documentLimit)}</StatusBadge>} />
                  <BusinessListItem title={copy.period} description={subscription.periodEnd ? fillExperienceTemplate(copy.dueDate, { date: new Date(subscription.periodEnd).toLocaleDateString(intlLocale) }) : copy.noDueDate} />
                </BusinessList>
                <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/billing">{copy.openSubscription}</Link></Button>
              </div>
            </AccordionItem>

            <AccordionItem title={copy.organizationsAndRelationships}>
              {workspace.organizations.length ? (
                <BusinessList ariaLabel={copy.organizationsAndRelationships}>
                  {workspace.organizations.map((organization) => (
                    <BusinessListItem
                      key={organization.id}
                      title={organization.name}
                      description={`${formatEnumLabelForLocale(organization.type, user.locale)} · ${formatEnumLabelForLocale(organization.role, user.locale)}`}
                      status={<StatusBadge tone={organization.active ? "success" : "neutral"}>{organization.active ? copy.activeContext : copy.accessible}</StatusBadge>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title={copy.noOrganization} description={copy.noOrganizationDescription} />}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/enterprise-invitations">{copy.companyInvitations}</Link></Button>
                <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/enterprise-links">{copy.companyRelationships}</Link></Button>
              </div>
            </AccordionItem>

            <AccordionItem title={copy.recentActivity}>
              {workspace.recentActivity.length ? (
                <BusinessList ariaLabel={copy.recentActivity}>
                  {workspace.recentActivity.map((activity) => (
                    <BusinessListItem
                      key={activity.id}
                      title={activity.title}
                      description={activity.description}
                      meta={new Date(activity.occurredAt).toLocaleString(intlLocale)}
                      status={<StatusBadge>{formatEnumLabelForLocale(activity.category, user.locale)}</StatusBadge>}
                      actions={<Link href={activity.href} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-black text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:translate-y-px">{copy.open}</Link>}
                    />
                  ))}
              </BusinessList>
              ) : <EmptyState compact title={copy.noRecentActivity} />}
            </AccordionItem>
          </Accordion>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
