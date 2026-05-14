"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, Bot, Globe2, LayoutDashboard, Lock, Monitor, Moon, Save, SlidersHorizontal, Sun, UserCog, type LucideIcon } from "lucide-react";
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
    interfaceDensity?: string | null;
    startPage?: string | null;
    locale?: string | null;
    timezone?: string | null;
    dateFormat?: string | null;
    emailDigestFrequency?: string | null;
    chatResponseStyle?: string | null;
    chatResponseLength?: string | null;
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
  useEffect(() => setPushEnabled(Boolean(user.pushNotificationsEnabled)), [user.pushNotificationsEnabled]);

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
      interfaceDensity: String(formData.get("interfaceDensity") || "COMFORTABLE"),
      startPage: String(formData.get("startPage") || "/dashboard"),
      locale: String(formData.get("locale") || "fr"),
      timezone: String(formData.get("timezone") || "Africa/Kinshasa"),
      dateFormat: String(formData.get("dateFormat") || "FR"),
      emailDigestFrequency: String(formData.get("emailDigestFrequency") || "WEEKLY"),
      chatResponseStyle: String(formData.get("chatResponseStyle") || "PROFESSIONAL"),
      chatResponseLength: String(formData.get("chatResponseLength") || "BALANCED"),
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

        <section className="dtsc-card p-6">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-5 w-5 text-cyan-500" />
            <div>
              <h2 className="font-black text-dtsc-ink">Préférences privées</h2>
              <p className="text-sm text-dtsc-muted">Réglages persistés sur votre compte pour personnaliser votre espace.</p>
            </div>
          </div>
          <form id="account-preferences-form" onSubmit={updatePreferences} className="mt-5 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="preferredModel" value={user.preferredModel || ""} />
            {user.notifySupportEnabled ?? true ? <input type="hidden" name="notifySupportEnabled" value="on" /> : null}
            {user.notifyUsageEnabled ?? true ? <input type="hidden" name="notifyUsageEnabled" value="on" /> : null}
            {user.notifyBroadcastEnabled ?? true ? <input type="hidden" name="notifyBroadcastEnabled" value="on" /> : null}
            {user.pushNotificationsEnabled ? <input type="hidden" name="pushNotificationsEnabled" value="on" /> : null}
            <Field label="Page après connexion" icon={LayoutDashboard}>
              <select name="startPage" defaultValue={user.startPage || "/dashboard"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="/dashboard">Dashboard</option>
                <option value="/chat">Chatbot</option>
                <option value="/billing">Abonnement</option>
                <option value="/company">Entreprise</option>
                <option value="/activities">Activités DTSC</option>
                <option value="/support">Support</option>
                <option value="/notifications">Notifications</option>
                <option value="/announcements">Annonces</option>
                <option value="/profile">Profil</option>
                <option value="/settings">Paramètres</option>
              </select>
            </Field>
            <Field label="Densité interface" icon={Monitor}>
              <select name="interfaceDensity" defaultValue={user.interfaceDensity || "COMFORTABLE"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="COMFORTABLE">Confortable</option>
                <option value="COMPACT">Compacte</option>
              </select>
            </Field>
            <Field label="Langue" icon={Globe2}>
              <select name="locale" defaultValue={user.locale || "fr"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="Fuseau horaire" icon={Globe2}>
              <select name="timezone" defaultValue={user.timezone || "Africa/Kinshasa"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="Africa/Kinshasa">Kinshasa</option>
                <option value="Africa/Lubumbashi">Lubumbashi</option>
                <option value="Africa/Lagos">Lagos</option>
                <option value="Africa/Johannesburg">Johannesburg</option>
                <option value="Europe/Paris">Paris</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
            <Field label="Format de date" icon={Globe2}>
              <select name="dateFormat" defaultValue={user.dateFormat || "FR"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="FR">JJ/MM/AAAA</option>
                <option value="LONG">Date longue</option>
                <option value="ISO">AAAA-MM-JJ</option>
              </select>
            </Field>
            <Field label="Synthèse email" icon={Bell}>
              <select name="emailDigestFrequency" defaultValue={user.emailDigestFrequency || "WEEKLY"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="NEVER">Jamais</option>
                <option value="DAILY">Quotidienne</option>
                <option value="WEEKLY">Hebdomadaire</option>
                <option value="MONTHLY">Mensuelle</option>
              </select>
            </Field>
            <Field label="Style de réponse IA" icon={Bot}>
              <select name="chatResponseStyle" defaultValue={user.chatResponseStyle || "PROFESSIONAL"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="PROFESSIONAL">Professionnel</option>
                <option value="DIRECT">Direct</option>
                <option value="DETAILED">Pédagogique</option>
                <option value="EXECUTIVE">Comité de direction</option>
              </select>
            </Field>
            <Field label="Longueur réponse IA" icon={Bot}>
              <select name="chatResponseLength" defaultValue={user.chatResponseLength || "BALANCED"} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="SHORT">Courte</option>
                <option value="BALANCED">Équilibrée</option>
                <option value="DETAILED">Détaillée</option>
              </select>
            </Field>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                <Save className="h-4 w-4" />
                Enregistrer les préférences
              </Button>
              {preferencesMessage && <p className="text-sm font-semibold text-dtsc-blue">{preferencesMessage}</p>}
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
            <input type="hidden" name="interfaceDensity" value={user.interfaceDensity || "COMFORTABLE"} />
            <input type="hidden" name="startPage" value={user.startPage || "/dashboard"} />
            <input type="hidden" name="locale" value={user.locale || "fr"} />
            <input type="hidden" name="timezone" value={user.timezone || "Africa/Kinshasa"} />
            <input type="hidden" name="dateFormat" value={user.dateFormat || "FR"} />
            <input type="hidden" name="emailDigestFrequency" value={user.emailDigestFrequency || "WEEKLY"} />
            <input type="hidden" name="chatResponseStyle" value={user.chatResponseStyle || "PROFESSIONAL"} />
            <input type="hidden" name="chatResponseLength" value={user.chatResponseLength || "BALANCED"} />
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

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-500" />
        {label}
      </span>
      {children}
    </label>
  );
}
