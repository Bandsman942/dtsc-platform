import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";
import { broadcastSchema } from "@/lib/validators";
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

    const body = broadcastSchema.safeParse(await req.json());
    if (!body.success) {
      await writeApiLog({
        request: req,
        statusCode: 400,
        userId: session.userId,
        startedAt,
        metadata: { reason: "invalid_broadcast_payload", issues: body.error.issues.map((issue) => issue.path.join(".")) },
      });
      return NextResponse.json(
        {
          error: "Invalid broadcast",
          message: "Vérifiez le titre et le contenu de la diffusion. Le titre et le message doivent contenir au moins 3 caractères.",
        },
        { status: 400 }
      );
    }

    const users = await prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true, email: true, name: true },
    });

    await notifyUsers({
      userIds: users.map((user) => user.id),
      title: body.data.title,
      body: body.data.body,
      type: body.data.type,
      targetUrl: "/notifications",
    });

    const emails = users.map((user) => user.email);
    const mailPayload = {
      subject: body.data.title,
      to: emails,
      message: body.data.body,
      htmlMessage: body.data.bodyHtml || undefined,
      heading: "Admin-DTSC",
      source: "admin-broadcast",
    };
    const hasUserPlaceholder = /\{user\}/i.test(`${body.data.body} ${body.data.bodyHtml || ""}`);
    const outbound = hasUserPlaceholder
      ? await sendPersonalizedZohoOutboundMail(users, mailPayload).catch((error) => ({
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
    const message = error instanceof Error ? error.message : "Unexpected broadcast failure";
    console.error("Admin broadcast failed", error);
    await writeApiLog({
      request: req,
      statusCode: 500,
      userId: sessionUserId,
      startedAt,
      metadata: { reason: message.slice(0, 240) },
    });

    return NextResponse.json(
      {
        error: "Broadcast failed",
        message: "La diffusion n'a pas pu être traitée côté serveur. Vérifiez les logs Vercel et les variables Zoho Mail.",
        details: message,
      },
      { status: 500 }
    );
  }
}
