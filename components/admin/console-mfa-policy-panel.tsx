"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type MfaPolicy = { requireMfaForAllUsers: boolean; requireMfaForDtscInternal: boolean };
const copy = {
  fr: {
    title: "Politique MFA globale", info: "Définissez les exigences minimales de double authentification. Les entreprises ne peuvent pas affaiblir ces règles.",
    global: "Imposer la double authentification à tous les comptes",
    internal: "Imposer la double authentification au personnel DTSC",
    warning: "Attention : toute personne concernée devra vérifier son authentificateur lors de la prochaine connexion. Si nécessaire, elle recevra le parcours sécurisé de configuration.",
    password: "Confirmez votre mot de passe DTSC", reason: "Motif du changement (obligatoire)",
    save: "Appliquer la politique", saved: "Politique de sécurité enregistrée.", retry: "Impossible de récupérer la politique.",
    readonly: "Lecture seule : vous ne possédez pas la permission de modifier les politiques.",
  },
  en: {
    title: "Global MFA policy", info: "Set platform-wide minimum two-factor requirements. Organizations cannot weaken these policies.",
    global: "Require two-factor authentication for all accounts",
    internal: "Require two-factor authentication for DTSC staff",
    warning: "Important: affected users will need to verify their authenticator at their next sign-in. They can use restricted secure onboarding if necessary.",
    password: "Confirm your DTSC password", reason: "Reason for this change (required)",
    save: "Apply security policy", saved: "Security policy saved.", retry: "Unable to load security policy.",
    readonly: "Read-only: you do not have permission to manage policies.",
  },
} as const;

export function ConsoleMfaPolicyPanel({ locale = "fr", canManage = false }: { locale?: string; canManage?: boolean }) {
  const t = locale === "en" ? copy.en : copy.fr;
  const [policy, setPolicy] = useState<MfaPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");

  async function refresh() {
    const res = await fetch("/api/admin/security/mfa-policy", { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || t.retry);
    setPolicy(body.policy);
  }
  useEffect(() => { void refresh().catch(() => toastError(t.retry)); }, [t.retry]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/security/mfa-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...policy, reason, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || t.retry);
      setPolicy(body.policy); setPassword(""); setReason("");
      toastSuccess(t.saved);
    } catch (error) { toastError(error instanceof Error ? error.message : t.retry); }
    finally { setBusy(false); }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-base font-bold text-dtsc-ink"><ShieldCheck className="h-5 w-5 text-dtsc-blue" />{t.title}</h3>
        <p className="text-sm leading-6 text-dtsc-muted">{t.info}</p>
      </div>
      {policy ? (
        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-ink">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-cyan-600"
              disabled={!canManage || busy} checked={policy.requireMfaForAllUsers}
              onChange={e => setPolicy(p => p && ({ ...p, requireMfaForAllUsers: e.target.checked }))} />
            <span>{t.global}</span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-ink">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-cyan-600"
              disabled={!canManage || busy} checked={policy.requireMfaForDtscInternal}
              onChange={e => setPolicy(p => p && ({ ...p, requireMfaForDtscInternal: e.target.checked }))} />
            <span>{t.internal}</span>
          </label>
          {canManage ? (
            <div className="space-y-3">
              <p className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-6 text-dtsc-ink">
                <ShieldAlert className="mt-1 h-5 w-5 shrink-0" />{t.warning}
              </p>
              <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.reason}
                <Input required minLength={10} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.password}
                <PasswordInput required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
              </label>
              <Button className="min-h-11 w-full rounded-xl sm:w-fit" disabled={busy || !password || reason.trim().length < 10}>{t.save}</Button>
            </div>
          ) : <p className="text-sm text-dtsc-muted">{t.readonly}</p>}
        </form>
      ) : <p className="text-sm text-dtsc-muted" aria-live="polite">…</p>}
    </section>
  );
}
