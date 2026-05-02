import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <section className="max-w-3xl rounded-lg border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-2xl font-semibold text-white">Paramètres du compte</h1>
        <p className="mt-3 text-slate-400">
          Les préférences utilisateur, notifications, sécurité avancée et gestion du mot de passe seront centralisées ici.
        </p>
        <div className="mt-6 rounded-lg border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
          Base prête pour ajouter MFA, changement de mot de passe, préférences de modèle et notifications.
        </div>
      </section>
    </AppShell>
  );
}
