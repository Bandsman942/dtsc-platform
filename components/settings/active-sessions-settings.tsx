"use client";

import { useEffect, useMemo, useState } from "react";
import { Laptop, ShieldCheck, LogOut, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type DeviceSession = {
  id: string; device: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean;
};
type DeviceResult = { sessions: DeviceSession[]; nextCursor: string | null; currentSessionRegistered: boolean };
const copy = {
  fr: {
    title: "Appareils connectés", subtitle: "Contrôlez les connexions actives de votre compte, quel que soit l'espace de travail DTSC.",
    refresh: "Actualiser", revokeOthers: "Déconnecter les autres appareils", search: "Rechercher un appareil",
    current: "Cet appareil", active: "Dernière activité", signedIn: "Connecté depuis le",
    revoke: "Déconnecter", cancel: "Annuler", confirm: "Confirmer la déconnexion",
    confirmOthers: "Confirmer la déconnexion des autres appareils",
    warning: "Cette action termine immédiatement l'accès aux données de votre compte depuis les appareils concernés.",
    more: "Charger davantage", none: "Aucun autre appareil actif.", unavailable: "Impossible de charger les appareils.",
    done: "Session révoquée.", othersDone: "Les autres appareils ont été déconnectés.",
    legacy: "Votre session actuelle utilise encore l'ancien format. Renouvelez votre connexion pour gérer tous les appareils.",
    loading: "Chargement…",
  },
  en: {
    title: "Connected devices", subtitle: "Manage account sessions across all your DTSC workspaces.",
    refresh: "Refresh", revokeOthers: "Sign out other devices", search: "Find a device",
    current: "This device", active: "Last activity", signedIn: "Signed in",
    revoke: "Sign out", cancel: "Cancel", confirm: "Confirm sign out",
    confirmOthers: "Confirm sign out on other devices",
    warning: "This action immediately ends access to your account data from the selected devices.",
    more: "Load more", none: "No other active devices.", unavailable: "Could not load devices.",
    done: "Session revoked.", othersDone: "Other devices have been signed out.",
    legacy: "Your current session uses an older format. Sign in again before managing all devices.",
    loading: "Loading…",
  },
} as const;

async function requestSessions(url: string, payload?: { action: string; sessionId?: string }) {
  const response = await fetch(url, payload ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  } : { credentials: "same-origin", cache: "no-store" });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error || "Opération impossible.");
  return json;
}

export function ActiveSessionsSettings({ locale = "fr" }: { locale?: string }) {
  const t = locale === "en" ? copy.en : copy.fr;
  const [items, setItems] = useState<DeviceSession[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [registered, setRegistered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<{ action: "revoke" | "revoke_others"; id?: string } | null>(null);
  const date = (value: string) => new Date(value).toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  const filtered = useMemo(() => items.filter((item) =>
    item.device.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [items, search]);
  async function reload(nextCursor?: string) {
    setBusy(true);
    try {
      const data: DeviceResult = await requestSessions("/api/account/security/sessions" + (nextCursor ? "?cursor=" + encodeURIComponent(nextCursor) : ""));
      setItems((old) => nextCursor ? [...old, ...data.sessions.filter((item) => !old.some((x) => x.id === item.id))] : data.sessions);
      setCursor(data.nextCursor);
      setRegistered(data.currentSessionRegistered);
      setLoaded(true);
    } catch (error) {
      toastError(error instanceof Error ? error.message : t.unavailable);
    } finally { setBusy(false); }
  }
  useEffect(() => { void reload(); }, []); // Initial fetch only; explicit refresh thereafter.
  async function revoke() {
    if (!confirm) return;
    setBusy(true);
    try {
      const data = await requestSessions("/api/account/security/sessions", {
        action: confirm.action, ...(confirm.id ? { sessionId: confirm.id } : {}),
      });
      setConfirm(null);
      if (data.currentRevoked) {
        window.location.assign("/session-expired");
        return;
      }
      toastSuccess(confirm.action === "revoke_others" ? t.othersDone : t.done);
      await reload();
    } catch (error) {
      toastError(error instanceof Error ? error.message : t.unavailable);
    } finally { setBusy(false); }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-dtsc-ink"><ShieldCheck className="h-5 w-5 text-dtsc-blue" />{t.title}</h3>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">{t.subtitle}</p>
        </div>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void reload()} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" />{t.refresh}
        </Button>
      </div>
      {!registered ? <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-dtsc-ink">{t.legacy}</p> : null}
      <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
        {t.search}
        <span className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-dtsc-muted" aria-hidden="true" />
          <Input className="pl-10" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} />
        </span>
      </label>
      <div className="space-y-2" aria-live="polite">
        {filtered.map((item) => (
          <article key={item.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Laptop className="mt-1 h-5 w-5 shrink-0 text-dtsc-blue" aria-hidden="true" />
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-dtsc-ink">{item.device}</p>
                {item.current ? <span className="text-xs font-bold text-dtsc-blue">{t.current}</span> : null}
                <p className="text-xs leading-5 text-dtsc-muted">{t.active} : {date(item.lastSeenAt)}</p>
                <p className="text-xs leading-5 text-dtsc-muted">{t.signedIn} : {date(item.createdAt)}</p>
              </div>
            </div>
            <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl sm:w-auto sm:shrink-0" disabled={busy}
              onClick={() => setConfirm({ action: "revoke", id: item.id })}><LogOut className="mr-2 h-4 w-4" />{t.revoke}</Button>
          </article>
        ))}
        {loaded && filtered.length === 0 ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">{t.none}</p> : null}
        {!loaded && busy ? <p className="text-sm text-dtsc-muted">{t.loading}</p> : null}
      </div>
      {cursor ? <Button type="button" variant="outline" disabled={busy} onClick={() => void reload(cursor)}>{t.more}</Button> : null}
      {registered ? <Button type="button" variant="outline" disabled={busy}
        className="min-h-11 w-full rounded-xl border-amber-500/40 text-amber-800 sm:w-auto dark:text-amber-200"
        onClick={() => setConfirm({ action: "revoke_others" })}>{t.revokeOthers}</Button> : null}
      {confirm ? (
        <div role="group" aria-label={t.warning} className="space-y-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="font-semibold text-dtsc-ink">{confirm.action === "revoke_others" ? t.confirmOthers : t.confirm}</p>
          <p className="text-sm leading-6 text-dtsc-muted">{t.warning}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void revoke()}>{confirm.action === "revoke_others" ? t.confirmOthers : t.confirm}</Button>
            <Button variant="outline" type="button" disabled={busy} onClick={() => setConfirm(null)}>{t.cancel}</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
