import { Suspense } from "react";
import { headers } from "next/headers";
import { AccountProductShell } from "@/components/auth/account-product-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/auth";
import { getCurrentHostType } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";

export default async function SignUpPage() {
  const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
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
