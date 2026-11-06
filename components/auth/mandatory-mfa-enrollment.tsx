"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, Smartphone, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LocalQrCode } from "@/components/settings/totp-security-settings";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Enrollment = { secret: string; provisioningUri: string };
const labels = {
  fr: {
    title: "Configuration de sécurité obligatoire", intro: "Cet espace exige la vérification à deux facteurs. Votre mot de passe a été validé, mais l'accès reste verrouillé jusqu'à la configuration de votre authentificateur.",
    password: "Confirmez votre mot de passe", start: "Configurer mon authentificateur",
    scan: "Scannez le QR code avec votre application d'authentification.",
    key: "Clé de configuration manuelle", code: "Code temporaire à six chiffres", verify: "Vérifier et activer",
    recovery: "Codes de récupération à conserver", recoveryHelp: "Enregistrez ces codes de secours dans un endroit sûr. Chacun est utilisable une seule fois et ils ne seront plus affichés.",
    finish: "J'ai enregistré les codes et je continue", cancel: "Retour à la connexion", copy: "Copier les codes",
    failure: "Impossible de terminer la configuration. Recommencez.", copied: "Codes copiés.",
  },
  en: {
    title: "Required security setup", intro: "This workspace requires two-factor authentication. Your password has been verified, but access remains locked until an authenticator is set up.",
    password: "Confirm your password", start: "Set up authenticator",
    scan: "Scan the QR code with your authenticator app.",
    key: "Manual setup key", code: "Six-digit authenticator code", verify: "Verify and enable",
    recovery: "Keep your recovery codes", recoveryHelp: "Save these backup codes somewhere safe. Each works once and cannot be displayed again.",
    finish: "I have saved my codes — continue", cancel: "Back to sign in", copy: "Copy codes",
    failure: "Unable to complete setup. Please sign in again.", copied: "Codes copied.",
  },
} as const;

async function post(url: string, payload: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload), credentials: "same-origin", cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || "Unable to finish setup");
  return body;
}

export function MandatoryMfaEnrollment({ locale, onDone, onCancel }: {
  locale: "fr" | "en"; onDone: (redirect: string) => void; onCancel: () => void;
}) {
  const t = labels[locale];
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [redirect, setRedirect] = useState("/dashboard");
  const [busy, setBusy] = useState(false);

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await post("/api/account/security/totp/enroll", { password });
      setSetup({ secret: response.secret, provisioningUri: response.provisioningUri });
      setPassword("");
    } catch (error) { toastError(error instanceof Error ? error.message : t.failure); }
    finally { setBusy(false); }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await post("/api/account/security/totp/confirm", { code });
      setSetup(null); setCode("");
      setRecoveryCodes(response.recoveryCodes || []);
      setRedirect(response.redirectTo || "/dashboard");
    } catch (error) { toastError(error instanceof Error ? error.message : t.failure); }
    finally { setBusy(false); }
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="rounded-2xl border border-cyan-400/40 bg-cyan-400/10 p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-dtsc-ink">
          <ShieldCheck className="h-5 w-5 text-dtsc-blue" />{t.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-dtsc-muted">{t.intro}</p>
      </div>
      {!setup && !recoveryCodes ? (
        <form onSubmit={(e) => void enroll(e)} className="space-y-3">
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.password}
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" required />
          </label>
          <Button type="submit" disabled={busy || !password} className="min-h-11 w-full rounded-xl">
            <Smartphone className="mr-2 h-4 w-4" />{t.start}
          </Button>
        </form>
      ) : null}
      {setup ? (
        <div className="space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <p className="text-sm text-dtsc-muted">{t.scan}</p>
          <LocalQrCode text={setup.provisioningUri} />
          <label className="grid gap-2 text-sm text-dtsc-muted">{t.key}
            <code className="break-all rounded-xl border border-dtsc-border bg-dtsc-surface p-3 font-semibold text-dtsc-ink">{setup.secret}</code>
          </label>
          <form className="space-y-3" onSubmit={(e) => void confirm(e)}>
            <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.code}
              <Input type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}"
                maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
            </label>
            <Button className="min-h-11 w-full" type="submit" disabled={busy || code.length !== 6}>{t.verify}</Button>
          </form>
        </div>
      ) : null}
      {recoveryCodes ? (
        <div className="space-y-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h3 className="flex items-center gap-2 font-bold text-dtsc-ink"><KeyRound className="h-5 w-5" />{t.recovery}</h3>
          <p className="text-sm leading-6 text-dtsc-muted">{t.recoveryHelp}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recoveryCodes.map(x => <code key={x} className="rounded-lg bg-dtsc-surface px-3 py-2 text-center text-sm font-bold text-dtsc-ink">{x}</code>)}
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => {
            void navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => toastSuccess(t.copied)).catch(() => toastError(t.failure));
          }}><Copy className="mr-2 h-4 w-4" />{t.copy}</Button>
          <Button className="min-h-11 w-full" type="button" onClick={() => onDone(redirect)}>{t.finish}</Button>
        </div>
      ) : null}
      {!recoveryCodes ? (
        <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy} onClick={onCancel}>{t.cancel}</Button>
      ) : null}
    </section>
  );
}
