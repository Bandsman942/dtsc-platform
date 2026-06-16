import { getSignInUrl } from "@/lib/domains";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

export async function sendEnterpriseInvitationEmail({
  email,
  name,
  organizationName,
  invitedByName,
  role,
  message,
  invitationUrl = getSignInUrl("/enterprise-invitations"),
}: {
  email: string;
  name: string;
  organizationName: string;
  invitedByName?: string | null;
  role: string;
  message?: string | null;
  invitationUrl?: string;
}) {
  return sendZohoOutboundMail({
    deliveryMode: "direct",
    subject: `Invitation à rejoindre ${organizationName} sur DTSC Platform`,
    to: [email],
    heading: "Invitation entreprise DTSC Platform",
    source: "enterprise-invitation",
    message: [
      `Bonjour ${name},`,
      "",
      `Vous êtes invité à rejoindre l'espace privé de ${organizationName} sur DTSC Platform.`,
      invitedByName ? `Invitation envoyée par: ${invitedByName}.` : null,
      `Rôle proposé: ${role}.`,
      message ? `Message: ${message}` : null,
      "",
      "Connectez-vous à votre compte DTSC Platform pour accepter ou refuser l'invitation.",
      invitationUrl,
      "",
      "Equipe DTSC",
    ]
      .filter(Boolean)
      .join("\n"),
  });
}
