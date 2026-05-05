import { env } from "@/lib/env";
import { dtsc } from "@/lib/dtsc";

type ZohoMailPayload = {
  subject: string;
  message: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  source?: string;
};

export async function sendZohoMailWebhook({
  subject,
  message,
  fromName,
  fromEmail,
  replyTo,
  source,
}: ZohoMailPayload) {
  if (!env.ZOHO_MAIL_WEBHOOK_URL) {
    return { sent: false, reason: "ZOHO_MAIL_WEBHOOK_URL is not configured" };
  }

  const formattedMessage = [
    `Destinataire DTSC: ${env.DTSC_CONTACT_EMAIL || dtsc.email}`,
    `Objet: ${subject}`,
    fromName ? `Nom: ${fromName}` : null,
    fromEmail ? `Email: ${fromEmail}` : null,
    replyTo ? `Répondre à: ${replyTo}` : null,
    source ? `Source: ${source}` : null,
    "",
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(env.ZOHO_MAIL_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: formattedMessage }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Zoho webhook failed with status ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`);
  }

  return { sent: true };
}
