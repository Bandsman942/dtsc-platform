import { NextResponse } from "next/server";
import { canModerateAnnouncement, canReadAnnouncement } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getAppSettings } from "@/lib/settings";
import { authorizedCollaboratorIds } from "@/lib/standard-collaboration";
import { announcementCommentUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

function canEdit(createdAt: Date, windowMinutes: number, isAuthor: boolean, moderator: boolean) {
  return moderator || (isAuthor && Date.now() <= createdAt.getTime() + windowMinutes * 60 * 1000);
}

async function getScopedComment(id: string) {
  return prisma.announcementComment.findUnique({
    where: { id },
    include: { announcement: { select: { id: true, authorId: true, organizationId: true, scope: true, moderationStatus: true, status: true, deletedAt: true } } },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-comment-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = announcementCommentUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const [settings, comment] = await Promise.all([getAppSettings(), getScopedComment(id)]);
  if (!comment || !canReadAnnouncement(comment.announcement, session)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const moderator = await canModerateAnnouncement(session, comment.announcement);
  const isAuthor = comment.userId === session.userId;

  if (parsed.data.action === "RESTORE") {
    if (!comment.deletedAt || (!moderator && !isAuthor)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const restored = await prisma.announcementComment.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, restoredAt: new Date(), moderationStatus: "VISIBLE" },
    });
    await writeAuditLog({ userId: session.userId, action: "announcement.comment.restore", entity: "AnnouncementComment", entityId: id, request: req });
    return NextResponse.json({ ok: true, comment: restored });
  }

  if (!parsed.data.content || comment.deletedAt || !canEdit(comment.createdAt, settings.commentEditWindowMinutes, isAuthor, moderator)) {
    return NextResponse.json({ error: "EDIT_NOT_ALLOWED" }, { status: 403 });
  }
  const authorizedIds = new Set([...(await authorizedCollaboratorIds(session)), comment.announcement.authorId, session.userId]);
  const mentionedUserIds = [...new Set(parsed.data.mentionedUserIds.filter((userId) => authorizedIds.has(userId) && userId !== session.userId))];
  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.announcementComment.update({ where: { id }, data: { content: parsed.data.content!, editedAt: new Date() } });
    await tx.announcementCommentMention.deleteMany({ where: { commentId: id } });
    if (mentionedUserIds.length) await tx.announcementCommentMention.createMany({ data: mentionedUserIds.map((mentionedUserId) => ({ announcementId: comment.announcementId, commentId: id, mentionedUserId })), skipDuplicates: true });
    return record;
  });
  await writeAuditLog({ userId: session.userId, action: "announcement.comment.update", entity: "AnnouncementComment", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, comment: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const comment = await getScopedComment(id);
  if (!comment || !canReadAnnouncement(comment.announcement, session)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const moderator = await canModerateAnnouncement(session, comment.announcement);
  if (comment.userId !== session.userId && !moderator) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!comment.deletedAt) {
    await prisma.announcementComment.update({
      where: { id },
      data: { content: "Commentaire supprimé", deletedAt: new Date(), deletedById: session.userId, moderationStatus: moderator && comment.userId !== session.userId ? "MODERATED" : "DELETED" },
    });
  }
  await writeAuditLog({ userId: session.userId, action: moderator && comment.userId !== session.userId ? "announcement.comment.moderate" : "announcement.comment.delete", entity: "AnnouncementComment", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
