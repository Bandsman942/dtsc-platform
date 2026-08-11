"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Eye, EyeOff, Laptop, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { useAppLocale } from "@/components/i18n/locale-provider";
import {
  enableCurrentDevicePush,
  getPushCapabilityState,
  needsAppleHomeScreenGuidance,
  revokeCurrentDevicePush,
  type PushCapabilityState,
} from "@/lib/push/client";
import { SESSION_IDLE_TIMEOUT_OPTIONS, type SessionIdleTimeoutMinutes } from "@/lib/session-config";
import type { PushNotificationContentMode } from "@/lib/session-preference";

const copy = {
  fr: {
    eyebrow: "Sécurité et session",
    title: "Connexion et notifications en arrière-plan",
    description: "Choisissez quand DTSC doit vous déconnecter et comment les notifications apparaissent sur cet appareil lorsque l’application n’est pas au premier plan.",
    timeout: "Déconnexion automatique après",
    timeoutHelp: "DTSC vous déconnectera après cette période sans activité. Une durée plus longue est plus pratique mais augmente le risque sur un appareil partagé.",
    absolute: "Durée absolue",
    absoluteHelp: "Même avec une activité régulière, une réauthentification est requise au plus tard après 30 jours.",
    saved: "Politique de session mise à jour.",
    saveFailed: "Impossible de mettre à jour la politique de session.",
    storageUnavailable: "Le stockage de la préférence est temporairement indisponible. Votre choix précédent reste actif.",
    sessionExpired: "Votre session doit être renouvelée avant de modifier ce réglage.",
    rateLimited: "Trop de modifications rapprochées. Réessayez dans quelques instants.",
    pushTitle: "Notifications en arrière-plan",
    pushHelp: "Recevez les messages et alertes DTSC sur cet appareil même lorsqu’aucune page DTSC n’est ouverte, lorsque votre navigateur le permet.",
    enable: "Activer sur cet appareil",
    renew: "Renouveler l’autorisation",
    disable: "Désactiver sur cet appareil",
    enabled: "Notifications activées sur cet appareil",
    permissionDefault: "Autorisation non encore accordée",
    permissionDenied: "Notifications bloquées par le navigateur",
    permissionGranted: "Autorisation accordée, réception à renouveler",
    unsupported: "Les notifications en arrière-plan ne sont pas disponibles dans ce navigateur",
    configMissing: "Les notifications en arrière-plan ne sont pas encore disponibles pour ce produit",
    configInvalid: "Les notifications en arrière-plan sont momentanément indisponibles. Réessayez plus tard.",
    apple: "Sur iPhone/iPad, ajoutez DTSC Platform à l’écran d’accueil puis ouvrez l’application installée pour activer les notifications si cette option n’est pas disponible dans Safari.",
    pushEnabled: "Notifications en arrière-plan activées.",
    pushDisabled: "Notifications désactivées sur cet appareil.",
    privacyTitle: "Contenu visible sur l’écran système",
    privacyHelp: "Choisissez ce que votre téléphone peut afficher quand DTSC Platform est en arrière-plan ou fermé.",
    privateLabel: "Masquer le contenu",
    privateHelp: "L’écran système indique qu’une notification DTSC est disponible, sans afficher son contenu métier. Recommandé sur un appareil partagé.",
    detailedLabel: "Afficher le détail",
    detailedHelp: "Le titre et le contenu de la notification peuvent apparaître sur l’écran système. À choisir uniquement sur un appareil de confiance.",
    privacySaved: "Préférence d’affichage des notifications enregistrée.",
    privacyFailed: "Impossible d’enregistrer la préférence d’affichage des notifications.",
  },
  en: {
    eyebrow: "Security and session",
    title: "Connection and background notifications",
    description: "Choose when DTSC signs you out and how notifications appear on this device while the app is not in the foreground.",
    timeout: "Automatic sign-out after",
    timeoutHelp: "DTSC signs you out after this period without activity. Longer sessions are convenient but increase risk on shared devices.",
    absolute: "Absolute lifetime",
    absoluteHelp: "Even with regular activity, authentication is required again after at most 30 days.",
    saved: "Session policy updated.",
    saveFailed: "Unable to update the session policy.",
    storageUnavailable: "Preference storage is temporarily unavailable. Your previous choice remains active.",
    sessionExpired: "Your session must be renewed before changing this setting.",
    rateLimited: "Too many changes in a short time. Try again in a few moments.",
    pushTitle: "Background notifications",
    pushHelp: "Receive DTSC messages and alerts on this device even when no DTSC page is open, where your browser supports it.",
    enable: "Enable on this device",
    renew: "Renew permission",
    disable: "Disable on this device",
    enabled: "Notifications enabled on this device",
    permissionDefault: "Permission has not been granted yet",
    permissionDenied: "Notifications are blocked by the browser",
    permissionGranted: "Permission granted, delivery needs renewal",
    unsupported: "Background notifications are not available in this browser",
    configMissing: "Background notifications are not yet available for this product",
    configInvalid: "Background notifications are temporarily unavailable. Try again later.",
    apple: "On iPhone/iPad, add DTSC Platform to the Home Screen and open the installed app before enabling notifications if this option is unavailable in Safari.",
    pushEnabled: "Background notifications enabled.",
    pushDisabled: "Notifications disabled on this device.",
    privacyTitle: "Content shown on the system screen",
    privacyHelp: "Choose what your phone can display when DTSC Platform is in the background or closed.",
    privateLabel: "Hide content",
    privateHelp: "The system screen only indicates that a DTSC notification is available, without showing business content. Recommended on shared devices.",
    detailedLabel: "Show details",
    detailedHelp: "The notification title and content may appear on the system screen. Use this only on a trusted device.",
    privacySaved: "Notification display preference saved.",
    privacyFailed: "Unable to save the notification display preference.",
  },
} as const;

function stateLabel(state: PushCapabilityState, labels: (typeof copy)["fr"] | (typeof copy)["en"]) {
  if (state === "subscribed") return labels.enabled;
  if (state === "permission-denied") return labels.permissionDenied;
  if (state === "permission-granted") return labels.permissionGranted;
  if (state === "configuration-missing") return labels.configMissing;
  if (state === "configuration-invalid") return labels.configInvalid;
  if (state === "unsupported") return labels.unsupported;
  return labels.permissionDefault;
}

export function SessionAndPushSettings({
  initialIdleTimeoutMinutes,
  initialPushNotificationContentMode,
}: {
  initialIdleTimeoutMinutes: number;
  initialPushNotificationContentMode: PushNotificationContentMode;
}) {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const labels = copy[locale];
  const initialTimeout = SESSION_IDLE_TIMEOUT_OPTIONS.some((item) => item.value === initialIdleTimeoutMinutes)
    ? initialIdleTimeoutMinutes as SessionIdleTimeoutMinutes
    : 30;
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<SessionIdleTimeoutMinutes>(initialTimeout);
  const [savingSession, setSavingSession] = useState(false);
  const [pushState, setPushState] = useState<PushCapabilityState>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<PushNotificationContentMode>(initialPushNotificationContentMode);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    void getPushCapabilityState().then(setPushState).catch(() => setPushState("unsupported"));
  }, []);

  const showAppleGuidance = useMemo(() => pushState === "unsupported" && needsAppleHomeScreenGuidance(), [pushState]);
  const canEnablePush = pushState === "permission-default" || pushState === "permission-granted";

  async function updateTimeout(next: SessionIdleTimeoutMinutes) {
    const previous = idleTimeoutMinutes;
    setIdleTimeoutMinutes(next);
    setSavingSession(true);
    setMessage("");

    try {
      const response = await fetch("/api/account/session-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIdleTimeoutMinutes: next }),
      });
      const body = await response.json().catch(() => null) as { code?: string; idleTimeoutMinutes?: number } | null;
      if (!response.ok) {
        const serverValue = SESSION_IDLE_TIMEOUT_OPTIONS.some((item) => item.value === body?.idleTimeoutMinutes)
          ? body?.idleTimeoutMinutes as SessionIdleTimeoutMinutes
          : previous;
        setIdleTimeoutMinutes(serverValue);
        if (response.status === 401 || body?.code === "SESSION_EXPIRED" || body?.code === "SESSION_ABSOLUTE_EXPIRED") {
          setMessage(labels.sessionExpired);
          window.setTimeout(() => window.location.assign("/session-expired"), 350);
          return;
        }
        if (response.status === 429 || body?.code === "SESSION_POLICY_RATE_LIMITED") {
          setMessage(labels.rateLimited);
          return;
        }
        if (body?.code === "SESSION_POLICY_STORAGE_UNAVAILABLE") {
          setMessage(labels.storageUnavailable);
          return;
        }
        setMessage(labels.saveFailed);
        return;
      }
      const persistedValue = SESSION_IDLE_TIMEOUT_OPTIONS.some((item) => item.value === body?.idleTimeoutMinutes)
        ? body?.idleTimeoutMinutes as SessionIdleTimeoutMinutes
        : next;
      setIdleTimeoutMinutes(persistedValue);
      setMessage(labels.saved);
    } catch {
      setIdleTimeoutMinutes(previous);
      setMessage(labels.saveFailed);
    } finally {
      setSavingSession(false);
    }
  }

  async function updatePrivacy(next: PushNotificationContentMode) {
    if (next === privacyMode || privacyBusy) return;
    const previous = privacyMode;
    setPrivacyMode(next);
    setPrivacyBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/notification-privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const body = await response.json().catch(() => null) as { mode?: PushNotificationContentMode; code?: string } | null;
      if (!response.ok) {
        setPrivacyMode(body?.mode === "DETAILED" ? "DETAILED" : previous);
        if (response.status === 401 || body?.code === "SESSION_EXPIRED") {
          setMessage(labels.sessionExpired);
          return;
        }
        if (response.status === 429 || body?.code === "NOTIFICATION_PRIVACY_RATE_LIMITED") {
          setMessage(labels.rateLimited);
          return;
        }
        setMessage(body?.code === "NOTIFICATION_PRIVACY_STORAGE_UNAVAILABLE" ? labels.storageUnavailable : labels.privacyFailed);
        return;
      }
      setPrivacyMode(body?.mode === "DETAILED" ? "DETAILED" : "PRIVATE");
      setMessage(labels.privacySaved);
    } catch {
      setPrivacyMode(previous);
      setMessage(labels.privacyFailed);
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function enablePush() {
    setPushBusy(true);
    setMessage("");
    try {
      const result = await enableCurrentDevicePush();
      setPushState(result.state);
      setMessage(result.ok ? labels.pushEnabled : stateLabel(result.state, labels));
    } catch {
      const nextState = await getPushCapabilityState().catch(() => "unsupported" as const);
      setPushState(nextState);
      setMessage(stateLabel(nextState, labels));
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    setMessage("");
    await revokeCurrentDevicePush();
    setPushState(await getPushCapabilityState().catch(() => "unsupported" as const));
    setPushBusy(false);
    setMessage(labels.pushDisabled);
  }

  const privacyOptions: Array<{ mode: PushNotificationContentMode; label: string; help: string; icon: typeof Eye }> = [
    { mode: "PRIVATE", label: labels.privateLabel, help: labels.privateHelp, icon: EyeOff },
    { mode: "DETAILED", label: labels.detailedLabel, help: labels.detailedHelp, icon: Eye },
  ];

  return (
    <section className="min-w-0 border-y border-dtsc-border bg-dtsc-surface px-4 py-5 sm:rounded-2xl sm:border sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400/12 text-cyan-600"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{labels.eyebrow}</p>
          <h2 className="mt-1 text-xl font-black text-dtsc-ink">{labels.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">{labels.description}</p>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="min-w-0 border-t border-dtsc-border pt-4 lg:border-r lg:border-t-0 lg:pr-5">
          <label className="grid min-w-0 gap-2 text-sm font-black text-dtsc-ink">
            {labels.timeout}
            <select value={idleTimeoutMinutes} disabled={savingSession} onChange={(event) => void updateTimeout(Number(event.target.value) as SessionIdleTimeoutMinutes)} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-base text-dtsc-ink sm:text-sm">
              {SESSION_IDLE_TIMEOUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{locale === "en" ? option.labelEn : option.labelFr}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-dtsc-muted">{labels.timeoutHelp}</p>
          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-dtsc-muted"><Laptop className="mt-0.5 h-4 w-4 shrink-0" /><span><strong className="text-dtsc-ink">{labels.absolute} :</strong> {labels.absoluteHelp}</span></div>
        </div>

        <div className="min-w-0 border-t border-dtsc-border pt-4 lg:border-t-0 lg:pl-1">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-dtsc-ink">{labels.pushTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">{labels.pushHelp}</p>
              <p className="mt-3 text-sm font-bold text-dtsc-ink">{stateLabel(pushState, labels)}</p>
              {showAppleGuidance ? <p className="mt-2 text-xs leading-5 text-dtsc-muted">{labels.apple}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {pushState === "subscribed" ? <Button type="button" variant="outline" disabled={pushBusy} onClick={() => void disablePush()} className="rounded-xl border-dtsc-border">{labels.disable}</Button> : canEnablePush ? <Button type="button" disabled={pushBusy} onClick={() => void enablePush()} className="rounded-xl bg-dtsc-blue text-white">{pushState === "permission-granted" ? labels.renew : labels.enable}</Button> : null}
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-dtsc-border pt-4">
            <h3 className="font-black text-dtsc-ink">{labels.privacyTitle}</h3>
            <p className="mt-1 text-sm leading-6 text-dtsc-muted">{labels.privacyHelp}</p>
            <div className="mt-3 grid gap-2">
              {privacyOptions.map((option) => {
                const selected = privacyMode === option.mode;
                const Icon = option.icon;
                return (
                  <button key={option.mode} type="button" disabled={privacyBusy} onClick={() => void updatePrivacy(option.mode)} className={`flex min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-cyan-400 bg-cyan-500/8" : "border-dtsc-border bg-dtsc-page hover:border-cyan-300"}`} aria-pressed={selected}>
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${selected ? "bg-cyan-500 text-white" : "bg-dtsc-surface text-dtsc-muted"}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0"><strong className="block text-sm text-dtsc-ink">{option.label}</strong><span className="mt-1 block text-xs leading-5 text-dtsc-muted">{option.help}</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
