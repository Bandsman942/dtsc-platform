"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { getSignInUrl } from "@/lib/domains";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.get("email") }),
    });
    setPending(false);
    if (!response.ok) {
      setError("La demande n’a pas pu être traitée. Réessayez dans quelques minutes.");
      return;
    }
    setAccepted(true);
  }

  if (accepted) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <h2 className="mt-3 font-semibold text-dtsc-ink">Vérifiez votre messagerie</h2>
          <p className="mt-2 text-sm leading-6 text-dtsc-muted">Si un compte actif correspond à cette adresse, un lien de récupération valable 30 minutes vient d’être envoyé. La réponse reste volontairement identique pour protéger les comptes.</p>
        </div>
        <Link href={getSignInUrl()} className="inline-flex items-center gap-2 text-sm font-semibold text-dtsc-blue hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
        Adresse email
        <Input name="email" type="email" autoComplete="email" required aria-describedby="forgot-email-help" />
      </label>
      <p id="forgot-email-help" className="text-xs leading-5 text-dtsc-muted">Utilisez l’adresse associée à votre compte DTSC.</p>
      {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl bg-dtsc-blue text-white hover:bg-[var(--dtsc-brand-secondary-hover)]">
        {pending ? "Traitement…" : "Envoyer le lien sécurisé"}<ArrowRight className="h-4 w-4" />
      </Button>
      <Link href={getSignInUrl()} className="inline-flex items-center gap-2 text-sm font-semibold text-dtsc-blue hover:underline">
        <ArrowLeft className="h-4 w-4" /> Retour à la connexion
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    if (password !== confirmation) {
      setPending(false);
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = await response.json().catch(() => null);
    setPending(false);
    if (!response.ok) {
      setError(body?.error || "Ce lien est invalide, expiré ou déjà utilisé.");
      return;
    }
    setCompleted(true);
  }

  if (!token) {
    return <p role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm leading-6 text-amber-800 dark:text-amber-200">Le lien de récupération est incomplet. Demandez un nouveau lien depuis la page de connexion.</p>;
  }

  if (completed) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <h2 className="mt-3 font-semibold text-dtsc-ink">Mot de passe modifié</h2>
          <p className="mt-2 text-sm leading-6 text-dtsc-muted">Le lien a été consommé et votre session actuelle a été supprimée. Connectez-vous avec votre nouveau mot de passe.</p>
        </div>
        <Link href={getSignInUrl()} className="inline-flex items-center gap-2 font-semibold text-dtsc-blue hover:underline">Se connecter <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
        Nouveau mot de passe
        <PasswordInput name="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-dtsc-ink">
        Confirmer le mot de passe
        <PasswordInput name="confirmation" autoComplete="new-password" minLength={12} required />
      </label>
      <p className="text-xs leading-5 text-dtsc-muted">12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</p>
      {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl bg-dtsc-blue text-white hover:bg-[var(--dtsc-brand-secondary-hover)]">
        {pending ? "Sécurisation…" : "Enregistrer le nouveau mot de passe"}<ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
