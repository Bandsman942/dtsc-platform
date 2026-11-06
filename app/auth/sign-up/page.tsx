import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountProductShell } from "@/components/auth/account-product-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/auth";
import { resolveValidatedAccountLandingRedirect } from "@/lib/auth/account-landing-redirect";
import { getCurrentHostType } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";

export default async function SignUpPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, requestHeaders, params] = await Promise.all([getSession(), headers(), searchParams]);
  const destination = resolveValidatedAccountLandingRedirect(session, params);
  if (destination) redirect(destination);
  const currentHostType = getCurrentHostType(requestHeaders.get("host"));
  return (
    <AccountProductShell
      eyebrow="Création de compte"
      title="Inscription"
      description="Créez votre identité DTSC, confirmez votre adresse par OTP puis accédez à votre espace personnel."
      currentHostType={currentHostType}
      session={session}
      isDtscInternal={isDtscInternalSession(session)}
    >
      <Suspense><AuthForm mode="sign-up" /></Suspense>
    </AccountProductShell>
  );
}
