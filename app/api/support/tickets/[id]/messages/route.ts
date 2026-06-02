import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import { canUserAccessSupportTicket } from "@/lib/support-access";
import { ticketMessageSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = ticketMessageSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, userId: true, organizationId: true, subject: true },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canUserAccessSupportTicket(ticket, session)) {
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
    });
  } else {
    await notifyUser({
      userId: ticket.userId,
      title: "Réponse DTSC sur votre ticket",
      body: ticket.subject,
      type: "SUPPORT",
      targetUrl: "/support",
      organizationId: ticket.organizationId,
    });
  }

  return NextResponse.json({ ok: true, message });
}
