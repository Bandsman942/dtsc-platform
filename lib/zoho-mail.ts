import { env } from "@/lib/env";
import { dtsc } from "@/lib/dtsc";
import { sanitizeRichHtml } from "@/lib/rich-content";

type ZohoMailPayload = {
  subject: string;
  message: string;
  htmlMessage?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  source?: string;
  heading?: string;
  showRecipients?: boolean;
  showSource?: boolean;
  deliveryMode?: "broadcast" | "direct";
};

type PersonalizedZohoRecipient = {
  email: string;
  name?: string | null;
};

function uniqueEmails(emails: string[] = []) {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
}

function contactEmail() {
  return (env.DTSC_CONTACT_EMAIL || dtsc.email).trim().toLowerCase();
}

function normalizeMessage(message: string) {
  return message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const withProtocol = value.startsWith("//") ? `https:${value}` : value;
  return withProtocol.replace(/\/+$/, "");
}

function getZohoAccountsBaseUrl() {
  if (env.ZOHO_ACCOUNTS_API_BASE_URL) {
    return normalizeBaseUrl(env.ZOHO_ACCOUNTS_API_BASE_URL, "https://accounts.zoho.com");
  }

  const mailBaseUrl = normalizeBaseUrl(env.ZOHO_MAIL_API_BASE_URL, "https://mail.zoho.com");
  const host = new URL(mailBaseUrl).host;
  if (host.endsWith(".eu")) {
    return "https://accounts.zoho.eu";
  }
  if (host.endsWith(".in")) {
    return "https://accounts.zoho.in";
  }
  if (host.endsWith(".com.au")) {
    return "https://accounts.zoho.com.au";
  }
  if (host.endsWith(".jp")) {
    return "https://accounts.zoho.jp";
  }

  return "https://accounts.zoho.com";
}

function isZohoMailApiConfigured() {
  return Boolean(
    env.ZOHO_MAIL_ACCOUNT_ID &&
      env.ZOHO_MAIL_CLIENT_ID &&
      env.ZOHO_MAIL_CLIENT_SECRET &&
      env.ZOHO_MAIL_REFRESH_TOKEN
  );
}

async function getZohoAccessToken() {
  if (!isZohoMailApiConfigured()) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.ZOHO_MAIL_CLIENT_ID || "",
    client_secret: env.ZOHO_MAIL_CLIENT_SECRET || "",
    refresh_token: env.ZOHO_MAIL_REFRESH_TOKEN || "",
  });
  const response = await fetch(`${getZohoAccountsBaseUrl()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Zoho OAuth failed with status ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Zoho OAuth response did not include access_token");
  }

  return data.access_token;
}

async function sendZohoMailApi(payload: ZohoMailPayload) {
  const recipients = uniqueEmails(payload.to).filter((email) => email !== contactEmail());
  if (!recipients.length) {
    return { sent: false, reason: "No recipients" };
  }

  const accessToken = await getZohoAccessToken();
  if (!accessToken) {
    return { sent: false, reason: "Zoho Mail API is not configured" };
  }

  const mailBaseUrl = normalizeBaseUrl(env.ZOHO_MAIL_API_BASE_URL, "https://mail.zoho.com");
  const accountId = env.ZOHO_MAIL_ACCOUNT_ID || "";
  const fromAddress = env.ZOHO_MAIL_FROM_ADDRESS || contactEmail();
  const endpoint = `${mailBaseUrl}/api/accounts/${accountId}/messages`;

  if (payload.deliveryMode === "direct") {
    let sent = 0;
    for (const recipient of recipients) {
      const content = buildProfessionalMailHtml({
        ...payload,
        to: [recipient],
        cc: [],
        bcc: [],
        showRecipients: false,
        showSource: false,
      });
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
        body: JSON.stringify({
          fromAddress,
          toAddress: recipient,
          subject: payload.subject,
          content,
          mailFormat: "html",
          askReceipt: "no",
        }),
      });

      if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`Zoho Mail API failed with status ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`);
      }
      sent += 1;
    }

    return { sent: true, provider: "zoho-mail-api", recipients: sent, deliveryMode: "direct" };
  }

  const toAddress = contactEmail();
  const ccAddress = uniqueEmails(payload.cc).filter((email) => email !== toAddress).join(",");
  const bccAddress = uniqueEmails([...recipients, ...(payload.bcc || [])]).filter((email) => email !== toAddress).join(",");
  const content = buildProfessionalMailHtml({
    ...payload,
    to: [toAddress],
    cc: ccAddress ? ccAddress.split(",") : [],
    bcc: bccAddress ? bccAddress.split(",") : [],
    showRecipients: false,
    showSource: false,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
    body: JSON.stringify({
      fromAddress,
      toAddress,
      ccAddress,
      bccAddress,
      subject: payload.subject,
      content,
      mailFormat: "html",
      askReceipt: "no",
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Zoho Mail API failed with status ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`);
  }

  return { sent: true, provider: "zoho-mail-api", to: toAddress, recipients: recipients.length, bcc: recipients.length };
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
  heading,
  showRecipients = false,
  showSource = false,
}: ZohoMailPayload) {
  const recipients = uniqueEmails(to);
  const copy = uniqueEmails(cc);
  const blindCopy = uniqueEmails(bcc);

  return [
    "DTSC - Data and Tech Solutions Consulting",
    "Le numérique au service de votre performance",
    "",
    `Objet : ${subject}`,
    heading || null,
    showRecipients && recipients.length ? `À : ${recipients.join(", ")}` : null,
    showRecipients && copy.length ? `Copie : ${copy.join(", ")}` : null,
    showRecipients && blindCopy.length ? `Copie cachée : ${blindCopy.join(", ")}` : null,
    fromName ? `Expéditeur : ${fromName}` : null,
    fromEmail ? `Email expéditeur : ${fromEmail}` : null,
    replyTo ? `Répondre à : ${replyTo}` : null,
    showSource && source ? `Source : ${source}` : null,
    "",
    normalizeMessage(message),
    "",
    "Coordonnées DTSC",
    `Email : ${contactEmail()}`,
    `WhatsApp : ${dtsc.whatsapp}`,
    `Réseaux sociaux : ${dtsc.socialHandle}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildProfessionalMailHtml({
  subject,
  message,
  htmlMessage,
  to = [],
  cc = [],
  bcc = [],
  fromName,
  fromEmail,
  replyTo,
  source,
  heading,
  showRecipients = false,
  showSource = false,
}: ZohoMailPayload) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  const richHtml = htmlMessage ? sanitizeRichHtml(htmlMessage) : "";
  const paragraphHtml = richHtml
    ? `<div style="font-size:15px;color:#334155;line-height:1.7;">${richHtml}</div>`
    : normalizeMessage(message)
        .split(/\n{2,}/)
        .map((paragraph) => `<p style="margin:0 0 14px;line-height:1.7;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
        .join("");
  const recipients = uniqueEmails(to);
  const copy = uniqueEmails(cc);
  const blindCopy = uniqueEmails(bcc);
  const hasMeta =
    (showRecipients && (recipients.length > 0 || copy.length > 0 || blindCopy.length > 0)) ||
    Boolean(fromName || fromEmail || replyTo || (showSource && source));

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:24px;">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:18px;overflow:hidden;">
      <div style="background:#001736;color:#ffffff;padding:24px 28px;">
        <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#67e8f9;">DTSC - Data and Tech Solutions Consulting</div>
        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;">${escapeHtml(subject)}</h1>
        ${heading ? `<p style="margin:10px 0 0;font-size:14px;color:#bfdbfe;">${escapeHtml(heading)}</p>` : ""}
      </div>
      <div style="padding:24px 28px;">
        ${
          hasMeta
            ? `<table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:14px;">
          ${showRecipients && recipients.length ? `<tr><td style="padding:8px 0;color:#64748b;width:130px;font-weight:700;">À</td><td style="padding:8px 0;">${escapeHtml(recipients.join(", "))}</td></tr>` : ""}
          ${showRecipients && copy.length ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Copie</td><td style="padding:8px 0;">${escapeHtml(copy.join(", "))}</td></tr>` : ""}
          ${showRecipients && blindCopy.length ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Copie cachée</td><td style="padding:8px 0;">${escapeHtml(blindCopy.join(", "))}</td></tr>` : ""}
          ${fromName ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Expéditeur</td><td style="padding:8px 0;">${escapeHtml(fromName)}</td></tr>` : ""}
          ${fromEmail ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Email</td><td style="padding:8px 0;">${escapeHtml(fromEmail)}</td></tr>` : ""}
          ${replyTo ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Répondre à</td><td style="padding:8px 0;">${escapeHtml(replyTo)}</td></tr>` : ""}
          ${showSource && source ? `<tr><td style="padding:8px 0;color:#64748b;font-weight:700;">Source</td><td style="padding:8px 0;">${escapeHtml(source)}</td></tr>` : ""}
        </table>`
            : ""
        }
        <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
          ${paragraphHtml}
        </div>
      </div>
      <div style="background:#f1f5f9;padding:18px 28px;font-size:13px;color:#475569;">
        <strong>DTSC</strong> · ${escapeHtml(contactEmail())} · ${escapeHtml(dtsc.whatsapp)} · ${escapeHtml(dtsc.socialHandle)}
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
    body: JSON.stringify({
      message: buildProfessionalMailText({ ...payload, showRecipients: false, showSource: false }),
    }),
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

  const apiResult = await sendZohoMailApi({ ...payload, to: recipients }).catch((error) => ({
    sent: false,
    reason: error instanceof Error ? error.message : "Zoho Mail API failed",
  }));
  if (apiResult.sent) {
    return apiResult;
  }
  const apiReason = "reason" in apiResult ? apiResult.reason : undefined;

  if (!env.ZOHO_OUTBOUND_MAIL_WEBHOOK_URL) {
    return apiReason
      ? { sent: false, reason: apiReason }
      : { sent: false, reason: "ZOHO_OUTBOUND_MAIL_WEBHOOK_URL is not configured" };
  }

  if (payload.deliveryMode === "direct") {
    const safePayload = {
      ...payload,
      cc: uniqueEmails(payload.cc),
      bcc: uniqueEmails(payload.bcc),
      showRecipients: false,
      showSource: false,
    };
    const textContent = buildProfessionalMailText(safePayload);
    const htmlContent = buildProfessionalMailHtml(safePayload);
    const fromEmail = env.ZOHO_MAIL_FROM_ADDRESS || contactEmail();
    const replyTo = payload.replyTo || fromEmail;
    const response = await fetch(env.ZOHO_OUTBOUND_MAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipients,
        toText: recipients.join(","),
        cc: safePayload.cc,
        ccText: safePayload.cc.join(","),
        bcc: safePayload.bcc,
        bccText: safePayload.bcc.join(","),
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

    return { sent: true, recipients: recipients.length, deliveryMode: "direct" };
  }

  const toAddress = contactEmail();
  const cc = uniqueEmails(payload.cc).filter((email) => email !== toAddress);
  const bcc = uniqueEmails([...recipients, ...(payload.bcc || [])]).filter((email) => email !== toAddress);
  const safePayload = {
    ...payload,
    to: [toAddress],
    cc,
    bcc,
    showRecipients: false,
    showSource: false,
  };
  const textContent = buildProfessionalMailText(safePayload);
  const htmlContent = buildProfessionalMailHtml(safePayload);
  const fromEmail = env.ZOHO_MAIL_FROM_ADDRESS || toAddress;
  const replyTo = payload.replyTo || toAddress;
  const response = await fetch(env.ZOHO_OUTBOUND_MAIL_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: [toAddress],
      toText: toAddress,
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

  return { sent: true, to: toAddress, recipients: recipients.length, bcc: bcc.length };
}

export async function sendPersonalizedZohoOutboundMail(
  recipients: PersonalizedZohoRecipient[],
  payload: ZohoMailPayload
) {
  const validRecipients = recipients
    .map((recipient) => ({
      email: recipient.email.trim().toLowerCase(),
      name: recipient.name?.trim() || "client DTSC",
    }))
    .filter((recipient) => recipient.email && recipient.email !== contactEmail());

  if (!validRecipients.length) {
    return { sent: false, reason: "No recipients" };
  }

  const results = [];
  for (const recipient of validRecipients) {
    const personalizedMessage = payload.message.replace(/\{user\}/gi, recipient.name);
    const personalizedHtml = payload.htmlMessage?.replace(/\{user\}/gi, recipient.name);
    const result = await sendZohoOutboundMail({
      ...payload,
      to: [recipient.email],
      message: personalizedMessage,
      htmlMessage: personalizedHtml,
      showRecipients: false,
      showSource: false,
    }).catch((error) => ({
      sent: false,
      reason: error instanceof Error ? error.message : "Zoho personalized mail failed",
    }));

    results.push({ email: recipient.email, ...result });
  }

  const sent = results.filter((result) => result.sent).length;
  return {
    sent: sent > 0,
    personalized: true,
    recipients: validRecipients.length,
    delivered: sent,
    failed: validRecipients.length - sent,
  };
}
