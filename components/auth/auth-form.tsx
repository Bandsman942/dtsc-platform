"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsPending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error || "Impossible de traiter la demande.");
      return;
    }

    router.push(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isSignUp && (
        <>
          <Input name="name" placeholder="Nom complet" autoComplete="name" required />
          <Input name="companyName" placeholder="Entreprise" autoComplete="organization" />
          <Input name="phone" placeholder="Téléphone" autoComplete="tel" />
        </>
      )}
      <Input name="email" type="email" placeholder="Email professionnel" autoComplete="email" required />
      <Input
        name="password"
        type="password"
        placeholder="Mot de passe"
        autoComplete={isSignUp ? "new-password" : "current-password"}
        required
      />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Button type="submit" className="h-11 w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300" disabled={isPending}>
        {isPending ? "Traitement..." : isSignUp ? "Créer mon compte" : "Se connecter"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="text-center text-sm text-slate-400">
        {isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
        <Link href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"} className="text-cyan-300 hover:text-cyan-200">
          {isSignUp ? "Connexion" : "Inscription"}
        </Link>
      </p>
    </form>
  );
}
