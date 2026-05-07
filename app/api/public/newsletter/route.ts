import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { newsletterSubscriptionSchema } from "@/lib/validators";
import { sendZohoMailWebhook } from "@/lib/zoho-mail";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limiter = await rateLimit(getRateLimitKey(req, "public:newsletter"), 8, 60 * 60 * 1000);
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "Too many newsletter requests", resetAt: new Date(limiter.resetAt).toISOString() },
      { status: 429 }
    );
  }

  const body = newsletterSubscriptionSchema.safeParse(await req.json());
  if (!body.success) {
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
    message: [
      "Un visiteur souhaite recevoir les contenus DTSC.",
      `Nom: ${body.data.name}`,
      `Email: ${body.data.email}`,
      `Entreprise: ${body.data.companyName || "Non renseignée"}`,
      `Intérêt: ${body.data.interest || "Non renseigné"}`,
      `ID abonné: ${subscriber.id}`,
    ].join("\n"),
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho webhook failed" }));

  return NextResponse.json({ ok: true, zoho });
}
