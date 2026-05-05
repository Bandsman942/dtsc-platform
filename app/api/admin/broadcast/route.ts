import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";
import { broadcastSchema } from "@/lib/validators";
import { sendPersonalizedZohoOutboundMail, sendZohoMailWebhook, sendZohoOutboundMail } from "@/lib/zoho-mail";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = broadcastSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid broadcast" }, { status: 400 });
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
    heading: "Admin-DTSC",
    source: "admin-broadcast",
  };
  const hasUserPlaceholder = /\{user\}/i.test(body.data.body);
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

  return NextResponse.json({ ok: true, emails, zoho });
}
