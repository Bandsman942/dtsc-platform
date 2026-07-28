"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Laptop, ShieldCheck } from "lucide-react";
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

const copy = {
  fr: {
    eyebrow: "Sécurité et session",
    title: "Connexion et notifications en arrière-plan",
    description: "Choisissez quand DTSC doit vous déconnecter et gérez les notifications système de cet appareil sans maintenir la page active en arrière-plan.",
    timeout: "Déconnexion automatique après",
    timeoutHelp: "DTSC vous déconnectera après cette période sans activité. Une durée plus longue est plus pratique mais augmente le risque sur un appareil partagé.",
    absolute: "Durée absolue",
    absoluteHelp: "Même avec une activité régulière, une réauthentification est requise au plus tard après 30 jours.",
    saved: "Politique de session mise à jour.",
    saveFailed: "Impossible de mettre à jour la politique de session.",
    storageUnavailable: "Le stockage de la préférence de session est temporairement indisponible. Votre durée précédente reste active.",
    sessionExpired: "Votre session doit être renouvelée avant de modifier ce réglage.",
    rateLimited: "Trop de modifications rapprochées. Réessayez dans quelques instants.",
    pushTitle: "Notifications en arrière-plan",
    pushHelp: "Recevez les messages et alertes DTSC via le service Push du navigateur même lorsqu'aucune page DTSC n'est ouverte, lorsque la plateforme le permet.",
    enable: "Activer sur cet appareil",
    renew: "Renouveler l'abonnement",
    disable: "Désactiver sur cet appareil",
    enabled: "Notifications activées sur cet appareil",
    permissionDefault: "Autorisation non encore accordée",
    permissionDenied: "Notifications bloquées par le navigateur",
    permissionGranted: "Autorisation accordée, abonnement à renouveler",
    unsupported: "Web Push non supporté dans ce contexte navigateur",
    configMissing: "Web Push n'est pas encore configuré côté serveur",
    apple: "Sur iPhone/iPad, ajoutez DTSC Platform à l'écran d'accueil puis ouvrez la PWA pour activer les notifications si cette option n'est pas disponible dans Safari.",
    pushEnabled: "Notifications Web Push activées.",
    pushDisabled: "Notifications désactivées sur cet appareil.",
  },
  en: {
    eyebrow: "Security and session",
    title: "Connection and background notifications",
    description: "Choose when DTSC signs you out and manage system notifications for this device without keeping a web page running in the background.",
    timeout: "Automatic sign-out after",
    timeoutHelp: "DTSC signs you out after this period without activity. Longer sessions are convenient but increase risk on shared devices.",
    absolute: "Absolute lifetime",
    absoluteHelp: "Even with regular activity, authentication is required again after at most 30 days.",
    saved: "Session policy updated.",
    saveFailed: "Unable to update the session policy.",
    storageUnavailable: "Session preference storage is temporarily unavailable. Your previous duration remains active.",
    sessionExpired: "Your session must be renewed before changing this setting.",
    rateLimited: "Too many changes in a short time. Try again in a few moments.",
    pushTitle: "Background notifications",
    pushHelp: "Receive DTSC messages and alerts through the browser Push Service even when no DTSC page is open, where supported.",
    enable: "Enable on this device",
    renew: "Renew subscription",
    disable: "Disable on this device",
    enabled: "Notifications enabled on this device",
    permissionDefault: "Permission has not been granted yet",
    permissionDenied: "Notifications are blocked by the browser",
    permissionGranted: "Permission granted, subscription needs renewal",
    unsupported: "Web Push is not supported in this browser context",
    configMissing: "Web Push is not configured on the server yet",
    apple: "On iPhone/iPad, add DTSC Platform to the Home Screen and open the PWA before enabling notifications if this option is unavailable in Safari.",
    pushEnabled: "Web Push notifications enabled.",
    pushDisabled: "Notifications disabled on this device.",
  },
} as const;

function stateLabel(state: PushCapabilityState, labels: (typeof copy)["fr"] | (typeof copy)["en"]) {
  if (state === "subscribed") return labels.enabled;
  if (state === "permission-denied") return labels.permissionDenied;
  if (state === "permission-granted") return labels.permissionGranted;
  if (state === "configuration-missing") return labels.configMissing;
  if (state === "unsupported") return labels.unsupported;
  return labels.permissionDefault;
}

export function SessionAndPushSettings({
  initialIdleTimeoutMinutes,
}: {
  initialIdleTimeoutMinutes: number;
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
  const [message, setMessage] = useState("");
  useToastMessage(message);

  useEffect(() => {
    void getPushCapabilityState().then(setPushState).catch(() => setPushState("unsupported"));
  }, []);

  const showAppleGuidance = useMemo(() => pushState === "unsupported" && needsAppleHomeScreenGuidance(), [pushState]);

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
      const body = await response.json().catch(() => null) as {
        code?: string;
        idleTimeoutMinutes?: number;
      } | null;

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

  async function enablePush() {
    setPushBusy(true);
    setMessage("");
    try {
      const result = await enableCurrentDevicePush();
      setPushState(result.state);
      setMessage(result.ok ? labels.pushEnabled : stateLabel(result.state, labels));
    } catch {
      setPushState(await getPushCapabilityState().catch(() => "unsupported" as const));
      setMessage(labels.configMissing);
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

  return (
    <section className="min-w-0 border-y border-dtsc-border bg-dtsc-surface px-4 py-5 sm:rounded-2xl sm:border sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400/12 text-cyan-600">
          <ShieldCheck className="h-5 w-5" />
        </span>
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
            <select
              value={idleTimeoutMinutes}
              disabled={savingSession}
              onChange={(event) => void updateTimeout(Number(event.target.value) as SessionIdleTimeoutMinutes)}
              className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-base text-dtsc-ink sm:text-sm"
            >
              {SESSION_IDLE_TIMEOUT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{locale === "en" ? option.labelEn : option.labelFr}</option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-dtsc-muted">{labels.timeoutHelp}</p>
          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-dtsc-muted">
            <Laptop className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong className="text-dtsc-ink">{labels.absolute} :</strong> {labels.absoluteHelp}</span>
          </div>
        </div>

        <div className="min-w-0 border-t border-dtsc-border pt-4 lg:border-t-0 lg:pl-1">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
            <div className="min-w-0">
              <h3 className="font-black text-dtsc-ink">{labels.pushTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">{labels.pushHelp}</p>
              <p className="mt-3 text-sm font-bold text-dtsc-ink">{stateLabel(pushState, labels)}</p>
              {showAppleGuidance ? <p className="mt-2 text-xs leading-5 text-dtsc-muted">{labels.apple}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {pushState === "subscribed" ? (
                  <Button type="button" variant="outline" disabled={pushBusy} onClick={() => void disablePush()} className="rounded-xl border-dtsc-border">
                    {labels.disable}
                  </Button>
                ) : pushState !== "permission-denied" && pushState !== "unsupported" ? (
                  <Button type="button" disabled={pushBusy} onClick={() => void enablePush()} className="rounded-xl bg-dtsc-blue text-white">
                    {pushState === "permission-granted" ? labels.renew : labels.enable}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
