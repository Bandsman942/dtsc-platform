"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, Smartphone, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Device = { id: string; browser: string; lastSeenAt: string; createdAt: string; trustedUntil: string | null };
type ResponseBody = { currentId: string | null; devices: Device[] };
const copy = {
  fr: {
    title: "Navigateurs reconnus et fiables", about: "DTSC reconnaît les nouveaux navigateurs pour vous prévenir par email. Un navigateur fiable est enregistré seulement avec votre consentement après MFA ; il ne contourne jamais le code de vérification.",
    trusted: "Fiable jusqu'au", current: "Ce navigateur", last: "Dernière connexion", trust: "Marquer ce navigateur comme fiable (30 jours)",
    password: "Mot de passe actuel", submit: "Confirmer mon consentement", revoke: "Révoquer", empty: "Aucun navigateur enregistré.",
    refreshed: "Appareil enregistré.", revoked: "Appareil révoqué.", error: "Impossible de charger les appareils.",
    confirm: "Confirmez-vous la révocation de ce navigateur ?",
  },
  en: {
    title: "Recognized and trusted browsers", about: "DTSC detects new browsers to send email alerts. Trust requires your consent after MFA and never bypasses your authenticator code.",
    trusted: "Trusted until", current: "This browser", last: "Last seen", trust: "Trust this browser for 30 days",
    password: "Current password", submit: "Confirm my consent", revoke: "Revoke", empty: "No browsers recorded.",
    refreshed: "Browser trusted.", revoked: "Browser revoked.", error: "Could not load browsers.",
    confirm: "Confirm revoking this browser?",
  },
} as const;

async function requestBrowser(url: string, payload?: Record<string, string>) {
  const r = await fetch(url, payload ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  } : { cache: "no-store" });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error || "Action impossible");
  return body;
}

export function KnownBrowsersSettings({ locale = "fr" }: { locale?: string }) {
  const t = locale === "en" ? copy.en : copy.fr;
  const [data, setData] = useState<ResponseBody | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  async function refresh() { setData(await requestBrowser("/api/account/security/known-browsers")); }
  useEffect(() => { void refresh().catch(() => toastError(t.error)); }, [t.error]);
  async function trust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      await requestBrowser("/api/account/security/known-browsers", { action: "trust", password });
      setPassword(""); await refresh(); toastSuccess(t.refreshed);
    } catch (e) { toastError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      await requestBrowser("/api/account/security/known-browsers", { action: "revoke", id });
      await refresh(); setPendingRevoke(null); toastSuccess(t.revoked);
    } catch(e) { toastError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }
  const current = data?.devices.find((x) => x.id === data.currentId);
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-6">
      <header>
        <h3 className="flex items-center gap-2 text-base font-bold text-dtsc-ink"><ShieldCheck className="h-5 w-5 text-dtsc-blue" />{t.title}</h3>
        <p className="mt-2 text-sm leading-6 text-dtsc-muted">{t.about}</p>
      </header>
      <div className="space-y-2">
        {data?.devices.map(x => <article key={x.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Smartphone className="h-5 w-5 shrink-0 text-dtsc-blue" />
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-dtsc-ink">{x.browser}</p>
              {x.id === data.currentId ? <p className="text-xs font-bold text-dtsc-blue">{t.current}</p> : null}
              <p className="text-xs text-dtsc-muted">{t.last} : {new Date(x.lastSeenAt).toLocaleString(locale === "en" ? "en-GB" : "fr-FR")}</p>
              {x.trustedUntil && new Date(x.trustedUntil) > new Date() ? <p className="text-xs font-bold text-dtsc-blue">{t.trusted} : {new Date(x.trustedUntil).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR")}</p> : null}
            </div>
          </div>
          <Button className="min-h-11 rounded-xl" variant="outline" type="button" disabled={busy}
            onClick={() => setPendingRevoke(x.id)}><ShieldX className="mr-2 h-4 w-4" />{t.revoke}</Button>
        </article>)}
        {data?.devices.length === 0 && <p className="text-sm text-dtsc-muted">{t.empty}</p>}
      </div>
      {pendingRevoke ? <div role="group" aria-label={t.confirm}
        className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
        <p className="text-sm font-semibold text-dtsc-ink">{t.confirm}</p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" type="button" disabled={busy}
            onClick={() => void revoke(pendingRevoke)}>{t.revoke}</Button>
          <Button className="min-h-11" variant="outline" type="button" disabled={busy}
            onClick={() => setPendingRevoke(null)}>{locale === "en" ? "Cancel" : "Annuler"}</Button>
        </div>
      </div> : null}
      {current && !current.trustedUntil ? <form onSubmit={(e) => void trust(e)} className="space-y-3 rounded-xl border border-dtsc-border bg-dtsc-page p-4">
        <p className="text-sm font-semibold text-dtsc-ink">{t.trust}</p>
        <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.password}
          <PasswordInput autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <Button type="submit" disabled={busy || !password} className="min-h-11 w-full rounded-xl sm:w-auto">{t.submit}</Button>
      </form> : null}
    </section>
  );
}
