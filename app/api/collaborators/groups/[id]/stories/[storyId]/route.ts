import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, writeGroupAudit } from "@/lib/collaboration";
import { removeCollaborationMedia } from "@/lib/collaboration-media";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string; storyId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-story-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { id, storyId } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const story = await prisma.collaborationGroupStory.findFirst({ where: { id: storyId, groupId: id, deletedAt: null } });
  if (!story) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (story.authorId !== session.userId && !canManageGroup(member, session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.collaborationGroupStory.update({ where: { id: story.id }, data: { deletedAt: new Date() } });
  await removeCollaborationMedia(id, story.storageBucket, story.storagePath);
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "story.delete", entityType: "CollaborationGroupStory", entityId: story.id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
