import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMember } from "@/lib/collaboration";
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
  const snapshot = await prisma.collaborationSharedConversation.findFirst({
    where: { id, status: "ACTIVE", deletedAt: null },
    include: {
      group: { select: { id: true, name: true } },
      sharedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
  if (!snapshot) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Conversation partagée introuvable." }, { status: 404 });
  }
  const member = await assertGroupMember(snapshot.groupId, session.userId);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n'avez pas accès à cette copie partagée." }, { status: 403 });
  }
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    snapshot: {
      id: snapshot.id,
      title: snapshot.title,
      createdAt: snapshot.createdAt,
      group: snapshot.group,
      sharedBy: snapshot.sharedBy,
      snapshotJson: snapshot.snapshotJson,
    },
  });
}
