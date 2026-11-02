"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Recovery = {
  id: string; status: string; reason: string; createdAt: string; expiresAt: string;
  requestedByUserId: string;
  target: { id: string; name: string; email: string };
  requester: { name: string }; approver: { name: string } | null;
};
const strings = {
  fr: {
    title: "Récupération MFA sous double contrôle",
    help: "Une récupération d'un compte administrateur exige deux opérateurs de sécurité différents. Aucun code n'est communiqué et toutes les anciennes sessions sont invalidées.",
    email: "Email de l'administrateur à récupérer",
    reason: "Motif documenté de la demande ou décision (20 caractères minimum)",
    password: "Votre mot de passe DTSC",
    code: "Code TOTP ou code de secours (si activé)",
    create: "Demander la récupération", approve: "Approuver avec seconde validation",
    reject: "Rejeter la demande", cancel: "Annuler",
    pending: "Demandes en attente", refresh: "Actualiser",
    empty: "Aucune demande en attente.", error: "La récupération a échoué.",
    done: "Décision enregistrée et auditée.", new: "Demande créée ; un autre responsable devra l'approuver.",
    oneHour: "Expire le", submit: "Confirmer l'opération sécurisée",
    caution: "Après approbation, le compte doit configurer un nouvel authentificateur avant toute nouvelle session.",
    readonly: "Lecture seule : les opérations de récupération exigent SECURITY_MANAGE.",
  },
  en: {
    title: "Two-person MFA recovery",
    help: "Administrator recovery requires two distinct authorized security operators. No codes are disclosed and existing sessions are invalidated.",
    email: "Administrator email to recover",
    reason: "Documented reason for request or decision (minimum 20 characters)",
    password: "Your DTSC password", code: "TOTP or recovery code (if enabled)",
    create: "Request recovery", approve: "Approve with second authorization",
    reject: "Reject request", cancel: "Cancel",
    pending: "Pending requests", refresh: "Refresh", empty: "No pending requests.",
    error: "Recovery operation failed.", done: "Decision recorded and audited.",
    new: "Request created; a different security officer must approve it.",
    oneHour: "Expires", submit: "Confirm secure operation",
    caution: "After approval, the account must set up a new authenticator before a new session can begin.",
    readonly: "Read-only: recovery actions require SECURITY_MANAGE.",
  },
} as const;

export function ConsoleMfaRecoveryPanel({ locale = "fr", canManage = false }: { locale?: string; canManage?: boolean }) {
  const t = locale === "en" ? strings.en : strings.fr;
  const [requests, setRequests] = useState<Recovery[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [decision, setDecision] = useState<{ id: string; action: "APPROVE" | "REJECT" } | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/security/mfa-recovery", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || t.error);
      setRequests(body.requests || []);
      setLoaded(true);
    } catch (err) { toastError(err instanceof Error ? err.message : t.error); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const auth = await fetch("/api/auth/step-up", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, ...(code.trim() ? { code: code.trim() } : {}) }),
      });
      const check = await auth.json().catch(() => null);
      if (!auth.ok) throw new Error(check?.error || t.error);
      const url = decision
        ? "/api/admin/security/mfa-recovery/" + encodeURIComponent(decision.id)
        : "/api/admin/security/mfa-recovery";
      const body = decision ? { decision: decision.action, reason } : { targetEmail, reason };
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) throw new Error(result?.error || t.error);
      toastSuccess(decision ? t.done : t.new);
      setPassword(""); setCode(""); setReason(""); setTargetEmail(""); setDecision(null);
      await load();
    } catch (err) { toastError(err instanceof Error ? err.message : t.error); }
    finally { setBusy(false); }
  }

  const date = (s: string) => new Date(s).toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-6">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-dtsc-ink"><ShieldAlert className="h-5 w-5 text-dtsc-blue" />{t.title}</h3>
        <p className="max-w-3xl text-sm leading-6 text-dtsc-muted">{t.help}</p>
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-dtsc-ink">{t.caution}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-dtsc-ink">{t.pending}</h4>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />{t.refresh}
        </Button>
      </div>
      <div className="space-y-2" aria-live="polite">
        {requests.map(item => (
          <article key={item.id} className="space-y-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
            <p className="break-words text-sm font-semibold text-dtsc-ink">{item.target.name} · {item.target.email}</p>
            <p className="text-xs text-dtsc-muted">{t.oneHour} : {date(item.expiresAt)}</p>
            <p className="break-words text-xs text-dtsc-muted">{item.requester.name} : {item.reason}</p>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={busy} className="min-h-11"
                  onClick={() => { setDecision({ id: item.id, action: "APPROVE" }); setReason(""); }}>
                  <ShieldCheck className="mr-2 h-4 w-4" />{t.approve}
                </Button>
                <Button type="button" variant="outline" disabled={busy} className="min-h-11"
                  onClick={() => { setDecision({ id: item.id, action: "REJECT" }); setReason(""); }}>{t.reject}</Button>
              </div>
            ) : null}
          </article>
        ))}
        {loaded && requests.length === 0 ? <p className="text-sm text-dtsc-muted">{t.empty}</p> : null}
      </div>
      {canManage ? (
        <form onSubmit={e => void submit(e)} className="grid max-w-2xl gap-3 rounded-xl border border-dtsc-border p-3">
          <h4 className="text-sm font-bold text-dtsc-ink">{decision ? decision.action === "APPROVE" ? t.approve : t.reject : t.create}</h4>
          {!decision ? (
            <label className="grid gap-1 text-sm text-dtsc-ink">{t.email}
              <Input required type="email" value={targetEmail} onChange={e => setTargetEmail(e.target.value)} />
            </label>
          ) : null}
          <label className="grid gap-1 text-sm text-dtsc-ink">{t.reason}
            <Input required minLength={20} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-dtsc-ink">{t.password}
            <PasswordInput required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-dtsc-ink">{t.code}
            <Input autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.slice(0, 30))} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !password || reason.trim().length < 20} type="submit" className="min-h-11">{t.submit}</Button>
            {decision ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setDecision(null); setReason(""); }} className="min-h-11">{t.cancel}</Button> : null}
          </div>
        </form>
      ) : <p className="text-sm text-dtsc-muted">{t.readonly}</p>}
    </section>
  );
}
