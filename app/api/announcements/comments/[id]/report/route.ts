import { NextResponse } from "next/server";
import { canReadAnnouncement } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationContentReportSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-comment-report:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = collaborationContentReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const comment = await prisma.announcementComment.findUnique({
    where: { id },
    include: { announcement: { select: { id: true, scope: true, organizationId: true, moderationStatus: true, status: true, deletedAt: true } } },
  });
  if (!comment || !canReadAnnouncement(comment.announcement, session)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const report = await prisma.announcementCommentReport.create({
    data: { announcementId: comment.announcementId, commentId: id, reporterId: session.userId, reason: parsed.data.reason, description: parsed.data.description || null, priority: parsed.data.priority },
  });
  await writeAuditLog({ userId: session.userId, action: "announcement.comment.report", entity: "AnnouncementCommentReport", entityId: report.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, report }, { status: 201 });
}
