import { AccountProductShell } from "@/components/auth/account-product-shell";
import { ForgotPasswordForm } from "@/components/auth/account-recovery-form";

export default function ForgotPasswordPage() {
  return (
    <AccountProductShell eyebrow="Récupération sécurisée" title="Mot de passe oublié" description="Recevez un lien à usage unique sans révéler si une adresse possède un compte DTSC.">
      <ForgotPasswordForm />
    </AccountProductShell>
  );
}
