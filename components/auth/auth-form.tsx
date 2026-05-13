"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<Record<string, FormDataEntryValue> | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState("");
  const isSignUp = mode === "sign-up";
  const sessionExpired = !isSignUp && searchParams.get("reason") === "session-expired";

  async function submitPayload(payload: Record<string, FormDataEntryValue>) {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    return { response, body };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = pendingRegistration
      ? { ...pendingRegistration, otp: String(formData.get("otp") || "") }
      : Object.fromEntries(formData.entries());
    const { response, body } = await submitPayload(payload);

    setIsPending(false);

    if (!response.ok) {
      setError(body?.error || "Impossible de traiter la demande.");
      return;
    }

    if (isSignUp && body?.otpRequired) {
      setPendingRegistration(payload);
      setOtpExpiresAt(body.expiresAt || "");
      setSuccess("Un code OTP vient d'être envoyé à votre adresse email. Saisissez-le pour activer votre compte.");
      return;
    }

    router.push(searchParams.get("next") || body?.redirectTo || "/dashboard");
    router.refresh();
  }

  async function resendOtp() {
    if (!pendingRegistration) {
      return;
    }

    setError("");
    setSuccess("");
    setIsPending(true);
    const { response, body } = await submitPayload(pendingRegistration);
    setIsPending(false);

    if (!response.ok || !body?.otpRequired) {
      setError(body?.error || "Impossible de renvoyer le code OTP.");
      return;
    }

    setOtpExpiresAt(body.expiresAt || "");
    setSuccess("Un nouveau code OTP vient d'être envoyé.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {sessionExpired && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          Votre session a expiré après 5 minutes sans activité. Reconnectez-vous pour continuer.
        </p>
      )}
      {isSignUp && (
        <>
          {pendingRegistration ? (
            <div className="rounded-2xl border border-cyan-300/40 bg-cyan-400/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-500" />
                <div>
                  <p className="font-black text-dtsc-ink">Vérification email</p>
                  <p className="mt-1 text-sm leading-6 text-dtsc-muted">
                    Entrez le code à 6 chiffres envoyé à <span className="font-semibold text-dtsc-ink">{String(pendingRegistration.email)}</span>.
                  </p>
                  {otpExpiresAt && (
                    <p className="mt-2 text-xs font-semibold text-cyan-700">
                      Expiration: {new Date(otpExpiresAt).toLocaleString("fr-FR")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <Input name="name" placeholder="Nom complet" autoComplete="name" required />
              <Input name="companyName" placeholder="Entreprise" autoComplete="organization" />
              <Input name="phone" placeholder="Téléphone" autoComplete="tel" />
            </>
          )}
        </>
      )}
      {pendingRegistration ? (
        <Input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="Code OTP à 6 chiffres" autoComplete="one-time-code" required />
      ) : (
        <>
          <Input name="email" type="email" placeholder="Email professionnel" autoComplete="email" required />
          <PasswordInput
            name="password"
            placeholder="Mot de passe"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
          />
        </>
      )}
      {success && <p className="rounded-xl bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800">{success}</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      <Button type="submit" className="h-11 w-full rounded-xl bg-[#002b5b] text-white shadow-[0_12px_32px_rgba(0,43,91,0.12)] hover:bg-[#001736]" disabled={isPending}>
        {isPending ? "Traitement..." : pendingRegistration ? "Vérifier et créer le compte" : isSignUp ? "Créer mon compte" : "Se connecter"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      {pendingRegistration && (
        <button type="button" onClick={resendOtp} className="w-full text-center text-sm font-semibold text-dtsc-blue hover:text-cyan-600" disabled={isPending}>
          Renvoyer un nouveau code
        </button>
      )}
      <p className="text-center text-sm text-dtsc-muted">
        {isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
        <Link href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"} className="font-semibold text-dtsc-blue hover:text-cyan-600">
          {isSignUp ? "Connexion" : "Inscription"}
        </Link>
      </p>
    </form>
  );
}
