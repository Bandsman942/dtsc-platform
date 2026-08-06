import { Suspense } from "react";
import { headers } from "next/headers";
import { AccountProductShell } from "@/components/auth/account-product-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/auth";
import { getCurrentHostType } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";

export default async function SignInPage() {
  const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
  const currentHostType = getCurrentHostType(requestHeaders.get("host"));
  return (
    <AccountProductShell
      eyebrow="Accès sécurisé"
      title="Connexion"
      description="Connectez-vous à votre espace personnel, DTSC interne ou entreprise autorisée."
      currentHostType={currentHostType}
      session={session}
      isDtscInternal={isDtscInternalSession(session)}
    >
      <Suspense><AuthForm mode="sign-in" /></Suspense>
    </AccountProductShell>
  );
}
