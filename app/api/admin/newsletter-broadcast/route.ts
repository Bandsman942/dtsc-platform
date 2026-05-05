import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { massMailSchema } from "@/lib/validators";
import { sendZohoMailWebhook, sendZohoOutboundMail } from "@/lib/zoho-mail";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = massMailSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid mailing" }, { status: 400 });
  }

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { status: "ACTIVE", consent: true },
    select: { email: true },
    take: 5000,
  });
  const emails = subscribers.map((subscriber) => subscriber.email);

  const mailPayload = {
    subject: body.data.subject,
    message: body.data.content,
    to: emails,
    cc: [env.DTSC_CONTACT_EMAIL],
    source: "admin-newsletter-broadcast",
  };
  const outbound = await sendZohoOutboundMail(mailPayload).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho outbound failed" }));
  const zoho = outbound.sent
    ? outbound
    : await sendZohoMailWebhook(mailPayload).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho webhook failed" }));

  return NextResponse.json({ ok: true, emails, zoho });
}
