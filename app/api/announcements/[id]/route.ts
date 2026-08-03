import { NextResponse } from "next/server";
import { canModerateAnnouncement, canReadAnnouncement } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { sanitizeRichHtml } from "@/lib/rich-content";
import { getAppSettings } from "@/lib/settings";
import { announcementUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-update:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = announcementUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const [settings, announcement] = await Promise.all([
    getAppSettings(),
    prisma.announcement.findUnique({ where: { id } }),
  ]);
  if (!announcement || (!canReadAnnouncement(announcement, session) && announcement.authorId !== session.userId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const moderator = await canModerateAnnouncement(session, announcement);
  const authorWindowOpen = announcement.authorId === session.userId && Date.now() <= announcement.createdAt.getTime() + settings.announcementEditWindowMinutes * 60 * 1000;
  if (!moderator && !authorWindowOpen) return NextResponse.json({ error: "EDIT_NOT_ALLOWED" }, { status: 403 });
  if (parsed.data.scheduledAt) return NextResponse.json({ error: "SCHEDULING_NOT_AVAILABLE" }, { status: 409 });
  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      title: parsed.data.title,
      content: parsed.data.contentHtml ? sanitizeRichHtml(parsed.data.contentHtml) : parsed.data.content,
      commentsEnabled: parsed.data.commentsEnabled ?? announcement.commentsEnabled,
      version: { increment: 1 },
      lastAction: "Annonce modifiée",
    },
  });
  await writeAuditLog({ userId: session.userId, action: "announcement.update", entity: "Announcement", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, announcement: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement || (!canReadAnnouncement(announcement, session) && announcement.authorId !== session.userId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!(await canModerateAnnouncement(session, announcement))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!announcement.deletedAt) {
    await prisma.announcement.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date(), lastAction: "Annonce supprimée logiquement" } });
  }
  await writeAuditLog({ userId: session.userId, action: "announcement.delete", entity: "Announcement", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
