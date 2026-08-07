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

function normalizeRedirectTarget(target: unknown) {
  if (typeof target !== "string" || !target.trim()) return getDashboardUrl();
  return resolveTrustedInternalRedirect(target) || getDashboardUrl();
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<Record<string, FormDataEntryValue> | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Array<{ id: string; organizationId: string; name: string; role: string }>>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const isSignUp = mode === "sign-up";
  const sessionExpired = !isSignUp && searchParams.get("reason") === "session-expired";

  async function loadOrganizations() {
    const email = emailValue.trim().toLowerCase();
    setOrganizations([]); setPendingInvitations([]); setSelectedOrganizationId("");
    if (isSignUp || !email.includes("@") || !passwordValue) return;
    setOrganizationLoading(true);
    try {
      const response = await fetch("/api/auth/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: passwordValue }) });
      const body = await response.json().catch(() => null);
      setOrganizations(body?.organizations || []); setPendingInvitations(body?.pendingInvitations || []);
    } catch { setOrganizations([]); setPendingInvitations([]); }
    finally { setOrganizationLoading(false); }
  }

  async function submitPayload(payload: Record<string, FormDataEntryValue>) {
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { response, body: await response.json().catch(() => null) };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (isSignUp && !pendingRegistration && String(formData.get("password")) !== String(formData.get("confirmPassword"))) { toastError("Les deux mots de passe ne correspondent pas."); return; }
    setIsPending(true);
    const payload = pendingRegistration ? { ...pendingRegistration, otp: String(formData.get("otp") || "") } : Object.fromEntries(formData.entries());
    const nextTarget = !isSignUp ? searchParams.get("next") : null;
    const { response, body } = await submitPayload(nextTarget ? { ...payload, next: nextTarget } : payload);
    setIsPending(false);
    if (!response.ok) { toastError(body?.error || "Impossible de traiter la demande."); return; }
    if (isSignUp && body?.otpRequired) { setPendingRegistration(payload); setOtpExpiresAt(body.expiresAt || ""); toastInfo("Un code OTP vient d’être envoyé à votre adresse email.", "Vérification email"); return; }
    const target = normalizeRedirectTarget(body?.redirectTo);
    if (/^https?:\/\//i.test(target)) window.location.href = target; else { router.push(target); router.refresh(); }
  }

  async function resendOtp() {
    if (!pendingRegistration) return;
    setIsPending(true);
    const { response, body } = await submitPayload(pendingRegistration);
    setIsPending(false);
    if (!response.ok || !body?.otpRequired) { toastError(body?.error || "Impossible de renvoyer le code OTP."); return; }
    setOtpExpiresAt(body.expiresAt || ""); toastInfo("Un nouveau code OTP vient d’être envoyé.", "Code OTP envoyé");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {sessionExpired ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200">{SESSION_EXPIRED_NOTICE}</p> : null}
      {isSignUp && !pendingRegistration ? <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold text-dtsc-ink sm:col-span-2">Nom complet<Input name="name" autoComplete="name" required /></label><label className="grid gap-2 text-sm font-semibold text-dtsc-ink">Organisation <span className="sr-only">optionnelle</span><Input name="companyName" autoComplete="organization" /></label><label className="grid gap-2 text-sm font-semibold text-dtsc-ink">Téléphone <span className="sr-only">optionnel</span><Input name="phone" autoComplete="tel" /></label></div> : null}

      {pendingRegistration ? <><div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-500" /><div><p className="font-semibold text-dtsc-ink">Vérification email</p><p className="mt-1 text-sm leading-6 text-dtsc-muted">Entrez le code à 6 chiffres envoyé à {String(pendingRegistration.email)}.</p>{otpExpiresAt ? <p className="mt-2 text-xs text-dtsc-muted">Le code expire prochainement.</p> : null}</div></div></div><label className="grid gap-2 text-sm font-semibold text-dtsc-ink">Code OTP<Input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label></> : <><label className="grid gap-2 text-sm font-semibold text-dtsc-ink">Email professionnel<Input name="email" type="email" autoComplete="email" required value={emailValue} onChange={(event) => setEmailValue(event.target.value)} /></label><label className="grid gap-2 text-sm font-semibold text-dtsc-ink">Mot de passe<PasswordInput name="password" autoComplete={isSignUp ? "new-password" : "current-password"} required minLength={isSignUp ? 12 : undefined} value={passwordValue} onChange={(event) => setPasswordValue(event.target.value)} /></label>{isSignUp ? <><label className="grid gap-2 text-sm font-semibold text-dtsc-ink">Confirmer le mot de passe<PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={12} /></label><p className="text-xs leading-5 text-dtsc-muted">12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</p><label className="flex items-start gap-3 text-sm leading-6 text-dtsc-muted"><input name="legalConsent" value="true" type="checkbox" required className="mt-1 h-4 w-4 rounded border-dtsc-border" /><span>J’accepte les conditions d’utilisation et la politique de confidentialité applicables.</span></label></> : <div className="space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-semibold text-dtsc-ink"><Building2 className="h-4 w-4 text-dtsc-blue" /> Contexte entreprise</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">Vos espaces ne sont révélés qu’après vérification de vos identifiants.</p></div><Button type="button" variant="outline" onClick={() => void loadOrganizations()} disabled={organizationLoading || !emailValue || !passwordValue} className="shrink-0 rounded-xl">{organizationLoading ? "Vérification…" : "Charger"}</Button></div>{organizations.length ? <select name="organizationId" value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"><option value="">Espace personnel</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.role}</option>)}</select> : <input type="hidden" name="organizationId" value="" />}{pendingInvitations.length ? <div className="rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-xs leading-5 text-dtsc-blue"><p>Invitation en attente : {pendingInvitations.map((item) => item.name).join(", ")}.</p><p>Connectez-vous à votre espace standard pour l&apos;accepter.</p></div> : null}</div>}</>}

      <Button type="submit" className="h-11 w-full rounded-xl bg-dtsc-blue text-white shadow-[var(--dtsc-shadow-md)] hover:bg-[var(--dtsc-brand-secondary-hover)]" disabled={isPending}>{isPending ? "Traitement…" : pendingRegistration ? "Vérifier et créer le compte" : isSignUp ? "Créer mon compte" : "Se connecter"}<ArrowRight className="h-4 w-4" /></Button>
      {pendingRegistration ? <button type="button" onClick={resendOtp} className="w-full text-center text-sm font-semibold text-dtsc-blue hover:underline" disabled={isPending}>Renvoyer un nouveau code</button> : null}
      {!isSignUp && !pendingRegistration ? <div className="text-center"><Link href={buildUrlForHostType("account", "/auth/forgot-password")} className="text-sm font-semibold text-dtsc-blue hover:underline">Mot de passe oublié ?</Link></div> : null}
      <p className="text-center text-sm text-dtsc-muted">{isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"} <Link href={buildUrlForHostType("account", isSignUp ? "/auth/sign-in" : "/auth/sign-up")} className="font-semibold text-dtsc-blue hover:underline">{isSignUp ? "Connexion" : "Inscription"}</Link></p>
    </form>
  );
}
