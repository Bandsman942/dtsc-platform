import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <section className="dtsc-panel max-w-4xl p-8">
        <p className="text-sm font-semibold text-cyan-600">Configuration</p>
        <h1 className="mt-2 text-3xl font-bold text-[#001736]">Paramètres du compte</h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          Les préférences utilisateur, notifications, sécurité avancée et gestion du mot de passe seront centralisées ici.
        </p>
        <div className="mt-6 rounded-2xl border border-[#a9c7ff] bg-[#d5e3fd] p-5 text-sm font-medium text-[#002b5b]">
          Base prête pour ajouter MFA, changement de mot de passe, préférences de modèle et notifications.
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {["Sécurité du compte", "Notifications", "Préférences IA", "Confidentialité"].map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(0,43,91,0.04)]">
              <h2 className="font-bold text-[#001736]">{item}</h2>
              <p className="mt-2 text-sm text-slate-500">Module prêt pour une prochaine itération.</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
