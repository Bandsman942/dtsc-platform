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
import { fillExperienceTemplate, getExperienceCopy } from "@/lib/experience-i18n";
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
  const copy = getExperienceCopy(user.locale).settings.panel;
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
    setProfileMessage(response.ok ? copy.profileUpdated : copy.profileUpdateFailed);
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
    setPasswordMessage(response.ok ? copy.passwordUpdated : copy.passwordUpdateFailed);
    if (response.ok) form.reset();
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
          setPreferencesMessage(copy.pushNotEnabled);
        }
      } catch {
        wantsPush = false;
        setPushEnabled(false);
        setPreferencesMessage(copy.pushUnavailable);
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
        setPreferencesMessage(body?.error || copy.preferencesSaveFailed);
        return;
      }
      setPushEnabled(wantsPush);
      setPreferencesMessage(copy.preferencesSaved);
      router.refresh();
    } catch {
      setPreferencesMessage(copy.unstableConnection);
    }
  }

  const startPages = [
    ["/dashboard", copy.dashboard],
    ["/chat", copy.chatbot],
    ["/billing", copy.subscription],
    ["/company", copy.company],
    ...(canUseInternalCalendar ? [["/calendar", copy.internalCalendar]] : []),
    ["/collaborators", copy.collaborators],
    ["/activities", copy.dtscActivities],
    ["/support", copy.support],
    ["/notifications", copy.notifications],
    ["/announcements", copy.announcements],
    ["/profile", copy.profile],
    ["/settings", copy.settings],
  ] as Array<[string, string]>;

  const callToggles = [
    ["callSoundsEnabled", copy.callSounds, copy.callSoundsDescription, user.callSoundsEnabled ?? true],
    ["callNotificationsEnabled", copy.callNotifications, copy.callNotificationsDescription, user.callNotificationsEnabled ?? true],
    ["floatingCallAlertsEnabled", copy.floatingCallAlerts, copy.floatingCallAlertsDescription, user.floatingCallAlertsEnabled ?? true],
    ["participantEventAlertsEnabled", copy.participantEvents, copy.participantEventsDescription, user.participantEventAlertsEnabled ?? true],
    ["callAlertSoundEnabled", copy.floatingAlertSound, copy.floatingAlertSoundDescription, user.callAlertSoundEnabled ?? true],
    ["incomingCallBannerEnabled", copy.incomingCallBanner, copy.incomingCallBannerDescription, user.incomingCallBannerEnabled ?? true],
    ["connectionIssueSoundsEnabled", copy.connectionIssueSound, copy.connectionIssueSoundDescription, user.connectionIssueSoundsEnabled ?? true],
    ["startMutedByDefault", copy.startMuted, copy.startMutedDescription, user.startMutedByDefault ?? false],
    ["startCameraOffByDefault", copy.startCameraOff, copy.startCameraOffDescription, user.startCameraOffByDefault ?? true],
  ] as const;

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="min-w-0 space-y-6">
        <section className="dtsc-card min-w-0 p-6">
          <SettingsSectionHeader id="profile" icon={UserCog} title={copy.professionalIdentity} description={copy.professionalIdentityDescription} openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "profile" ? "block" : "hidden", "md:block")}>
            <div className="mt-5 min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <p className="break-words font-black text-dtsc-ink">{user.name}</p>
              <p className="mt-1 break-words text-sm text-dtsc-muted" data-email-value>{user.email}</p>
              <p className="mt-2 break-words text-sm font-semibold text-dtsc-muted">{user.companyName || copy.companyMissing} · {user.phone || copy.phoneMissing}</p>
              <Button type="button" onClick={() => setProfileDialogOpen(true)} className="mt-4 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                <UserCog className="h-4 w-4" />
                {copy.editIdentity}
              </Button>
              {profileMessage && <p className="mt-3 text-sm font-semibold text-dtsc-blue" role="status">{profileMessage}</p>}
            </div>
          </div>
        </section>

        <section className="dtsc-card min-w-0 p-6">
          <SettingsSectionHeader id="security" icon={Lock} title={copy.accountSecurity} description={copy.accountSecurityDescription} openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "security" ? "block" : "hidden", "md:block")}>
            <form onSubmit={updatePassword} className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              <PasswordInput name="currentPassword" placeholder={copy.currentPassword} autoComplete="current-password" required />
              <PasswordInput name="newPassword" placeholder={copy.newPassword} autoComplete="new-password" required />
              <div className="md:col-span-2 flex min-w-0 flex-wrap items-center gap-3">
                <Button variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                  {copy.updatePassword}
                </Button>
                {passwordMessage && <p className="text-sm font-semibold text-dtsc-blue" role="status">{passwordMessage}</p>}
              </div>
            </form>
          </div>
        </section>

        <section className="dtsc-card min-w-0 p-6">
          <SettingsSectionHeader id="preferences" icon={SlidersHorizontal} title={copy.privatePreferences} description={copy.privatePreferencesDescription} openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "preferences" ? "block" : "hidden", "md:block")}>
            <SettingsDialogCard title={copy.privatePreferences} description={copy.privatePreferencesDialogDescription} buttonLabel={copy.configurePreferences}>
              <form id="account-preferences-form" onSubmit={updatePreferences} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
                <input type="hidden" name="preferredModel" value={user.preferredModel || ""} />
                {user.notifySupportEnabled ?? true ? <input type="hidden" name="notifySupportEnabled" value="on" /> : null}
                {user.notifyUsageEnabled ?? true ? <input type="hidden" name="notifyUsageEnabled" value="on" /> : null}
                {user.notifyBroadcastEnabled ?? true ? <input type="hidden" name="notifyBroadcastEnabled" value="on" /> : null}
                {user.pushNotificationsEnabled ? <input type="hidden" name="pushNotificationsEnabled" value="on" /> : null}
                <CallPreferenceHiddenFields user={user} />
                <Field label={copy.pageAfterSignIn} icon={LayoutDashboard}>
                  <select name="startPage" defaultValue={startPageValue} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    {startPages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label={copy.interfaceDensity} icon={Monitor}>
                  <select name="interfaceDensity" defaultValue={user.interfaceDensity || "COMFORTABLE"} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="COMFORTABLE">{copy.comfortable}</option>
                    <option value="COMPACT">{copy.compact}</option>
                  </select>
                </Field>
                <Field label={copy.language} icon={Globe2}>
                  <select name="locale" defaultValue={user.locale || "fr"} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </Field>
                <Field label={copy.timezone} icon={Globe2}>
                  <select name="timezone" defaultValue={user.timezone || "Africa/Kinshasa"} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="Africa/Kinshasa">Kinshasa</option>
                    <option value="Africa/Lubumbashi">Lubumbashi</option>
                    <option value="Africa/Lagos">Lagos</option>
                    <option value="Africa/Johannesburg">Johannesburg</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="UTC">UTC</option>
                  </select>
                </Field>
                <Field label={copy.dateFormat} icon={Globe2}>
                  <select name="dateFormat" defaultValue={user.dateFormat || "FR"} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="FR">JJ/MM/AAAA</option>
                    <option value="US">MM/DD/YYYY · 12h AM/PM</option>
                    <option value="LONG">{copy.longDate}</option>
                    <option value="ISO">YYYY-MM-DD</option>
                  </select>
                </Field>
                <Field label={copy.emailDigest} icon={Bell}>
                  <select name="emailDigestFrequency" defaultValue={user.emailDigestFrequency || "WEEKLY"} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="NEVER">{copy.never}</option>
                    <option value="DAILY">{copy.daily}</option>
                    <option value="WEEKLY">{copy.weekly}</option>
                    <option value="MONTHLY">{copy.monthly}</option>
                  </select>
                </Field>
                <Field label={copy.aiResponseStyle} icon={Bot}>
                  <select name="chatResponseStyle" defaultValue={user.chatResponseStyle || "PROFESSIONAL"} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="PROFESSIONAL">{copy.professional}</option>
                    <option value="DIRECT">{copy.direct}</option>
                    <option value="DETAILED">{copy.educational}</option>
                    <option value="EXECUTIVE">{copy.executive}</option>
                  </select>
                </Field>
                <Field label={copy.aiResponseLength} icon={Bot}>
                  <select name="chatResponseLength" defaultValue={user.chatResponseLength || "BALANCED"} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    <option value="SHORT">{copy.short}</option>
                    <option value="BALANCED">{copy.balanced}</option>
                    <option value="DETAILED">{copy.detailed}</option>
                  </select>
                </Field>
                <div className="md:col-span-2 flex min-w-0 flex-wrap items-center gap-3">
                  <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                    <Save className="h-4 w-4" />
                    {copy.savePreferences}
                  </Button>
                  {preferencesMessage && <p className="text-sm font-semibold text-dtsc-blue" role="status">{preferencesMessage}</p>}
                </div>
              </form>
            </SettingsDialogCard>
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-6">
        <section className="dtsc-card min-w-0 p-6">
          <SettingsSectionHeader id="appearance" icon={Monitor} title={copy.appearance} description={copy.appearanceDescription} openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "appearance" ? "block" : "hidden", "md:block")}>
            <SettingsDialogCard title={copy.appearance} description={copy.appearanceDialogDescription} buttonLabel={copy.configureAppearance}>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                {[
                  { value: "light", label: copy.light, icon: Sun },
                  { value: "dark", label: copy.dark, icon: Moon },
                  { value: "system", label: copy.system, icon: Monitor },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className="flex min-h-11 min-w-0 items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-left text-sm font-bold text-dtsc-ink transition-all hover:border-cyan-300 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:scale-[0.99]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-cyan-500" />
                      <span className="break-words">{label}</span>
                    </span>
                    {mounted && theme === value && <span className="shrink-0 text-xs text-dtsc-blue">{copy.activeTheme}</span>}
                  </button>
                ))}
              </div>
            </SettingsDialogCard>
          </div>
        </section>

        <section className="dtsc-card min-w-0 p-6">
          <SettingsSectionHeader id="notifications" icon={Bell} title={copy.notifications} description={copy.notificationsDescription} openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "notifications" ? "block" : "hidden", "md:block")}>
            <SettingsDialogCard title={copy.notifications} description={copy.notificationsDialogDescription} buttonLabel={copy.configureNotifications}>
              <form onSubmit={updatePreferences} className="min-w-0 space-y-3 text-sm text-dtsc-muted">
                <GeneralPreferenceHiddenFields user={user} />
                <CallPreferenceHiddenFields user={user} />
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
                  <span className="font-bold text-dtsc-ink">{copy.preferredModel}</span>
                  <select name="preferredModel" defaultValue={user.preferredModel || ""} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink outline-none focus:border-cyan-400">
                    <option value="">{copy.defaultModel}</option>
                    {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </label>
                <PreferenceToggle name="notifySupportEnabled" label={copy.supportTickets} checked={user.notifySupportEnabled ?? true} />
                <PreferenceToggle name="notifyUsageEnabled" label={copy.aiUsageSummaries} checked={user.notifyUsageEnabled ?? true} />
                <PreferenceToggle name="notifyBroadcastEnabled" label={copy.dtscBroadcasts} checked={user.notifyBroadcastEnabled ?? true} />
                <label className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
                  <span className="min-w-0">
                    <span className="block break-words font-bold text-dtsc-ink">{copy.phoneNotifications}</span>
                    <span className="mt-1 block break-words text-xs">{copy.phoneNotificationsDescription}</span>
                  </span>
                  <input name="pushNotificationsEnabled" type="checkbox" checked={pushEnabled} onChange={(event) => setPushEnabled(event.target.checked)} className="h-4 w-4 shrink-0 accent-cyan-500" />
                </label>
                <Button variant="outline" className="w-full rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">{copy.save}</Button>
                {preferencesMessage && <p className="text-sm font-semibold text-dtsc-blue" role="status">{preferencesMessage}</p>}
              </form>
            </SettingsDialogCard>
          </div>
        </section>

        <section className="dtsc-card min-w-0 p-6">
          <SettingsSectionHeader id="calls" icon={PhoneCall} title={copy.callSettings} description={copy.callSettingsDescription} openId={openMobileSection} onToggle={setOpenMobileSection} />
          <div className={cn(openMobileSection === "calls" ? "block" : "hidden", "md:block")}>
            <SettingsDialogCard title={copy.callSettings} description={copy.callSettingsDialogDescription} buttonLabel={copy.configureCalls}>
              <form onSubmit={updatePreferences} className="min-w-0 space-y-3 text-sm text-dtsc-muted">
                <GeneralPreferenceHiddenFields user={user} includeNotificationFlags />
                {pushEnabled ? <input type="hidden" name="pushNotificationsEnabled" value="on" /> : null}
                {callToggles.map(([name, label, description, checked]) => (
                  <CallToggle key={name} name={name} label={label} description={description} checked={checked} />
                ))}
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2 font-bold text-dtsc-ink"><Volume2 className="h-4 w-4 shrink-0 text-cyan-500" /> <span className="break-words">{copy.soundVolume}</span></span>
                  <input name="callSoundVolume" type="range" min={0} max={100} defaultValue={user.callSoundVolume ?? 45} className="accent-cyan-500" />
                </label>
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
                  <span className="font-bold text-dtsc-ink">{copy.floatingAlertDuration}</span>
                  <select name="callAlertDisplayDuration" defaultValue={user.callAlertDisplayDuration || 6000} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                    {[3500, 6000, 9000, 12000].map((value) => (
                      <option key={value} value={value}>{fillExperienceTemplate(copy.seconds, { value: value / 1000 })}</option>
                    ))}
                  </select>
                </label>
                <input type="hidden" name="preferredAudioInputId" value={user.preferredAudioInputId || ""} />
                <input type="hidden" name="preferredVideoInputId" value={user.preferredVideoInputId || ""} />
                <input type="hidden" name="preferredAudioOutputId" value={user.preferredAudioOutputId || ""} />
                <Button variant="outline" className="w-full rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">{copy.saveCallSettings}</Button>
                {preferencesMessage && <p className="text-sm font-semibold text-dtsc-blue" role="status">{preferencesMessage}</p>}
              </form>
            </SettingsDialogCard>
          </div>
        </section>
      </aside>

      <Dialog open={profileDialogOpen} title={copy.professionalIdentity} description={copy.identityDialogDescription} onClose={() => setProfileDialogOpen(false)} className="h-[92dvh] max-w-4xl">
        <form onSubmit={updateProfile} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <FormField label={copy.fullName} hint={copy.fullNameHint}>
            <Input name="name" defaultValue={user.name} placeholder={copy.fullName} required />
          </FormField>
          <FormField label={copy.accountEmail} hint={copy.accountEmailHint}>
            <Input name="email" defaultValue={user.email} disabled className="opacity-70" />
          </FormField>
          <FormField label={copy.company} hint={copy.companyHint}>
            <Input name="companyName" defaultValue={user.companyName || ""} placeholder={copy.company} />
          </FormField>
          <FormField label={copy.phone} hint={copy.phoneHint}>
            <Input name="phone" defaultValue={user.phone || ""} placeholder={copy.phone} />
          </FormField>
          <div className="md:col-span-2 flex min-w-0 flex-wrap items-center gap-3">
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Save className="h-4 w-4" />
              {copy.saveProfile}
            </Button>
            {profileMessage && <p className="text-sm font-semibold text-dtsc-blue" role="status">{profileMessage}</p>}
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function GeneralPreferenceHiddenFields({ user, includeNotificationFlags = false }: { user: SettingsUser; includeNotificationFlags?: boolean }) {
  return (
    <>
      <input type="hidden" name="interfaceDensity" value={user.interfaceDensity || "COMFORTABLE"} />
      <input type="hidden" name="startPage" value={user.startPage || "/dashboard"} />
      <input type="hidden" name="locale" value={user.locale || "fr"} />
      <input type="hidden" name="timezone" value={user.timezone || "Africa/Kinshasa"} />
      <input type="hidden" name="dateFormat" value={user.dateFormat || "FR"} />
      <input type="hidden" name="emailDigestFrequency" value={user.emailDigestFrequency || "WEEKLY"} />
      <input type="hidden" name="chatResponseStyle" value={user.chatResponseStyle || "PROFESSIONAL"} />
      <input type="hidden" name="chatResponseLength" value={user.chatResponseLength || "BALANCED"} />
      {includeNotificationFlags ? (
        <>
          <input type="hidden" name="preferredModel" value={user.preferredModel || ""} />
          {user.notifySupportEnabled ?? true ? <input type="hidden" name="notifySupportEnabled" value="on" /> : null}
          {user.notifyUsageEnabled ?? true ? <input type="hidden" name="notifyUsageEnabled" value="on" /> : null}
          {user.notifyBroadcastEnabled ?? true ? <input type="hidden" name="notifyBroadcastEnabled" value="on" /> : null}
        </>
      ) : null}
    </>
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
      <div className="mt-5 min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <p className="break-words text-sm font-semibold leading-6 text-dtsc-muted">{description}</p>
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

function PreferenceToggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
      <span className="min-w-0 break-words font-semibold text-dtsc-ink">{label}</span>
      <input name={name} type="checkbox" defaultChecked={checked} className="h-4 w-4 shrink-0 accent-cyan-500" />
    </label>
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
    <label className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3">
      <span className="min-w-0">
        <span className="block break-words font-bold text-dtsc-ink">{label}</span>
        <span className="mt-1 block break-words text-xs">{description}</span>
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
    <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-cyan-500" />
        <span className="break-words">{label}</span>
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
      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 md:pointer-events-none"
      aria-expanded={open}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-cyan-500" />
        <span className="min-w-0">
          <span className="block break-words font-black text-dtsc-ink">{title}</span>
          <span className="mt-1 block break-words text-sm text-dtsc-muted">{description}</span>
        </span>
      </span>
      <ChevronDown className={cn("h-5 w-5 shrink-0 text-dtsc-muted transition md:hidden", open && "rotate-180")} />
    </button>
  );
}
