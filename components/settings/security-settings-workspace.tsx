"use client";

import { useState, type ReactNode } from "react";
import { BellRing, Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { TotpSecuritySettings } from "@/components/settings/totp-security-settings";
import { ActiveSessionsSettings } from "@/components/settings/active-sessions-settings";
import { KnownBrowsersSettings } from "@/components/settings/known-browsers-settings";
import { SessionAndPushSettings } from "@/components/settings/session-and-push-settings";
import type { PushNotificationContentMode } from "@/lib/session-preference";

type SecurityPanel = "overview" | "mfa" | "sessions" | "browsers" | "notifications";

const labels = {
  fr: {
    navigation: "Rubriques de sécurité",
    overview: "Session actuelle",
    overviewHint: "Informations de connexion",
    mfa: "Double authentification",
    mfaHint: "Application et codes de secours",
    sessions: "Appareils connectés",
    sessionsHint: "Consulter et révoquer",
    browsers: "Navigateurs reconnus",
    browsersHint: "Appareils de confiance",
    notifications: "Sessions et notifications",
    notificationsHint: "Déconnexion et confidentialité",
  },
  en: {
    navigation: "Account security areas",
    overview: "Current session",
    overviewHint: "Connection details",
    mfa: "Two-factor authentication",
    mfaHint: "Authenticator and recovery codes",
    sessions: "Connected devices",
    sessionsHint: "Review and revoke",
    browsers: "Recognized browsers",
    browsersHint: "Trusted devices",
    notifications: "Sessions and notifications",
    notificationsHint: "Sign-out and privacy",
  },
} as const;

export function SecuritySettingsWorkspace({
  locale = "fr",
  initialIdleTimeoutMinutes,
  initialPushNotificationContentMode,
  currentSession,
}: {
  locale?: string;
  initialIdleTimeoutMinutes: number;
  initialPushNotificationContentMode: PushNotificationContentMode;
  currentSession: ReactNode;
}) {
  const [active, setActive] = useState<SecurityPanel>("mfa");
  const t = locale === "en" ? labels.en : labels.fr;
  const sections = [
    { key: "overview", label: t.overview, hint: t.overviewHint, icon: ShieldCheck },
    { key: "mfa", label: t.mfa, hint: t.mfaHint, icon: ShieldCheck },
    { key: "sessions", label: t.sessions, hint: t.sessionsHint, icon: Laptop },
    { key: "browsers", label: t.browsers, hint: t.browsersHint, icon: Smartphone },
    { key: "notifications", label: t.notifications, hint: t.notificationsHint, icon: BellRing },
  ] as const;

  return (
    <div data-account-security-workspace data-workspace-density="compact" data-responsive-scope className="w-full min-w-0 max-w-full space-y-3">
      <nav aria-label={t.navigation} className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {sections.map(({ key, label, hint, icon: Icon }) => {
          const selected = active === key;
          return (
            <button
              key={key}
              type="button"
              id={"security-switch-" + key}
              aria-pressed={selected}
              aria-controls={"security-panel-" + key}
              onClick={() => setActive(key)}
              className={`flex min-h-14 min-w-0 items-start gap-2 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 sm:gap-2.5 ${selected
                ? "border-cyan-500/60 bg-cyan-500/10 text-dtsc-blue"
                : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:border-cyan-400/50 hover:bg-dtsc-soft"}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-xs font-bold leading-5 sm:text-sm">{label}</span>
                <span className="mt-0.5 hidden text-xs leading-4 text-dtsc-muted sm:block">{hint}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface/70 p-3 sm:p-4 lg:p-5">
        {/* Preserve component state when switching areas, notably one-time
            recovery codes shown immediately after a successful MFA setup. */}
        <div id="security-panel-overview" aria-labelledby="security-switch-overview" hidden={active !== "overview"} className="min-w-0">{currentSession}</div>
        <div id="security-panel-mfa" aria-labelledby="security-switch-mfa" hidden={active !== "mfa"} className="min-w-0">
          <TotpSecuritySettings locale={locale} embedded />
        </div>
        <div id="security-panel-sessions" aria-labelledby="security-switch-sessions" hidden={active !== "sessions"} className="min-w-0">
          <ActiveSessionsSettings locale={locale} embedded />
        </div>
        <div id="security-panel-browsers" aria-labelledby="security-switch-browsers" hidden={active !== "browsers"} className="min-w-0">
          <KnownBrowsersSettings locale={locale} embedded />
        </div>
        <div id="security-panel-notifications" aria-labelledby="security-switch-notifications" hidden={active !== "notifications"} className="min-w-0">
          <SessionAndPushSettings
            initialIdleTimeoutMinutes={initialIdleTimeoutMinutes}
            initialPushNotificationContentMode={initialPushNotificationContentMode}
            embedded
          />
        </div>
      </div>
    </div>
  );
}
