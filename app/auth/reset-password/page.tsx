import { AccountProductShell } from "@/components/auth/account-product-shell";
import { ResetPasswordForm } from "@/components/auth/account-recovery-form";

type PageProps = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token = "" } = await searchParams;
  return (
    <AccountProductShell eyebrow="Lien à usage unique" title="Nouveau mot de passe" description="Choisissez un mot de passe robuste. Le lien sera invalidé immédiatement après son utilisation.">
      <ResetPasswordForm token={token} />
    </AccountProductShell>
  );
}
