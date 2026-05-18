import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { newsletterSubscriptionSchema } from "@/lib/validators";
import { sendZohoMailWebhook } from "@/lib/zoho-mail";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { writeApiLog } from "@/lib/audit";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const limiter = await rateLimit(getRateLimitKey(req, "public:newsletter"), 8, 60 * 60 * 1000);
  if (!limiter.ok) {
    await writeApiLog({ request: req, statusCode: 429, startedAt });
    return NextResponse.json(
      { error: "Too many newsletter requests", resetAt: new Date(limiter.resetAt).toISOString() },
      { status: 429 }
    );
  }

  const body = newsletterSubscriptionSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, startedAt });
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const subscriber = await prisma.newsletterSubscriber.upsert({
    where: { email: body.data.email },
    update: {
      name: body.data.name,
      companyName: body.data.companyName || null,
      interest: body.data.interest || null,
      consent: body.data.consent,
      status: "ACTIVE",
    },
    create: {
      name: body.data.name,
      email: body.data.email,
      companyName: body.data.companyName || null,
      interest: body.data.interest || null,
      consent: body.data.consent,
      source: "landing",
    },
  });

  const zoho = await sendZohoMailWebhook({
    subject: "Nouvelle inscription newsletter DTSC",
    to: [env.DTSC_CONTACT_EMAIL],
    fromName: body.data.name,
    fromEmail: body.data.email,
    replyTo: body.data.email,
    source: "landing-newsletter",
    heading: "Inscription newsletter DTSC",
    htmlMessage: [
      `<p>Un visiteur souhaite recevoir les contenus DTSC. Cette fiche peut être suivie depuis Administration &gt; Utilisateurs &gt; Inscrits newsletter.</p>`,
      `<table style="width:100%;border-collapse:collapse;">`,
      `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">Nom</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(body.data.name)}</td></tr>`,
      `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">Email</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(body.data.email)}</td></tr>`,
      `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">Entreprise</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(body.data.companyName || "Non renseignée")}</td></tr>`,
      `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">Intérêt</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(body.data.interest || "Non renseigné")}</td></tr>`,
      `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">ID abonné</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(subscriber.id)}</td></tr>`,
      `</table>`,
    ].join(""),
    message: [
      "Un visiteur souhaite recevoir les contenus DTSC.",
      "",
      "Profil newsletter",
      `- Nom: ${body.data.name}`,
      `- Email: ${body.data.email}`,
      `- Entreprise: ${body.data.companyName || "Non renseignée"}`,
      `- Intérêt: ${body.data.interest || "Non renseigné"}`,
      `- ID abonné: ${subscriber.id}`,
      "",
      "Action recommandée: suivre cette fiche dans Administration > Utilisateurs > Inscrits newsletter.",
    ].join("\n"),
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho webhook failed" }));

  await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { action: "newsletter_subscription", subscriberId: subscriber.id, zohoSent: zoho.sent } });

  return NextResponse.json({ ok: true, zoho });
}
