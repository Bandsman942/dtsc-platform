"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Option = { value: string; label: string };
type CriticalChangeSelectProps = {
  currentValue: string;
  endpoint: string;
  field: "role" | "status";
  options: Option[];
};

export function CriticalChangeSelect({ currentValue, endpoint, field, options }: CriticalChangeSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(currentValue);
  const [pending, setPending] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = field === "role" ? "rôle" : "statut";

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending || pending === value) return;
    setBusy(true);
    setError("");
    try {
      const elevated = await fetch("/api/auth/step-up", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, ...(code.trim() ? { code: code.trim() } : {}) }),
      });
      const elevateBody = await elevated.json().catch(() => null);
      if (!elevated.ok) throw new Error(elevateBody?.error || "Impossible de vérifier votre identité.");
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: pending }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "La modification a été refusée.");
      setValue(pending);
      setPending(null); setPassword(""); setCode("");
      toastSuccess("Modification sécurisée enregistrée.");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de sécurité.";
      setError(message);
      toastError(message);
    } finally { setBusy(false); }
  }

  return (
    <div className="min-w-0 space-y-2">
      <select
        aria-label={field === "role" ? "Changer le rôle utilisateur" : "Changer le statut utilisateur"}
        value={value}
        disabled={busy}
        onChange={(event) => { setPending(event.target.value); setPassword(""); setCode(""); setError(""); }}
        className="h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface px-2 text-xs font-bold text-dtsc-ink"
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {pending && pending !== value ? (
        <form onSubmit={e => void commit(e)} className="min-w-[220px] max-w-full space-y-2 rounded-xl border border-amber-500/40 bg-dtsc-surface p-3 shadow-sm">
          <p className="text-xs font-bold text-dtsc-ink">Confirmer le changement de {operation}</p>
          <p className="text-xs text-dtsc-muted">Nouvelle valeur : {options.find(x => x.value === pending)?.label}. Cette action sensible exige votre mot de passe et, si activé, un code d’authentification.</p>
          <label className="grid gap-1 text-xs font-semibold text-dtsc-ink">
            Mot de passe actuel
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-dtsc-ink">
            Code de sécurité (si MFA activé)
            <Input value={code} onChange={e => setCode(e.target.value.slice(0, 30))} autoComplete="one-time-code" />
          </label>
          {error ? <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={busy || !password}>
              <ShieldCheck className="mr-1 h-4 w-4" /> Confirmer
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={busy}
              onClick={() => { setPending(null); setPassword(""); setCode(""); setError(""); }}>
              <X className="mr-1 h-4 w-4" /> Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
