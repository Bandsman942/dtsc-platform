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
import { getSession, requireUser } from "@/lib/auth";
import { formatEnumLabel } from "@/lib/labels";
import { listCatalogAiModelsForUi } from "@/lib/ai/catalog";

function sessionDate(value: number | undefined) {
  return value ? new Date(value * 1000).toLocaleString("fr-FR") : "Non disponible";
}

export default async function SettingsPage() {
  const user = await requireUser();
  const session = await getSession();
  const models = listCatalogAiModelsForUi({
    context: session?.activeContext === "DTSC_INTERNAL" ? "DTSC_INTERNAL" : session?.activeContext === "ORGANIZATION" ? "ORGANIZATION" : "PERSONAL",
    locale: user.locale,
  });

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Configuration"
          title="Paramètres du compte"
          count={user.locale.toUpperCase()}
          description="Gérez les préférences réellement persistées du compte, l’état Web Push et la session signée active. Aucune gestion multi-appareils fictive n’est présentée sans registre serveur de sessions."
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=settings">Guide des Paramètres</Link>
            </Button>
          )}
        />
        <ModuleMetrics label="Résumé des préférences">
          <ModuleMetric label="Langue" value={user.locale.toUpperCase()} hint="Interface active" />
          <ModuleMetric label="Fuseau" value={user.timezone} hint="Dates et heures" />
          <ModuleMetric label="Session inactive" value={`${user.sessionIdleTimeoutMinutes} min`} hint="Déconnexion automatique" />
          <ModuleMetric label="Contexte" value={formatEnumLabel(session?.activeContext || "GLOBAL_CLIENT")} hint={session?.activeOrganizationName || "Compte personnel"} />
          <ModuleMetric label="Modèles IA" value={models.length} hint="Modèles configurés" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Session actuelle" description="Ces informations proviennent du cookie de session signé actuellement utilisé. Elles ne prétendent pas représenter tous vos appareils.">
            <BusinessList ariaLabel="Session active">
              <BusinessListItem title="Compte" description={user.email} status={<StatusBadge tone="success">Session actuelle</StatusBadge>} />
              <BusinessListItem title="Contexte" description={`${formatEnumLabel(session?.activeContext || "GLOBAL_CLIENT")}${session?.activeOrganizationName ? ` · ${session.activeOrganizationName}` : ""}`} status={session?.activeOrganizationRole ? <StatusBadge>{formatEnumLabel(session.activeOrganizationRole)}</StatusBadge> : undefined} />
              <BusinessListItem title="Authentification" description={sessionDate(session?.authTime)} />
              <BusinessListItem title="Dernier renouvellement" description={sessionDate(session?.issuedAt)} />
              <BusinessListItem title="Expiration d’inactivité" description={sessionDate(session?.exp)} />
              <BusinessListItem title="Expiration absolue" description={sessionDate(session?.absoluteExp)} status={<StatusBadge tone="warning">Non prolongeable au-delà</StatusBadge>} />
            </BusinessList>
          </ModuleSection>
          <ModuleSection title="Session et notifications" description="Contrôlez la durée de connexion, la PWA et les notifications en arrière-plan selon la configuration réelle du navigateur et du serveur.">
            <SessionAndPushSettings initialIdleTimeoutMinutes={user.sessionIdleTimeoutMinutes} />
          </ModuleSection>
          <ModuleSection title="Préférences du compte" description="Personnalisez l’interface, les réponses IA, les notifications et les options de votre profil. Chaque contrôle affiché doit produire un comportement réel.">
            <div className={legacySettingsStyles.scope}>
              <SettingsPanel user={user} models={models} />
            </div>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
