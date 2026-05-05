import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notifyUsers } from "@/lib/notifications";
import { supportTicketSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = supportTicketSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid ticket data" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: session.userId,
      subject: body.data.subject,
      description: body.data.description,
      priority: body.data.priority,
    },
  });

  const supportUsers = await prisma.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.SUPPORT] }, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await notifyUsers({
    userIds: supportUsers.map((user) => user.id),
    title: "Nouveau ticket support",
    body: body.data.subject,
    type: "SUPPORT",
  });

  return NextResponse.json({ ticket });
}
