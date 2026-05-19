import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMember, writeGroupAudit } from "@/lib/collaboration";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const member = await assertGroupMember(id, session.userId);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supporters = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE, OR: [{ role: UserRole.ADMIN }, { role: UserRole.SUPPORT }] },
    select: { id: true },
    take: 50,
  });
  const message = await prisma.collaborationGroupMessage.create({
    data: {
      groupId: id,
      authorId: session.userId,
      messageType: "SYSTEM",
      content: `${session.name} demande l'intervention de l'équipe DTSC dans ce groupe.`,
    },
  });
  await notifyUsers({
    userIds: supporters.map((supporter) => supporter.id),
    title: "Demande d'intervention DTSC",
    body: `${session.name} sollicite l'équipe DTSC dans ${member.group.name}.`,
    type: "SUPPORT",
    targetUrl: "/collaborators",
  });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "support.request", entityType: "CollaborationGroupMessage", entityId: message.id });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
