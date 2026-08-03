import { UserRole, type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { canReadAnnouncement } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { announcementNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { announcementReportSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-report:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = announcementReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, title: true, authorId: true, scope: true, organizationId: true, moderationStatus: true, status: true, deletedAt: true },
  });
  if (!announcement || !canReadAnnouncement(announcement, session)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const report = await prisma.$transaction(async (tx) => {
    const saved = await tx.announcementReport.create({
      data: {
        announcementId: id,
        reporterId: session.userId,
        reason: parsed.data.reason,
        description: parsed.data.description || null,
        priority: parsed.data.priority,
      },
    });
    await tx.announcement.update({ where: { id }, data: { reportCount: { increment: 1 }, lastAction: "Signalement reçu" } });
    return saved;
  });

  const moderatorWhere: Prisma.UserWhereInput = announcement.organizationId
    ? {
        organizationMemberships: {
          some: { organizationId: announcement.organizationId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN"] } },
        },
      }
    : { role: { in: [UserRole.ADMIN, UserRole.SUPPORT] } };
  const moderators = await prisma.user.findMany({ where: moderatorWhere, select: { id: true }, take: 100 });
  await Promise.all(moderators.map((moderator) => notifyUser({
    userId: moderator.id,
    title: "Signalement d’annonce",
    body: `${session.name} a signalé : ${announcement.title}`,
    type: "ANNOUNCEMENT",
    targetUrl: announcementNotificationTarget(announcement.id),
    organizationId: announcement.organizationId,
    idempotencyKey: `announcement:report:${report.id}:${moderator.id}`,
  })));

  await writeAuditLog({ userId: session.userId, action: "announcement.report", entity: "AnnouncementReport", entityId: report.id, metadata: { announcementId: id }, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, report }, { status: 201 });
}
