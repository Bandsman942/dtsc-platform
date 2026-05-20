import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canManageGroup } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const message = await prisma.collaborationGroupMessage.findUnique({
    where: { id },
    include: {
      group: {
        include: {
          members: {
            where: { status: "ACTIVE" },
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } } },
          },
        },
      },
      reads: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } } },
        orderBy: { readAt: "desc" },
      },
    },
  });
  const currentMember = message?.group.members.find((member) => member.userId === session.userId) || null;
  if (!message || !currentMember) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Accès refusé." }, { status: 403 });
  }
  if (message.authorId !== session.userId && !canManageGroup(currentMember, session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Seul l'auteur, le propriétaire ou un admin du groupe peut voir les accusés de lecture." }, { status: 403 });
  }

  const readUserIds = new Set(message.reads.map((read) => read.userId));
  const readBy = message.reads.map((read) => ({ user: read.user, readAt: read.readAt }));
  const unreadBy = message.group.members
    .filter((member) => !readUserIds.has(member.userId))
    .map((member) => ({ user: member.user }));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ readBy, unreadBy });
}
