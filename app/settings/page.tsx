import { AppShell } from "@/components/layout/app-shell";
import { SessionAndPushSettings } from "@/components/settings/session-and-push-settings";
import { SettingsPanel } from "@/components/settings/settings-panel";
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
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Configuration</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Paramètres du compte</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Gérez votre profil, votre sécurité de session, les notifications en arrière-plan et les préférences de la plateforme DTSC.
          </p>
        </section>
        <SessionAndPushSettings initialIdleTimeoutMinutes={user.sessionIdleTimeoutMinutes} />
        <SettingsPanel user={{ ...user, pushNotificationsEnabled: false }} models={models} />
      </div>
    </AppShell>
  );
}
