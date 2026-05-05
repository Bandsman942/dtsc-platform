import { env } from "@/lib/env";
import { dtsc } from "@/lib/dtsc";

type ZohoMailPayload = {
  subject: string;
  message: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  source?: string;
};

function uniqueEmails(emails: string[] = []) {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
}

function normalizeMessage(message: string) {
  return message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function buildProfessionalMailText({
  subject,
  message,
  to = [],
  cc = [],
  bcc = [],
  fromName,
  fromEmail,
  replyTo,
  source,
}: ZohoMailPayload) {
  const recipients = uniqueEmails(to);
  const contactEmail = (env.DTSC_CONTACT_EMAIL || dtsc.email).toLowerCase();
  const copy = uniqueEmails(cc.length ? cc : recipients.includes(contactEmail) ? [] : [contactEmail]);
  const blindCopy = uniqueEmails(bcc);

  return [
    "DTSC - Data and Tech Solutions Consulting",
    "Le numérique au service de votre performance",
    "",
    `Objet : ${subject}`,
    recipients.length ? `À : ${recipients.join(", ")}` : null,
    copy.length ? `Copie : ${copy.join(", ")}` : null,
    blindCopy.length ? `Copie cachée : ${blindCopy.join(", ")}` : null,
    fromName ? `Expéditeur : ${fromName}` : null,
    fromEmail ? `Email expéditeur : ${fromEmail}` : null,
    replyTo ? `Répondre à : ${replyTo}` : null,
    source ? `Source : ${source}` : null,
    "",
    "Contenu",
    "-------",
    normalizeMessage(message),
    "",
    "Coordonnées DTSC",
    `Email : ${env.DTSC_CONTACT_EMAIL || dtsc.email}`,
    `WhatsApp : ${dtsc.whatsapp}`,
    `Réseaux sociaux : ${dtsc.socialHandle}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildProfessionalMailHtml({
  subject,
  message,
  to = [],
  cc = [],
  bcc = [],
  fromName,
  fromEmail,
  replyTo,
  source,
}: ZohoMailPayload) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  const paragraphHtml = normalizeMessage(message)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px;line-height:1.7;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
  const recipients = uniqueEmails(to);
  const contactEmail = (env.DTSC_CONTACT_EMAIL || dtsc.email).toLowerCase();
  const copy = uniqueEmails(cc.length ? cc : recipients.includes(contactEmail) ? [] : [contactEmail]);
  const blindCopy = uniqueEmails(bcc);

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:24px;">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:18px;overflow:hidden;">
      <div style="background:#001736;color:#ffffff;padding:24px 28px;">
        <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#67e8f9;">DTSC - Data and Tech Solutions Consulting</div>
        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;">${escapeHtml(subject)}</h1>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:14px;">
          ${recipients.length ? `<tr><td style="padding:8px 0;color:#64748b;width:130px;font-weight:700;">À</td><td style="padding:8px 0;">${escapeHtml(recipients.join(", "))}</td></tr>` : ""}
          ${copy.length ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Copie</td><td style="padding:8px 0;">${escapeHtml(copy.join(", "))}</td></tr>` : ""}
          ${blindCopy.length ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Copie cachée</td><td style="padding:8px 0;">${escapeHtml(blindCopy.join(", "))}</td></tr>` : ""}
          ${fromName ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Expéditeur</td><td style="padding:8px 0;">${escapeHtml(fromName)}</td></tr>` : ""}
          ${fromEmail ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Email</td><td style="padding:8px 0;">${escapeHtml(fromEmail)}</td></tr>` : ""}
          ${replyTo ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Répondre à</td><td style="padding:8px 0;">${escapeHtml(replyTo)}</td></tr>` : ""}
          ${source ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Source</td><td style="padding:8px 0;">${escapeHtml(source)}</td></tr>` : ""}
        </table>
        <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
          <h2 style="margin:0 0 14px;font-size:16px;color:#002b5b;">Contenu</h2>
          <div style="font-size:15px;color:#334155;">${paragraphHtml}</div>
        </div>
      </div>
      <div style="background:#f1f5f9;padding:18px 28px;font-size:13px;color:#475569;">
        <strong>DTSC</strong> · ${escapeHtml(env.DTSC_CONTACT_EMAIL || dtsc.email)} · ${escapeHtml(dtsc.whatsapp)} · ${escapeHtml(dtsc.socialHandle)}
      </div>
    </div>
  </div>`;
}

export async function sendZohoMailWebhook(payload: ZohoMailPayload) {
  if (!env.ZOHO_MAIL_WEBHOOK_URL) {
    return { sent: false, reason: "ZOHO_MAIL_WEBHOOK_URL is not configured" };
  }

  const response = await fetch(env.ZOHO_MAIL_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: buildProfessionalMailText(payload) }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Zoho webhook failed with status ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`);
  }

  return { sent: true };
}

export async function sendZohoOutboundMail(payload: ZohoMailPayload) {
  const recipients = uniqueEmails(payload.to);
  if (!recipients.length) {
    return { sent: false, reason: "No recipients" };
  }

  if (!env.ZOHO_OUTBOUND_MAIL_WEBHOOK_URL) {
    return { sent: false, reason: "ZOHO_OUTBOUND_MAIL_WEBHOOK_URL is not configured" };
  }

  const cc = uniqueEmails(payload.cc?.length ? payload.cc : [env.DTSC_CONTACT_EMAIL || dtsc.email]);
  const bcc = uniqueEmails(payload.bcc);
  const textContent = buildProfessionalMailText({ ...payload, to: recipients, cc, bcc });
  const htmlContent = buildProfessionalMailHtml({ ...payload, to: recipients, cc, bcc });
  const fromEmail = env.DTSC_CONTACT_EMAIL || dtsc.email;
  const replyTo = payload.replyTo || fromEmail;
  const response = await fetch(env.ZOHO_OUTBOUND_MAIL_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: recipients,
      toText: recipients.join(","),
      cc,
      ccText: cc.join(","),
      bcc,
      bccText: bcc.join(","),
      subject: payload.subject,
      content: textContent,
      body: textContent,
      html: htmlContent,
      bodyHtml: htmlContent,
      fromEmail,
      fromAddress: fromEmail,
      replyTo,
      source: payload.source,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Zoho outbound mail failed with status ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`);
  }

  return { sent: true, recipients: recipients.length, cc };
}
