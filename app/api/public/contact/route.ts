import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicContactSchema } from "@/lib/validators";
import { sendZohoMailWebhook } from "@/lib/zoho-mail";

export async function POST(req: Request) {
  const body = publicContactSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid contact request" }, { status: 400 });
  }

  const contactMessage = await prisma.contactMessage.create({
    data: {
      name: body.data.name,
      email: body.data.email,
      phone: body.data.phone || null,
      companyName: body.data.companyName || null,
      subject: body.data.subject,
      message: body.data.message,
      source: body.data.source || "landing",
    },
  });

  const zoho = await sendZohoMailWebhook({
    subject: body.data.subject,
    fromName: body.data.name,
    fromEmail: body.data.email,
    replyTo: body.data.email,
    source: body.data.source || "landing-contact",
    message: [
      body.data.message,
      "",
      "Coordonnées visiteur:",
      `Nom: ${body.data.name}`,
      `Email: ${body.data.email}`,
      `Téléphone: ${body.data.phone || "Non renseigné"}`,
      `Entreprise: ${body.data.companyName || "Non renseignée"}`,
      `ID message: ${contactMessage.id}`,
    ].join("\n"),
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho webhook failed" }));

  return NextResponse.json({ ok: true, zoho });
}
