"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MonitorSmartphone, Search, ShieldCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Row = { id: string; userId: string; name: string; email: string; device: string; createdAt: string; lastSeenAt: string; current: boolean };
type Result = { sessions: Row[]; total: number; nextCursor: string | null };

const messages = {
  fr: {
    title: "Sécurité des connexions", help: "Registre des sessions actives : accès réservé aux responsables habilités de DTSC.",
    search: "Utilisateur, email ou nom", refresh: "Actualiser", total: "Sessions actives",
    last: "Dernière activité", current: "Session actuelle", load: "Afficher plus", revoke: "Révoquer",
    empty: "Aucune session trouvée.", error: "Impossible de charger les sessions.", reason: "Motif obligatoire de révocation",
    password: "Votre mot de passe DTSC", confirm: "Confirmer la révocation", cancel: "Annuler",
    warning: "Cette action interrompt immédiatement les accès serveur de cette session. Le motif et l'auteur sont audités.",
    success: "Session révoquée avec succès.", disabled: "Lecture seule : seuls les profils autorisés peuvent révoquer.",
  },
  en: {
    title: "Sign-in security", help: "Active session register: access restricted to authorized DTSC personnel.",
    search: "User, email or name", refresh: "Refresh", total: "Active sessions",
    last: "Last activity", current: "Current session", load: "Load more", revoke: "Revoke",
    empty: "No sessions found.", error: "Unable to load sessions.", reason: "Mandatory revocation reason",
    password: "Your DTSC password", confirm: "Confirm revocation", cancel: "Cancel",
    warning: "This immediately terminates server access from the selected session. The reason and actor are audited.",
    success: "Session revoked.", disabled: "Read-only: only authorized staff can revoke sessions.",
  },
} as const;

export function ConsoleSessionsSecurityPanel({ locale = "fr", canManage = false }: { locale?: string; canManage?: boolean }) {
  const t = locale === "en" ? messages.en : messages.fr;
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  async function load(nextCursor?: string, query = search) {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim().slice(0, 120));
      if (nextCursor) params.set("cursor", nextCursor);
      const res = await fetch("/api/admin/security/sessions?" + params.toString(), { cache: "no-store" });
      const body = await res.json().catch(() => null) as Result & { error?: string };
      if (!res.ok) throw new Error(body?.error || t.error);
      setRows((prev) => nextCursor ? [...prev, ...body.sessions] : body.sessions);
      setTotal(body.total);
      setCursor(body.nextCursor);
      setLoaded(true);
    } catch (e) { toastError(e instanceof Error ? e.message : t.error); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(undefined, ""); }, []); // Initial request, no background polling.
  async function revoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/security/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.userId, sessionId: selected.id, reason, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || t.error);
      setSelected(null); setPassword(""); setReason("");
      toastSuccess(t.success);
      if (selected.current) window.location.assign("/session-expired");
      else await load();
    } catch (e) { toastError(e instanceof Error ? e.message : t.error); }
    finally { setBusy(false); }
  }
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-dtsc-ink"><ShieldCheck className="h-5 w-5 text-dtsc-blue" />{t.title}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{t.help}</p>
          <p className="mt-2 text-sm font-bold text-dtsc-blue">{t.total} : {total}</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void load()} className="min-h-11 rounded-xl"><RefreshCw className="mr-2 h-4 w-4" />{t.refresh}</Button>
      </div>
      {!canManage && <p className="text-xs text-dtsc-muted">{t.disabled}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void load(undefined, search); }} className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 space-y-1 text-sm font-semibold text-dtsc-ink">
          <span>{t.search}</span>
          <Input type="search" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} />
        </label>
        <Button type="submit" disabled={busy} className="min-h-11 self-end"><Search className="mr-2 h-4 w-4" />{t.search}</Button>
      </form>
      <div className="space-y-2" aria-live="polite">
        {rows.map((row) => <article key={row.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-blue" />
            <div className="min-w-0 space-y-1">
              <p className="break-words text-sm font-semibold text-dtsc-ink">{row.name} · {row.email}</p>
              <p className="break-words text-xs text-dtsc-muted">{row.device}</p>
              <p className="text-xs text-dtsc-muted">{t.last} : {new Date(row.lastSeenAt).toLocaleString(locale === "en" ? "en-GB" : "fr-FR")}</p>
              {row.current ? <p className="text-xs font-semibold text-dtsc-blue">{t.current}</p> : null}
            </div>
          </div>
          {canManage ? <Button type="button" disabled={busy} variant="outline" onClick={() => { setSelected(row); setReason(""); setPassword(""); }}
            className="min-h-11 w-full rounded-xl sm:w-auto sm:shrink-0"><ShieldAlert className="mr-2 h-4 w-4" />{t.revoke}</Button> : null}
        </article>)}
        {loaded && rows.length === 0 ? <p className="p-4 text-sm text-dtsc-muted">{t.empty}</p> : null}
      </div>
      {cursor ? <Button type="button" variant="outline" onClick={() => void load(cursor)} disabled={busy}>{t.load}</Button> : null}
      {canManage && selected ? <form onSubmit={(e) => void revoke(e)} className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
        <h4 className="text-sm font-bold text-dtsc-ink">{t.confirm} · {selected.email}</h4>
        <p className="text-sm leading-6 text-dtsc-muted">{t.warning}</p>
        <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.reason}
          <Input required minLength={10} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.password}
          <PasswordInput required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || reason.trim().length < 10 || !password}>{t.confirm}</Button>
          <Button variant="outline" type="button" disabled={busy} onClick={() => { setSelected(null); setPassword(""); }}>{t.cancel}</Button>
        </div>
      </form> : null}
    </section>
  );
}
