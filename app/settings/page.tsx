import { AppShell } from "@/components/layout/app-shell";
import legacySettingsStyles from "@/components/settings/legacy-settings-panel.module.css";
import { SessionAndPushSettings } from "@/components/settings/session-and-push-settings";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { requireUser } from "@/lib/auth";
import { getConfiguredOpenAIModels, getDisplayName } from "@/lib/openai-config";

export default async function SettingsPage() {
  const user = await requireUser();
  const models = getConfiguredOpenAIModels().map((id) => ({
    id,
    label: getDisplayName(id),
  }));

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Configuration"
          title="Paramètres du compte"
          count={user.locale.toUpperCase()}
          description="Gérez votre profil, votre sécurité de session, les notifications en arrière-plan et les préférences de la plateforme DTSC."
        />
        <ModuleMetrics label="Résumé des préférences">
          <ModuleMetric label="Langue" value={user.locale.toUpperCase()} hint="Interface active" />
          <ModuleMetric label="Fuseau" value={user.timezone} hint="Dates et heures" />
          <ModuleMetric label="Session inactive" value={`${user.sessionIdleTimeoutMinutes} min`} hint="Déconnexion automatique" />
          <ModuleMetric label="Modèles IA" value={models.length} hint="Modèles configurés" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Session et notifications" description="Contrôlez la durée de connexion, la PWA et les notifications en arrière-plan.">
            <SessionAndPushSettings initialIdleTimeoutMinutes={user.sessionIdleTimeoutMinutes} />
          </ModuleSection>
          <ModuleSection title="Préférences du compte" description="Personnalisez l’interface, les réponses IA, les notifications et les options de votre profil.">
            <div className={legacySettingsStyles.scope}>
              <SettingsPanel user={{ ...user, pushNotificationsEnabled: false }} models={models} />
            </div>
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
