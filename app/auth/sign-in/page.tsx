import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountProductShell } from "@/components/auth/account-product-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/auth";
import { resolveValidatedAccountLandingRedirect } from "@/lib/auth/account-landing-redirect";
import { getCurrentHostType } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, requestHeaders, params] = await Promise.all([getSession(), headers(), searchParams]);
  const destination = resolveValidatedAccountLandingRedirect(session, params);
  if (destination) redirect(destination);
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
      <Suspense><AuthForm mode="sign-in" uiLocale={requestHeaders.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr"} /></Suspense>
    </AccountProductShell>
  );
}
