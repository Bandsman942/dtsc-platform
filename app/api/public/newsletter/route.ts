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
      `<p>Un visiteur souhaite recevoir les contenus DTSC.</p>`,
      `<p><strong>Nom :</strong> ${escapeHtml(body.data.name)}</p>`,
      `<p><strong>Email :</strong> ${escapeHtml(body.data.email)}</p>`,
      `<p><strong>Entreprise :</strong> ${escapeHtml(body.data.companyName || "Non renseignée")}</p>`,
      `<p><strong>Intérêt :</strong> ${escapeHtml(body.data.interest || "Non renseigné")}</p>`,
      `<p><strong>ID abonné :</strong> ${escapeHtml(subscriber.id)}</p>`,
    ].join(""),
    message: [
      "Un visiteur souhaite recevoir les contenus DTSC.",
      `Nom: ${body.data.name}`,
      `Email: ${body.data.email}`,
      `Entreprise: ${body.data.companyName || "Non renseignée"}`,
      `Intérêt: ${body.data.interest || "Non renseigné"}`,
      `ID abonné: ${subscriber.id}`,
    ].join("\n"),
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho webhook failed" }));

  await writeApiLog({ request: req, statusCode: 200, startedAt, metadata: { action: "newsletter_subscription", subscriberId: subscriber.id, zohoSent: zoho.sent } });

  return NextResponse.json({ ok: true, zoho });
}
