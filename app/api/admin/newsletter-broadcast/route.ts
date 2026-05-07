import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { massMailSchema } from "@/lib/validators";
import { sendPersonalizedZohoOutboundMail, sendZohoMailWebhook, sendZohoOutboundMail } from "@/lib/zoho-mail";

export async function POST(req: Request) {
  const startedAt = Date.now();
  let sessionUserId: string | null = null;

  try {
    const session = await getSession();
    sessionUserId = session?.userId || null;
    if (!session || session.role !== UserRole.ADMIN) {
      await writeApiLog({ request: req, statusCode: 403, userId: sessionUserId, startedAt });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = massMailSchema.safeParse(await req.json());
    if (!body.success) {
      await writeApiLog({
        request: req,
        statusCode: 400,
        userId: session.userId,
        startedAt,
        metadata: { reason: "invalid_newsletter_payload", issues: body.error.issues.map((issue) => issue.path.join(".")) },
      });
      return NextResponse.json(
        {
          error: "Invalid mailing",
          message: "Vérifiez l'objet et le contenu. L'objet doit contenir au moins 3 caractères et le contenu au moins 10 caractères.",
        },
        { status: 400 }
      );
    }

    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { status: "ACTIVE", consent: true },
      select: { email: true, name: true },
      take: 5000,
    });
    const emails = subscribers.map((subscriber) => subscriber.email);

    const mailPayload = {
      subject: body.data.subject,
      message: body.data.content,
      to: emails,
      heading: "Admin-DTSC",
      source: "admin-newsletter-broadcast",
    };
    const hasUserPlaceholder = /\{user\}/i.test(body.data.content);
    const outbound = hasUserPlaceholder
      ? await sendPersonalizedZohoOutboundMail(subscribers, mailPayload).catch((error) => ({
          sent: false,
          reason: error instanceof Error ? error.message : "Zoho personalized outbound failed",
        }))
      : await sendZohoOutboundMail(mailPayload).catch((error) => ({
          sent: false,
          reason: error instanceof Error ? error.message : "Zoho outbound failed",
        }));
    const zoho = outbound.sent
      ? outbound
      : await sendZohoMailWebhook(mailPayload).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho webhook failed" }));

    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: { recipients: emails.length, zohoSent: zoho.sent, zohoReason: "reason" in zoho ? zoho.reason || null : null },
    });

    return NextResponse.json({ ok: true, recipientCount: emails.length, zoho });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected newsletter broadcast failure";
    console.error("Admin newsletter broadcast failed", error);
    await writeApiLog({
      request: req,
      statusCode: 500,
      userId: sessionUserId,
      startedAt,
      metadata: { reason: message.slice(0, 240) },
    });

    return NextResponse.json(
      {
        error: "Newsletter broadcast failed",
        message: "La diffusion newsletter n'a pas pu être traitée côté serveur. Vérifiez les logs Vercel et les variables Zoho Mail.",
        details: message,
      },
      { status: 500 }
    );
  }
}
