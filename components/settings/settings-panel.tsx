"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Bell, Lock, Monitor, Moon, Save, Sun, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export function SettingsPanel({
  user,
  models,
}: {
  user: {
    name: string;
    email: string;
    companyName: string | null;
    phone: string | null;
    preferredModel?: string | null;
    notifySupportEnabled?: boolean;
    notifyUsageEnabled?: boolean;
    notifyBroadcastEnabled?: boolean;
    pushNotificationsEnabled?: boolean;
  };
  models: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [preferencesMessage, setPreferencesMessage] = useState("");
  const [pushEnabled, setPushEnabled] = useState(Boolean(user.pushNotificationsEnabled));

  useEffect(() => setMounted(true), []);

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setProfileMessage(response.ok ? "Profil mis à jour." : "Impossible de mettre à jour le profil.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPasswordMessage(response.ok ? "Mot de passe mis à jour." : "Mot de passe actuel incorrect ou nouveau mot de passe invalide.");
    if (response.ok) {
      form.reset();
    }
  }

  async function updatePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreferencesMessage("");
    const formData = new FormData(event.currentTarget);
    const wantsPush = formData.get("pushNotificationsEnabled") === "on";

    if (wantsPush && "Notification" in window && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPreferencesMessage("Autorisation navigateur refusée. Les autres préférences peuvent être enregistrées sans notifications téléphone.");
        setPushEnabled(false);
        return;
      }
    }

    const payload = {
      preferredModel: String(formData.get("preferredModel") || ""),
      notifySupportEnabled: formData.get("notifySupportEnabled") === "on",
      notifyUsageEnabled: formData.get("notifyUsageEnabled") === "on",
      notifyBroadcastEnabled: formData.get("notifyBroadcastEnabled") === "on",
      pushNotificationsEnabled: wantsPush,
    };
    const response = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPreferencesMessage(response.ok ? "Préférences enregistrées." : "Impossible d'enregistrer les préférences.");
    if (response.ok) {
      setPushEnabled(wantsPush);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="dtsc-card p-6">
          <div className="flex items-center gap-3">
            <UserCog className="h-5 w-5 text-cyan-500" />
            <div>
              <h2 className="font-black text-dtsc-ink">Identité professionnelle</h2>
              <p className="text-sm text-dtsc-muted">Informations utilisées par DTSC pour qualifier vos demandes.</p>
            </div>
          </div>
          <form onSubmit={updateProfile} className="mt-5 grid gap-4 md:grid-cols-2">
            <Input name="name" defaultValue={user.name} placeholder="Nom complet" required />
            <Input name="email" defaultValue={user.email} disabled className="opacity-70" />
            <Input name="companyName" defaultValue={user.companyName || ""} placeholder="Entreprise" />
            <Input name="phone" defaultValue={user.phone || ""} placeholder="Téléphone" />
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                <Save className="h-4 w-4" />
                Enregistrer le profil
              </Button>
              {profileMessage && <p className="text-sm font-semibold text-dtsc-blue">{profileMessage}</p>}
            </div>
          </form>
        </section>

        <section className="dtsc-card p-6">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-cyan-500" />
            <div>
              <h2 className="font-black text-dtsc-ink">Sécurité du compte</h2>
              <p className="text-sm text-dtsc-muted">Changez le mot de passe après réception du compte admin par défaut.</p>
            </div>
          </div>
          <form onSubmit={updatePassword} className="mt-5 grid gap-4 md:grid-cols-2">
            <PasswordInput name="currentPassword" placeholder="Mot de passe actuel" autoComplete="current-password" required />
            <PasswordInput name="newPassword" placeholder="Nouveau mot de passe sécurisé" autoComplete="new-password" required />
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                Mettre à jour le mot de passe
              </Button>
              {passwordMessage && <p className="text-sm font-semibold text-dtsc-blue">{passwordMessage}</p>}
            </div>
          </form>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="dtsc-card p-6">
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 text-cyan-500" />
            <div>
              <h2 className="font-black text-dtsc-ink">Apparence</h2>
              <p className="text-sm text-dtsc-muted">Mode clair, sombre ou système.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {[
              { value: "light", label: "Clair", icon: Sun },
              { value: "dark", label: "Sombre", icon: Moon },
              { value: "system", label: "Système", icon: Monitor },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-left text-sm font-bold text-dtsc-ink transition hover:border-cyan-300"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-cyan-500" />
                  {label}
                </span>
                {mounted && theme === value && <span className="text-xs text-dtsc-blue">Actif</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="dtsc-card p-6">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-cyan-500" />
            <div>
              <h2 className="font-black text-dtsc-ink">Notifications</h2>
              <p className="text-sm text-dtsc-muted">Alertes applicatives, usage IA et notifications visibles en PWA.</p>
            </div>
          </div>
          <form onSubmit={updatePreferences} className="mt-5 space-y-3 text-sm text-dtsc-muted">
            <label className="grid gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
              <span className="font-bold text-dtsc-ink">Modèle LLM préféré</span>
              <select
                name="preferredModel"
                defaultValue={user.preferredModel || ""}
                className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink outline-none focus:border-cyan-400"
              >
                <option value="">Modèle par défaut DTSC</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
              Tickets support
              <input name="notifySupportEnabled" type="checkbox" defaultChecked={user.notifySupportEnabled ?? true} className="h-4 w-4 accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
              Résumés d&apos;usage IA
              <input name="notifyUsageEnabled" type="checkbox" defaultChecked={user.notifyUsageEnabled ?? true} className="h-4 w-4 accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
              Diffusions DTSC
              <input name="notifyBroadcastEnabled" type="checkbox" defaultChecked={user.notifyBroadcastEnabled ?? true} className="h-4 w-4 accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
              <span>
                <span className="block font-bold text-dtsc-ink">Notifications téléphone/PWA</span>
                <span className="text-xs">Affiche une alerte visible pendant votre session connectée.</span>
              </span>
              <input
                name="pushNotificationsEnabled"
                type="checkbox"
                checked={pushEnabled}
                onChange={(event) => setPushEnabled(event.target.checked)}
                className="h-4 w-4 shrink-0 accent-cyan-500"
              />
            </label>
            <Button variant="outline" className="w-full rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              Enregistrer
            </Button>
            {preferencesMessage && <p className="text-sm font-semibold text-dtsc-blue">{preferencesMessage}</p>}
          </form>
        </section>
      </aside>
    </div>
  );
}
