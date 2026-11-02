"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, KeyRound, Copy, Smartphone, AlertTriangle } from "lucide-react";
import { qrcodegen } from "@/lib/vendor/qrcodegen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type Enrollment = { secret: string; provisioningUri: string };
type SecurityStatus = { enabled: boolean; enabledAt: string | null; recoveryCodesRemaining: number };
type Stage = "overview" | "enroll" | "recovery" | "disable";
const FR = {
  title: "Authentification à deux facteurs",
  description: "Protégez votre compte avec un code temporaire généré par une application d'authentification.",
  on: "Activée", off: "Désactivée", remaining: "Codes de récupération disponibles",
  password: "Mot de passe actuel", code: "Code à six chiffres", backup: "Code de secours",
  enable: "Configurer l'authentificateur", disable: "Désactiver la protection",
  scan: "Scannez ce QR code avec Google Authenticator, Microsoft Authenticator ou une application compatible.",
  manual: "Si vous êtes sur le même téléphone, saisissez cette clé manuellement dans votre application.",
  verify: "Confirmer le code et activer", recoveryTitle: "Conservez ces codes de récupération",
  recoveryInfo: "Chaque code est utilisable une seule fois. Conservez-les hors de votre téléphone : ils ne seront plus affichés.",
  finish: "J'ai enregistré les codes", cancel: "Annuler", copied: "Copié", copy: "Copier",
  disableInfo: "Confirmez votre mot de passe et un code de votre application ou de récupération pour retirer la protection.",
  confirmDisable: "Confirmer la désactivation",
  failure: "Action impossible. Réessayez.",
  enabledNotice: "La protection de votre compte est activée.",
  disabledNotice: "La protection de votre compte est désactivée.",
};
const EN: typeof FR = {
  title: "Two-factor authentication",
  description: "Protect your account with a temporary code from an authenticator app.",
  on: "Enabled", off: "Disabled", remaining: "Recovery codes available",
  password: "Current password", code: "Six-digit code", backup: "Recovery code",
  enable: "Set up authenticator", disable: "Disable protection",
  scan: "Scan this QR code using Google Authenticator, Microsoft Authenticator or a compatible app.",
  manual: "If you are using the same phone, enter this key manually in your authenticator.",
  verify: "Verify code and enable", recoveryTitle: "Save these recovery codes",
  recoveryInfo: "Each code works only once. Store them away from your phone; they will not be shown again.",
  finish: "I have saved my codes", cancel: "Cancel", copied: "Copied", copy: "Copy",
  disableInfo: "Confirm your password and an authenticator or recovery code before removing protection.",
  confirmDisable: "Confirm disabling",
  failure: "Unable to complete the action. Please retry.",
  enabledNotice: "Your account protection is enabled.",
  disabledNotice: "Your account protection is disabled.",
};

function LocalQrCode({ text }: { text: string }) {
  const qr = useMemo(() => qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM), [text]);
  const padding = 4;
  const size = qr.size + padding * 2;
  const pixels: Array<React.ReactNode> = [];
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.getModule(x, y)) pixels.push(<rect key={x + "-" + y} x={x + padding} y={y + padding} width={1} height={1} />);
    }
  }
  return (
    <svg role="img" aria-label="QR code TOTP DTSC Platform" viewBox={"0 0 " + size + " " + size}
      className="mx-auto aspect-square h-auto w-full max-w-[240px] rounded-xl bg-white p-2 text-black" xmlns="http://www.w3.org/2000/svg">
      <rect width={size} height={size} fill="#fff" />
      <g fill="#000">{pixels}</g>
    </svg>
  );
}

async function requestJson(url: string, payload?: Record<string, string>) {
  const response = await fetch(url, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" } : { credentials: "same-origin" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Une erreur est survenue.");
  return body;
}

export function TotpSecuritySettings({ locale = "fr" }: { locale?: string }) {
  const t = locale === "en" ? EN : FR;
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [stage, setStage] = useState<Stage>("overview");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    requestJson("/api/account/security/totp")
      .then((data) => { if (active) setStatus(data); })
      .catch(() => { if (active) toastError(t.failure); });
    return () => { active = false; };
  }, [t.failure]);

  async function reload() {
    setStatus(await requestJson("/api/account/security/totp"));
  }
  function reset() {
    setStage("overview");
    setPassword("");
    setCode("");
    setEnrollment(null);
    setRecoveryCodes([]);
  }
  async function action(url: string, payload: Record<string, string>) {
    setBusy(true);
    try {
      const result = await requestJson(url, payload);
      if (url.endsWith("/enroll")) {
        setEnrollment({ secret: result.secret, provisioningUri: result.provisioningUri });
        setPassword("");
        setStage("enroll");
      } else if (url.endsWith("/confirm")) {
        setRecoveryCodes(result.recoveryCodes || []);
        setEnrollment(null);
        setCode("");
        setStage("recovery");
        await reload();
        toastSuccess(t.enabledNotice);
      } else {
        reset();
        await reload();
        toastSuccess(t.disabledNotice);
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : t.failure);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toastSuccess(t.copied); } catch { toastError(t.failure); }
  }

  return (
    <section className="w-full min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[var(--dtsc-shadow-sm)] sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="rounded-xl bg-dtsc-soft p-3 text-dtsc-blue"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-bold text-dtsc-ink">{t.title}</h3>
          <p className="text-sm leading-6 text-dtsc-muted">{t.description}</p>
          {status && <p className="text-xs font-semibold text-dtsc-blue">{status.enabled ? t.on : t.off}
            {status.enabled ? " · " + status.recoveryCodesRemaining + " " + t.remaining : ""}</p>}
        </div>
      </div>
      {!status ? <p className="text-sm text-dtsc-muted" aria-live="polite">…</p> : null}

      {status && stage === "overview" && !status.enabled ? (
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void action("/api/account/security/totp/enroll", { password }); }}>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.password}
            <PasswordInput autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <Button className="w-full rounded-xl sm:w-fit" type="submit" disabled={!password || busy}><Smartphone className="mr-2 h-4 w-4" />{t.enable}</Button>
        </form>
      ) : null}

      {stage === "enroll" && enrollment ? (
        <div className="space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <p className="text-sm leading-6 text-dtsc-muted">{t.scan}</p>
          <LocalQrCode text={enrollment.provisioningUri} />
          <p className="text-sm leading-6 text-dtsc-muted">{t.manual}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
            <code className="min-w-0 flex-1 break-all text-sm font-semibold text-dtsc-ink">{enrollment.secret}</code>
            <Button variant="outline" type="button" onClick={() => void copy(enrollment.secret)}><Copy className="mr-2 h-4 w-4" />{t.copy}</Button>
          </div>
          <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void action("/api/account/security/totp/confirm", { code }); }}>
            <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.code}
              <Input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
            </label>
            <div data-responsive-actions className="flex flex-wrap gap-2">
              <Button type="submit" disabled={code.length !== 6 || busy}>{t.verify}</Button>
              <Button type="button" variant="outline" onClick={reset} disabled={busy}>{t.cancel}</Button>
            </div>
          </form>
        </div>
      ) : null}

      {stage === "recovery" ? (
        <div className="space-y-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-dtsc-ink"><KeyRound className="h-5 w-5" />{t.recoveryTitle}</div>
          <p className="text-sm text-dtsc-muted">{t.recoveryInfo}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recoveryCodes.map((value) => <code key={value} className="rounded-lg border border-dtsc-border bg-dtsc-surface px-3 py-2 text-center text-sm font-semibold text-dtsc-ink">{value}</code>)}
          </div>
          <Button type="button" variant="outline" onClick={() => void copy(recoveryCodes.join("\n"))}><Copy className="mr-2 h-4 w-4" />{t.copy}</Button>
          <Button type="button" className="w-full" onClick={reset}>{t.finish}</Button>
        </div>
      ) : null}

      {status?.enabled && stage === "overview" ? (
        <Button variant="outline" type="button" className="rounded-xl" onClick={() => setStage("disable")}><AlertTriangle className="mr-2 h-4 w-4" />{t.disable}</Button>
      ) : null}
      {stage === "disable" ? (
        <form className="grid gap-3 rounded-2xl border border-amber-500/40 p-4" onSubmit={(event) => {
          event.preventDefault(); void action("/api/account/security/totp/disable", { password, code });
        }}>
          <p className="text-sm text-dtsc-muted">{t.disableInfo}</p>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.password}
            <PasswordInput value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">{t.code} / {t.backup}
            <Input type="text" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>
          <div data-responsive-actions className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !password || code.length < 6}>{t.confirmDisable}</Button>
            <Button variant="outline" type="button" onClick={reset} disabled={busy}>{t.cancel}</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
