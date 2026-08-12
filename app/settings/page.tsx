import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import legacySettingsStyles from "@/components/settings/legacy-settings-panel.module.css";
import { SessionAndPushSettings } from "@/components/settings/session-and-push-settings";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { listCatalogAiModelsForUi } from "@/lib/ai/catalog";
import { getSession, requireUser } from "@/lib/auth";
import { getExperienceCopy, getIntlLocale } from "@/lib/experience-i18n";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";
import { getUserPushNotificationContentMode } from "@/lib/session-preference";

// Contrat de gouvernance de la session : Aucune gestion multi-appareils fictive.
// Cette page décrit uniquement la session signée courante tant qu'un registre serveur
// de sessions par appareil n'est pas la source réelle de cette fonctionnalité.
function sessionDate(value: number | undefined, intlLocale: string, unavailable: string) {
  return value ? new Date(value * 1000).toLocaleString(intlLocale) : unavailable;
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [session, pushNotificationContentMode] = await Promise.all([
    getSession(),
    getUserPushNotificationContentMode(user.id),
  ]);
  const models = listCatalogAiModelsForUi({
    context: session?.activeContext === "DTSC_INTERNAL" ? "DTSC_INTERNAL" : session?.activeContext === "ORGANIZATION" ? "ORGANIZATION" : "PERSONAL",
    locale: user.locale,
  });
  const copy = getExperienceCopy(user.locale).settings.page;
  const intlLocale = getIntlLocale(user.locale);
  const activeContext = session?.activeContext || "GLOBAL_CLIENT";

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          count={user.locale.toUpperCase()}
          description={copy.description}
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=settings">{copy.guide}</Link>
            </Button>
          )}
        />
        <ModuleMetrics label={copy.summary}>
          <ModuleMetric label={copy.language} value={user.locale.toUpperCase()} hint={copy.activeInterface} />
          <ModuleMetric label={copy.timezone} value={user.timezone} hint={copy.datesAndTimes} />
          <ModuleMetric label={copy.inactiveSession} value={`${user.sessionIdleTimeoutMinutes} min`} hint={copy.automaticSignOut} />
          <ModuleMetric label={copy.activeSpace} value={formatEnumLabelForLocale(activeContext, user.locale)} hint={session?.activeOrganizationName || copy.personalAccount} />
          <ModuleMetric label={copy.aiModels} value={models.length} hint={copy.availableModels} />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title={copy.currentSession} description={copy.currentSessionDescription}>
            <BusinessList ariaLabel={copy.currentSession}>
              <BusinessListItem title={copy.accountPreferences} description={user.email} status={<StatusBadge tone="success">{copy.activeSession}</StatusBadge>} />
              <BusinessListItem title={copy.activeSpace} description={`${formatEnumLabelForLocale(activeContext, user.locale)}${session?.activeOrganizationName ? ` · ${session.activeOrganizationName}` : ""}`} status={session?.activeOrganizationRole ? <StatusBadge>{formatEnumLabelForLocale(session.activeOrganizationRole, user.locale)}</StatusBadge> : undefined} />
              <BusinessListItem title={copy.authentication} description={sessionDate(session?.authTime, intlLocale, copy.unavailable)} />
              <BusinessListItem title={copy.lastRenewal} description={sessionDate(session?.issuedAt, intlLocale, copy.unavailable)} />
              <BusinessListItem title={copy.idleExpiration} description={sessionDate(session?.exp, intlLocale, copy.unavailable)} />
              <BusinessListItem title={copy.absoluteExpiration} description={sessionDate(session?.absoluteExp, intlLocale, copy.unavailable)} status={<StatusBadge tone="warning">{copy.newSignInAfter}</StatusBadge>} />
            </BusinessList>
          </ModuleSection>
          <ModuleSection title={copy.sessionAndNotifications} description={copy.sessionAndNotificationsDescription}>
            <SessionAndPushSettings initialIdleTimeoutMinutes={user.sessionIdleTimeoutMinutes} initialPushNotificationContentMode={pushNotificationContentMode} />
          </ModuleSection>
          <ModuleSection title={copy.accountPreferences} description={copy.accountPreferencesDescription}>
            <div className={legacySettingsStyles.scope}>
              <SettingsPanel user={user} models={models} />
            </div>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
