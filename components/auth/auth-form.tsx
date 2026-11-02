"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toastError, toastInfo } from "@/lib/client-toast";
import { buildUrlForHostType, getDashboardUrl } from "@/lib/domains";
import { resolveTrustedInternalRedirect } from "@/lib/post-login-redirect";

const SESSION_EXPIRED_NOTICE = "Votre session a expiré. Reconnectez-vous pour continuer.";
const UNSELECTED_WORKSPACE = "__UNSELECTED_WORKSPACE__";

function normalizeRedirectTarget(target: unknown) {
  if (typeof target !== "string" || !target.trim()) return getDashboardUrl();
  return resolveTrustedInternalRedirect(target) || getDashboardUrl();
}

const MFA_UI = {
  fr: {
    title: "Vérification à deux facteurs",
    help: "Saisissez le code temporaire de votre application d'authentification. Aucun accès n'est accordé avant cette vérification.",
    code: "Code à six chiffres", recovery: "Code de récupération",
    loading: "Vérification…", submit: "Vérifier et me connecter",
    useRecovery: "Utiliser un code de récupération", useTotp: "Utiliser mon application d'authentification",
    back: "Revenir à la connexion",
    prompt: "Vérifiez le code de votre application d'authentification.",
    titleToast: "Vérification de sécurité",
    networkError: "Vérification impossible. Vérifiez votre connexion puis réessayez.",
    genericError: "Impossible de vérifier le code. Recommencez.",
  },
  en: {
    title: "Two-factor verification",
    help: "Enter the temporary code from your authenticator app. No account access is granted until verification.",
    code: "Six-digit code", recovery: "Recovery code",
    loading: "Verifying…", submit: "Verify and sign in",
    useRecovery: "Use a recovery code", useTotp: "Use my authenticator app",
    back: "Back to sign in",
    prompt: "Enter the code from your authenticator app.",
    titleToast: "Security verification",
    networkError: "Verification failed. Check your connection and try again.",
    genericError: "Could not verify the code. Please try again.",
  },
} as const;

export function AuthForm({ mode, uiLocale = "fr" }: { mode: "sign-in" | "sign-up"; uiLocale?: "fr" | "en" }) {
  const mfaCopy = MFA_UI[uiLocale];
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaMode, setMfaMode] = useState<"totp" | "recovery">("totp");
  const [mfaCode, setMfaCode] = useState("");

  const [pendingRegistration, setPendingRegistration] = useState<Record<string, FormDataEntryValue> | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Array<{ id: string; organizationId: string; name: string; role: string }>>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(UNSELECTED_WORKSPACE);
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const isSignUp = mode === "sign-up";
  const sessionExpired = !isSignUp && searchParams.get("reason") === "session-expired";
  const signInReady = organizationsLoaded && selectedOrganizationId !== UNSELECTED_WORKSPACE;

  function resetWorkspaceChoice() {
    setOrganizations([]);
    setPendingInvitations([]);
    setSelectedOrganizationId(UNSELECTED_WORKSPACE);
    setOrganizationsLoaded(false);
  }

  async function loadOrganizations() {
    const email = emailValue.trim().toLowerCase();
    resetWorkspaceChoice();
    if (isSignUp || !email.includes("@") || !passwordValue) return;
    setOrganizationLoading(true);
    try {
      const response = await fetch("/api/auth/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: passwordValue }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toastError("Impossible de charger vos espaces pour le moment. Réessayez dans un instant.");
        return;
      }
      setOrganizations(body?.organizations || []);
      setPendingInvitations(body?.pendingInvitations || []);
      setOrganizationsLoaded(true);
    } catch {
      toastError("Impossible de charger vos espaces. Vérifiez votre connexion puis réessayez.");
    } finally {
      setOrganizationLoading(false);
    }
  }

  async function submitPayload(payload: Record<string, FormDataEntryValue>) {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { response, body: await response.json().catch(() => null) };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSignUp && !signInReady) {
      toastInfo("Chargez vos espaces puis choisissez celui dans lequel vous souhaitez continuer.", "Choisissez votre espace");
      return;
    }

    const formData = new FormData(event.currentTarget);
    if (isSignUp && !pendingRegistration && String(formData.get("password")) !== String(formData.get("confirmPassword"))) {
      toastError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsPending(true);
    const payload = pendingRegistration
      ? { ...pendingRegistration, otp: String(formData.get("otp") || "") }
      : Object.fromEntries(formData.entries());
    const nextTarget = !isSignUp ? searchParams.get("next") : null;
    const { response, body } = await submitPayload(nextTarget ? { ...payload, next: nextTarget } : payload);
    setIsPending(false);
    if (!response.ok) {
      toastError(body?.error || "Impossible de poursuivre pour le moment. Réessayez dans un instant.");
      return;
    }
    if (!isSignUp && body?.mfaRequired) {
      setMfaRequired(true);
      setMfaMode("totp");
      setMfaCode("");
      setPasswordValue("");
      toastInfo(mfaCopy.prompt, mfaCopy.titleToast);
      return;
    }
    if (isSignUp && body?.otpRequired) {
      setPendingRegistration(payload);
      setOtpExpiresAt(body.expiresAt || "");
      toastInfo("Un code de vérification vient d’être envoyé à votre adresse email.", "Vérification email");
      return;
    }
    const target = normalizeRedirectTarget(body?.redirectTo);
    if (/^https?:\/\//i.test(target)) window.location.href = target;
    else {
      router.push(target);
      router.refresh();
    }
  }

  async function resendOtp() {
    if (!pendingRegistration) return;
    setIsPending(true);
    const { response, body } = await submitPayload(pendingRegistration);
    setIsPending(false);
    if (!response.ok || !body?.otpRequired) {
      toastError(body?.error || "Impossible de renvoyer le code de vérification.");
      return;
    }
    setOtpExpiresAt(body.expiresAt || "");
    toastInfo("Un nouveau code de vérification vient d’être envoyé.", "Code envoyé");
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaCode.trim()) return;
    setIsPending(true);
    try {
      const response = await fetch("/api/auth/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: mfaMode, code: mfaCode.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toastError(body?.error || mfaCopy.genericError);
        return;
      }
      setMfaCode("");
      const target = normalizeRedirectTarget(body?.redirectTo);
      if (/^https?:\/\//i.test(target)) window.location.href = target;
      else { router.push(target); router.refresh(); }
    } catch {
      toastError(mfaCopy.networkError);
    } finally { setIsPending(false); }
  }

  if (!isSignUp && mfaRequired) {
    return (
      <form onSubmit={submitMfa} className="space-y-5" noValidate>
        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-blue" />
            <div className="min-w-0">
              <h2 className="font-semibold text-dtsc-ink">{mfaCopy.title}</h2>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">
                {mfaCopy.help}
              </p>
            </div>
          </div>
        </div>
        <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
          {mfaMode === "totp" ? mfaCopy.code : mfaCopy.recovery}
          <Input
            name="mfaCode" type="text" inputMode={mfaMode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code" required autoFocus maxLength={mfaMode === "totp" ? 6 : 30}
            pattern={mfaMode === "totp" ? "[0-9]{6}" : undefined}
            value={mfaCode}
            onChange={(event) => setMfaCode(mfaMode === "totp" ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value.slice(0, 30))}
          />
        </label>
        <Button type="submit" className="min-h-11 w-full rounded-xl bg-dtsc-blue text-white" disabled={isPending || (mfaMode === "totp" ? mfaCode.length !== 6 : mfaCode.length < 20)}>
          {isPending ? mfaCopy.loading : mfaCopy.submit} <ArrowRight className="h-4 w-4" />
        </Button>
        <div className="grid gap-2 text-sm">
          <button type="button" disabled={isPending}
            onClick={() => { setMfaMode(mfaMode === "totp" ? "recovery" : "totp"); setMfaCode(""); }}
            className="min-h-11 rounded-xl text-dtsc-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
            {mfaMode === "totp" ? mfaCopy.useRecovery : mfaCopy.useTotp}
          </button>
          <button type="button" disabled={isPending}
            onClick={() => { setMfaRequired(false); setMfaCode(""); resetWorkspaceChoice(); }}
            className="min-h-11 rounded-xl text-dtsc-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
            {mfaCopy.back}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {sessionExpired ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {SESSION_EXPIRED_NOTICE}
        </p>
      ) : null}

      {isSignUp && !pendingRegistration ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink sm:col-span-2">
            Nom complet
            <Input name="name" autoComplete="name" required />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
            Organisation <span className="sr-only">optionnelle</span>
            <Input name="companyName" autoComplete="organization" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
            Téléphone <span className="sr-only">optionnel</span>
            <Input name="phone" autoComplete="tel" />
          </label>
        </div>
      ) : null}

      {pendingRegistration ? (
        <>
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-500" />
              <div>
                <p className="font-semibold text-dtsc-ink">Vérification email</p>
                <p className="mt-1 text-sm leading-6 text-dtsc-muted">
                  Entrez le code à 6 chiffres envoyé à {String(pendingRegistration.email)}.
                </p>
                {otpExpiresAt ? <p className="mt-2 text-xs text-dtsc-muted">Le code expire prochainement.</p> : null}
              </div>
            </div>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
            Code de vérification
            <Input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
          </label>
        </>
      ) : (
        <>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
            Email professionnel
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={emailValue}
              onChange={(event) => {
                setEmailValue(event.target.value);
                if (!isSignUp) resetWorkspaceChoice();
              }}
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
            Mot de passe
            <PasswordInput
              name="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={isSignUp ? 12 : undefined}
              value={passwordValue}
              onChange={(event) => {
                setPasswordValue(event.target.value);
                if (!isSignUp) resetWorkspaceChoice();
              }}
            />
          </label>

          {isSignUp ? (
            <>
              <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
                Confirmer le mot de passe
                <PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={12} />
              </label>
              <p className="text-xs leading-5 text-dtsc-muted">
                12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.
              </p>
              <label className="flex items-start gap-3 text-sm leading-6 text-dtsc-muted">
                <input name="legalConsent" value="true" type="checkbox" required className="mt-1 h-4 w-4 rounded border-dtsc-border" />
                <span>J’accepte les conditions d’utilisation et la politique de confidentialité applicables.</span>
              </label>
            </>
          ) : (
            <div className="space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-dtsc-ink">
                    <Building2 className="h-4 w-4 shrink-0 text-dtsc-blue" />
                    Choisir mon espace
                  </p>
                  <p className="mt-1 text-xs leading-5 text-dtsc-muted">
                    Chargez les espaces disponibles avec votre compte, puis choisissez où vous souhaitez travailler.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadOrganizations()}
                  disabled={organizationLoading || !emailValue.trim().includes("@") || !passwordValue}
                  className="w-full rounded-xl sm:w-auto sm:shrink-0"
                >
                  {organizationLoading ? "Recherche…" : organizationsLoaded ? "Actualiser" : "Charger mes espaces"}
                </Button>
              </div>

              {organizationsLoaded ? (
                <div className="space-y-2">
                  <label className="grid gap-2 text-xs font-semibold text-dtsc-muted">
                    Espace de travail
                    <select
                      name="organizationId"
                      value={selectedOrganizationId}
                      onChange={(event) => setSelectedOrganizationId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink outline-none focus:border-cyan-400"
                      required
                    >
                      <option value={UNSELECTED_WORKSPACE} disabled>
                        Choisissez votre espace
                      </option>
                      <option value="">Mon espace personnel</option>
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {organizations.length === 0 ? (
                    <p className="text-xs leading-5 text-dtsc-muted">Vous pouvez continuer dans votre espace personnel.</p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-dtsc-border px-3 py-2 text-xs leading-5 text-dtsc-muted">
                  Vos espaces s’afficheront ici après avoir choisi « Charger mes espaces ».
                </p>
              )}

              {pendingInvitations.length ? (
                <div className="rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-xs leading-5 text-dtsc-blue">
                  <p>Vous avez une invitation en attente pour : {pendingInvitations.map((item) => item.name).join(", ")}.</p>
                  <p>Connectez-vous à votre espace standard pour l&apos;accepter. Votre espace personnel centralise vos invitations et vos accès.</p>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      <Button
        type="submit"
        className="h-11 w-full rounded-xl bg-dtsc-blue text-white shadow-[var(--dtsc-shadow-md)] hover:bg-[var(--dtsc-brand-secondary-hover)]"
        disabled={isPending || (!isSignUp && !pendingRegistration && !signInReady)}
      >
        {isPending ? "Connexion…" : pendingRegistration ? "Vérifier et créer le compte" : isSignUp ? "Créer mon compte" : "Se connecter"}
        <ArrowRight className="h-4 w-4" />
      </Button>

      {pendingRegistration ? (
        <button
          type="button"
          onClick={resendOtp}
          className="w-full text-center text-sm font-semibold text-dtsc-blue hover:underline"
          disabled={isPending}
        >
          Renvoyer un nouveau code
        </button>
      ) : null}
      {!isSignUp && !pendingRegistration ? (
        <div className="text-center">
          <Link href={buildUrlForHostType("account", "/auth/forgot-password")} className="text-sm font-semibold text-dtsc-blue hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
      ) : null}
      <p className="text-center text-sm text-dtsc-muted">
        {isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
        <Link href={buildUrlForHostType("account", isSignUp ? "/auth/sign-in" : "/auth/sign-up")} className="font-semibold text-dtsc-blue hover:underline">
          {isSignUp ? "Connexion" : "Inscription"}
        </Link>
      </p>
    </form>
  );
}
