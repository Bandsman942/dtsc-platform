import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession } from "@/lib/collaboration";
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
  const member = await assertGroupMemberForSession(id, session);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.collaborationMessageMention.updateMany({
    where: {
      mentionedUserId: session.userId,
      isRead: false,
      message: {
        groupId: id,
        deletedAt: null,
      },
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, markedRead: result.count });
}
