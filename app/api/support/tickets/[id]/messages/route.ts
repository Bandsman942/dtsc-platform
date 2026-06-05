import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { canUserAccessSupportTicket } from "@/lib/support-access";
import { ticketMessageSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "support_ticket_message_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `support-ticket-message:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de messages support sur une courte période." }, { status: 429 });
  }

  const body = ticketMessageSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, userId: true, organizationId: true, subject: true },
  });

  if (!ticket) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canUserAccessSupportTicket(ticket, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      userId: session.userId,
      content: body.data.content,
    },
  });

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "IN_PROGRESS" },
  });

  if (ticket.userId === session.userId) {
    const supportUsers = await prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPPORT] },
        status: UserStatus.ACTIVE,
        organizationMemberships: {
          some: { organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null },
        },
      },
      select: { id: true },
    });
    await notifyUsers({
      userIds: supportUsers.map((user) => user.id),
      title: "Nouveau message client sur ticket",
      body: ticket.subject,
      type: "SUPPORT",
      targetUrl: "/support",
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
    }).catch(() => null);
  } else {
    await notifyUser({
      userId: ticket.userId,
      title: "Réponse DTSC sur votre ticket",
      body: ticket.subject,
      type: "SUPPORT",
      targetUrl: "/support",
      organizationId: ticket.organizationId,
    }).catch(() => null);
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { ticketId: ticket.id, messageId: message.id } });
  return NextResponse.json({ ok: true, message });
}
