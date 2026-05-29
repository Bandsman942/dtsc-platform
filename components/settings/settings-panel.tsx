"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, Bot, ChevronDown, Globe2, LayoutDashboard, Lock, Monitor, Moon, PhoneCall, Save, SlidersHorizontal, Sun, UserCog, Volume2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";

type SettingsUser = {
  name: string;
  email: string;
  role: string;
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
  callSoundsEnabled?: boolean;
  callNotificationsEnabled?: boolean;
  floatingCallAlertsEnabled?: boolean;
  participantEventAlertsEnabled?: boolean;
  callAlertSoundEnabled?: boolean;
  incomingCallBannerEnabled?: boolean;
  connectionIssueSoundsEnabled?: boolean;
  startMutedByDefault?: boolean;
  startCameraOffByDefault?: boolean;
  callSoundVolume?: number | null;
  callAlertDisplayDuration?: number | null;
  preferredAudioInputId?: string | null;
  preferredVideoInputId?: string | null;
  preferredAudioOutputId?: string | null;
  emailDigestFrequency?: string | null;
  chatResponseStyle?: string | null;
  chatResponseLength?: string | null;
};

export function SettingsPanel({
  user,
  models,
}: {
  user: SettingsUser;
  models: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [preferencesMessage, setPreferencesMessage] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(Boolean(user.pushNotificationsEnabled));
  const [openMobileSection, setOpenMobileSection] = useState("profile");
  const canUseInternalCalendar = user.role !== "CLIENT";
  const startPageValue = !canUseInternalCalendar && user.startPage === "/calendar" ? "/dashboard" : user.startPage || "/dashboard";

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
      setProfileDialogOpen(false);
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
    let wantsPush = formData.get("pushNotificationsEnabled") === "on";

    if (wantsPush && typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted") {
      try {
        const permission = typeof Notification.requestPermission === "function"
          ? await Notification.requestPermission()
          : "denied";
        if (permission !== "granted") {
          wantsPush = false;
          setPushEnabled(false);
          setPreferencesMessage("Notifications téléphone non activées. Les autres préférences sont enregistrées.");
        }
      } catch {
        wantsPush = false;
        setPushEnabled(false);
        setPreferencesMessage("Notifications téléphone indisponibles sur cet appareil. Les autres préférences sont enregistrées.");
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
      callSoundsEnabled: formData.get("callSoundsEnabled") === "on",
      callNotificationsEnabled: formData.get("callNotificationsEnabled") === "on",
      floatingCallAlertsEnabled: formData.get("floatingCallAlertsEnabled") === "on",
      participantEventAlertsEnabled: formData.get("participantEventAlertsEnabled") === "on",
      callAlertSoundEnabled: formData.get("callAlertSoundEnabled") === "on",
      incomingCallBannerEnabled: formData.get("incomingCallBannerEnabled") === "on",
      connectionIssueSoundsEnabled: formData.get("connectionIssueSoundsEnabled") === "on",
      startMutedByDefault: formData.get("startMutedByDefault") === "on",
      startCameraOffByDefault: formData.get("startCameraOffByDefault") === "on",
      callSoundVolume: Number(formData.get("callSoundVolume") || user.callSoundVolume || 45),
      callAlertDisplayDuration: Number(formData.get("callAlertDisplayDuration") || user.callAlertDisplayDuration || 6000),
      preferredAudioInputId: String(formData.get("preferredAudioInputId") || ""),
      preferredVideoInputId: String(formData.get("preferredVideoInputId") || ""),
      preferredAudioOutputId: String(formData.get("preferredAudioOutputId") || ""),
      emailDigestFrequency: String(formData.get("emailDigestFrequency") || "WEEKLY"),
      chatResponseStyle: String(formData.get("chatResponseStyle") || "PROFESSIONAL"),
      chatResponseLength: String(formData.get("chatResponseLength") || "BALANCED"),
    };
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setPreferencesMessage(body?.error || "Impossible d'enregistrer les préférences.");
        return;
      }
      setPushEnabled(wantsPush);
      setPreferencesMessage("Préférences enregistrées.");
      router.refresh();
    } catch {
      setPreferencesMessage("Connexion instable. Réessayez l'enregistrement des préférences.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="dtsc-card p-6">
          <SettingsSectionHeader id="profile" icon={UserCog} title="Identité professionnelle" description="Informations utilisées par DTSC pour qualifier vos demandes." openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "profile" ? "block" : "hidden", "md:block")}>
          <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <p className="font-black text-dtsc-ink">{user.name}</p>
            <p className="mt-1 text-sm text-dtsc-muted">{user.email}</p>
            <p className="mt-2 text-sm font-semibold text-dtsc-muted">{user.companyName || "Entreprise non renseignée"} · {user.phone || "Téléphone non renseigné"}</p>
            <Button type="button" onClick={() => setProfileDialogOpen(true)} className="mt-4 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <UserCog className="h-4 w-4" />
              Modifier l&apos;identité
            </Button>
            {profileMessage && <p className="mt-3 text-sm font-semibold text-dtsc-blue">{profileMessage}</p>}
          </div>
          </div>
        </section>

        <section className="dtsc-card p-6">
          <SettingsSectionHeader id="security" icon={Lock} title="Sécurité du compte" description="Changez le mot de passe après réception du compte admin par défaut." openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "security" ? "block" : "hidden", "md:block")}>
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
          </div>
        </section>

        <section className="dtsc-card p-6">
          <SettingsSectionHeader id="preferences" icon={SlidersHorizontal} title="Préférences privées" description="Réglages persistés sur votre compte pour personnaliser votre espace." openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "preferences" ? "block" : "hidden", "md:block")}>
          <SettingsDialogCard title="Préférences privées" description="Ouvrir les préférences privées en plein écran pour modifier la page d'accueil, la langue, les dates et le style IA." buttonLabel="Configurer les préférences">
          <form id="account-preferences-form" onSubmit={updatePreferences} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="preferredModel" value={user.preferredModel || ""} />
            {user.notifySupportEnabled ?? true ? <input type="hidden" name="notifySupportEnabled" value="on" /> : null}
            {user.notifyUsageEnabled ?? true ? <input type="hidden" name="notifyUsageEnabled" value="on" /> : null}
            {user.notifyBroadcastEnabled ?? true ? <input type="hidden" name="notifyBroadcastEnabled" value="on" /> : null}
            {user.pushNotificationsEnabled ? <input type="hidden" name="pushNotificationsEnabled" value="on" /> : null}
            <CallPreferenceHiddenFields user={user} />
            <Field label="Page après connexion" icon={LayoutDashboard}>
              <select name="startPage" defaultValue={startPageValue} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="/dashboard">Dashboard</option>
                <option value="/chat">Chatbot</option>
                <option value="/billing">Abonnement</option>
                <option value="/company">Entreprise</option>
                {canUseInternalCalendar && <option value="/calendar">Calendrier interne</option>}
                <option value="/collaborators">Mes collaborateurs</option>
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
                <option value="US">MM/DD/YYYY · 12h AM/PM</option>
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
          </SettingsDialogCard>
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="dtsc-card p-6">
          <SettingsSectionHeader id="appearance" icon={Monitor} title="Apparence" description="Mode clair, sombre ou système." openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "appearance" ? "block" : "hidden", "md:block")}>
          <SettingsDialogCard title="Apparence" description="Choisissez le thème clair, sombre ou système dans une vue dédiée." buttonLabel="Configurer l'apparence">
          <div className="grid gap-2">
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
          </SettingsDialogCard>
          </div>
        </section>

        <section className="dtsc-card p-6">
          <SettingsSectionHeader id="notifications" icon={Bell} title="Notifications" description="Alertes applicatives, usage IA et notifications visibles en PWA." openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "notifications" ? "block" : "hidden", "md:block")}>
          <SettingsDialogCard title="Notifications" description="Configurez les alertes support, IA, diffusions DTSC et notifications PWA." buttonLabel="Configurer les notifications">
          <form onSubmit={updatePreferences} className="space-y-3 text-sm text-dtsc-muted">
            <input type="hidden" name="interfaceDensity" value={user.interfaceDensity || "COMFORTABLE"} />
            <input type="hidden" name="startPage" value={user.startPage || "/dashboard"} />
            <input type="hidden" name="locale" value={user.locale || "fr"} />
            <input type="hidden" name="timezone" value={user.timezone || "Africa/Kinshasa"} />
            <input type="hidden" name="dateFormat" value={user.dateFormat || "FR"} />
            <input type="hidden" name="emailDigestFrequency" value={user.emailDigestFrequency || "WEEKLY"} />
            <input type="hidden" name="chatResponseStyle" value={user.chatResponseStyle || "PROFESSIONAL"} />
            <input type="hidden" name="chatResponseLength" value={user.chatResponseLength || "BALANCED"} />
            <CallPreferenceHiddenFields user={user} />
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
          </SettingsDialogCard>
          </div>
        </section>

        <section className="dtsc-card p-6">
          <SettingsSectionHeader id="calls" icon={PhoneCall} title="Paramètres des appels" description="Sons, alertes flottantes et comportement par défaut des appels DTSC." openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "calls" ? "block" : "hidden", "md:block")}>
          <SettingsDialogCard title="Paramètres des appels" description="Réglez les sons, alertes, comportements par défaut et durées d'affichage des appels." buttonLabel="Configurer les appels">
          <form onSubmit={updatePreferences} className="space-y-3 text-sm text-dtsc-muted">
            <input type="hidden" name="preferredModel" value={user.preferredModel || ""} />
            {user.notifySupportEnabled ?? true ? <input type="hidden" name="notifySupportEnabled" value="on" /> : null}
            {user.notifyUsageEnabled ?? true ? <input type="hidden" name="notifyUsageEnabled" value="on" /> : null}
            {user.notifyBroadcastEnabled ?? true ? <input type="hidden" name="notifyBroadcastEnabled" value="on" /> : null}
            {pushEnabled ? <input type="hidden" name="pushNotificationsEnabled" value="on" /> : null}
            <input type="hidden" name="interfaceDensity" value={user.interfaceDensity || "COMFORTABLE"} />
            <input type="hidden" name="startPage" value={user.startPage || "/dashboard"} />
            <input type="hidden" name="locale" value={user.locale || "fr"} />
            <input type="hidden" name="timezone" value={user.timezone || "Africa/Kinshasa"} />
            <input type="hidden" name="dateFormat" value={user.dateFormat || "FR"} />
            <input type="hidden" name="emailDigestFrequency" value={user.emailDigestFrequency || "WEEKLY"} />
            <input type="hidden" name="chatResponseStyle" value={user.chatResponseStyle || "PROFESSIONAL"} />
            <input type="hidden" name="chatResponseLength" value={user.chatResponseLength || "BALANCED"} />
            <CallToggle name="callSoundsEnabled" label="Sons d'appel" description="Jouer des sons courts lors des événements importants." checked={user.callSoundsEnabled ?? true} />
            <CallToggle name="callNotificationsEnabled" label="Notifications d'appel" description="Afficher les alertes liées aux appels de vos groupes." checked={user.callNotificationsEnabled ?? true} />
            <CallToggle name="floatingCallAlertsEnabled" label="Alertes flottantes d'appel" description="Afficher une carte discrète quand un appel démarre ou se termine." checked={user.floatingCallAlertsEnabled ?? true} />
            <CallToggle name="participantEventAlertsEnabled" label="Entrées et sorties de participants" description="Signaler quand un collaborateur rejoint ou quitte un appel." checked={user.participantEventAlertsEnabled ?? true} />
            <CallToggle name="callAlertSoundEnabled" label="Son avec les alertes flottantes" description="Associer un son discret aux cartes d'appel." checked={user.callAlertSoundEnabled ?? true} />
            <CallToggle name="incomingCallBannerEnabled" label="Bannière d'appel entrant" description="Mettre en avant les appels en cours dans les conversations." checked={user.incomingCallBannerEnabled ?? true} />
            <CallToggle name="connectionIssueSoundsEnabled" label="Son de problème de connexion" description="Prévenir discrètement en cas d'instabilité." checked={user.connectionIssueSoundsEnabled ?? true} />
            <CallToggle name="startMutedByDefault" label="Démarrer avec micro coupé" description="Rejoindre les appels sans transmettre votre micro." checked={user.startMutedByDefault ?? false} />
            <CallToggle name="startCameraOffByDefault" label="Démarrer avec caméra désactivée" description="Rejoindre les appels vidéo avec la caméra coupée." checked={user.startCameraOffByDefault ?? true} />
            <label className="grid gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
              <span className="flex items-center gap-2 font-bold text-dtsc-ink"><Volume2 className="h-4 w-4 text-cyan-500" /> Volume des sons</span>
              <input name="callSoundVolume" type="range" min={0} max={100} defaultValue={user.callSoundVolume ?? 45} className="accent-cyan-500" />
            </label>
            <label className="grid gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
              <span className="font-bold text-dtsc-ink">Durée des alertes flottantes</span>
              <select name="callAlertDisplayDuration" defaultValue={user.callAlertDisplayDuration || 6000} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value={3500}>3,5 secondes</option>
                <option value={6000}>6 secondes</option>
                <option value={9000}>9 secondes</option>
                <option value={12000}>12 secondes</option>
              </select>
            </label>
            <input type="hidden" name="preferredAudioInputId" value={user.preferredAudioInputId || ""} />
            <input type="hidden" name="preferredVideoInputId" value={user.preferredVideoInputId || ""} />
            <input type="hidden" name="preferredAudioOutputId" value={user.preferredAudioOutputId || ""} />
            <Button variant="outline" className="w-full rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              Enregistrer les paramètres d&apos;appel
            </Button>
            {preferencesMessage && <p className="text-sm font-semibold text-dtsc-blue">{preferencesMessage}</p>}
          </form>
          </SettingsDialogCard>
          </div>
        </section>
      </aside>
      <Dialog open={profileDialogOpen} title="Identité professionnelle" description="Ces informations aident DTSC à adapter l'expérience, le support et les échanges à votre contexte." onClose={() => setProfileDialogOpen(false)} className="h-[92dvh] max-w-4xl">
        <form onSubmit={updateProfile} className="grid gap-4 md:grid-cols-2">
          <FormField label="Nom complet" hint="Nom affiché dans votre profil, vos messages et vos demandes.">
            <Input name="name" defaultValue={user.name} placeholder="Nom complet" required />
          </FormField>
          <FormField label="Email du compte" hint="Adresse utilisée pour vous connecter. Elle ne se modifie pas ici.">
            <Input name="email" defaultValue={user.email} disabled className="opacity-70" />
          </FormField>
          <FormField label="Entreprise" hint="Nom de votre entreprise ou organisation principale.">
            <Input name="companyName" defaultValue={user.companyName || ""} placeholder="Entreprise" />
          </FormField>
          <FormField label="Téléphone" hint="Numéro utile pour le support ou les échanges professionnels.">
            <Input name="phone" defaultValue={user.phone || ""} placeholder="Téléphone" />
          </FormField>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Save className="h-4 w-4" />
              Enregistrer le profil
            </Button>
            {profileMessage && <p className="text-sm font-semibold text-dtsc-blue">{profileMessage}</p>}
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function CallPreferenceHiddenFields({ user }: { user: SettingsUser }) {
  return (
    <>
      {user.callSoundsEnabled ?? true ? <input type="hidden" name="callSoundsEnabled" value="on" /> : null}
      {user.callNotificationsEnabled ?? true ? <input type="hidden" name="callNotificationsEnabled" value="on" /> : null}
      {user.floatingCallAlertsEnabled ?? true ? <input type="hidden" name="floatingCallAlertsEnabled" value="on" /> : null}
      {user.participantEventAlertsEnabled ?? true ? <input type="hidden" name="participantEventAlertsEnabled" value="on" /> : null}
      {user.callAlertSoundEnabled ?? true ? <input type="hidden" name="callAlertSoundEnabled" value="on" /> : null}
      {user.incomingCallBannerEnabled ?? true ? <input type="hidden" name="incomingCallBannerEnabled" value="on" /> : null}
      {user.connectionIssueSoundsEnabled ?? true ? <input type="hidden" name="connectionIssueSoundsEnabled" value="on" /> : null}
      {user.startMutedByDefault ? <input type="hidden" name="startMutedByDefault" value="on" /> : null}
      {user.startCameraOffByDefault ?? true ? <input type="hidden" name="startCameraOffByDefault" value="on" /> : null}
      <input type="hidden" name="callSoundVolume" value={user.callSoundVolume ?? 45} />
      <input type="hidden" name="callAlertDisplayDuration" value={user.callAlertDisplayDuration ?? 6000} />
      <input type="hidden" name="preferredAudioInputId" value={user.preferredAudioInputId || ""} />
      <input type="hidden" name="preferredVideoInputId" value={user.preferredVideoInputId || ""} />
      <input type="hidden" name="preferredAudioOutputId" value={user.preferredAudioOutputId || ""} />
    </>
  );
}

function SettingsDialogCard({
  title,
  description,
  buttonLabel,
  children,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <p className="text-sm font-semibold leading-6 text-dtsc-muted">{description}</p>
        <Button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <SlidersHorizontal className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </div>
      <Dialog open={open} title={title} description={description} onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">
        {children}
      </Dialog>
    </>
  );
}

function CallToggle({
  name,
  label,
  description,
  checked,
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
      <span>
        <span className="block font-bold text-dtsc-ink">{label}</span>
        <span className="text-xs">{description}</span>
      </span>
      <input name={name} type="checkbox" defaultChecked={checked} className="h-4 w-4 shrink-0 accent-cyan-500" />
    </label>
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

function SettingsSectionHeader({
  id,
  icon: Icon,
  title,
  description,
  openId,
  onToggle,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  openId: string;
  onToggle: (id: string) => void;
}) {
  const open = openId === id;
  return (
    <button
      type="button"
      onClick={() => onToggle(open ? "" : id)}
      className="flex w-full items-center justify-between gap-3 text-left md:pointer-events-none"
      aria-expanded={open}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-cyan-500" />
        <span className="min-w-0">
          <span className="block font-black text-dtsc-ink">{title}</span>
          <span className="mt-1 block text-sm text-dtsc-muted">{description}</span>
        </span>
      </span>
      <ChevronDown className={cn("h-5 w-5 shrink-0 text-dtsc-muted transition md:hidden", open && "rotate-180")} />
    </button>
  );
}
