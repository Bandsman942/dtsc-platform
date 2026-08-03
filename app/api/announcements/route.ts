import { UserRole, UserStatus, type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { resolveAnnouncementScope } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { announcementNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { sanitizeRichHtml } from "@/lib/rich-content";
import { getAppSettings } from "@/lib/settings";
import { announcementSchema } from "@/lib/validators";

function canPublishAnnouncement(role: UserRole, allowClients: boolean) {
  return allowClients || role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-create:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const settings = await getAppSettings();
  if (!canPublishAnnouncement(session.role, settings.allowClientAnnouncements)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = announcementSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.scheduledAt) return NextResponse.json({ error: "SCHEDULING_NOT_AVAILABLE", message: "La programmation n’est pas activée tant qu’un service d’exécution fiable n’est pas configuré." }, { status: 409 });

  const resolved = resolveAnnouncementScope(parsed.data.scope, session);
  const isDraft = parsed.data.publicationMode === "DRAFT";
  const now = new Date();
  const announcement = await prisma.announcement.create({
    data: {
      authorId: session.userId,
      title: parsed.data.title,
      content: parsed.data.contentHtml ? sanitizeRichHtml(parsed.data.contentHtml) : parsed.data.content,
      scope: resolved.scope,
      organizationId: resolved.organizationId,
      audienceJson: parsed.data.audience || {},
      commentsEnabled: parsed.data.commentsEnabled ?? true,
      status: isDraft ? "DRAFT" : "PUBLISHED",
      moderationStatus: isDraft ? "DRAFT" : "PUBLISHED",
      publishedAt: isDraft ? null : now,
      lastAction: isDraft ? "Brouillon créé" : "Annonce publiée",
    },
  });

  if (!isDraft) {
    const recipientWhere: Prisma.UserWhereInput = resolved.scope === "ORGANIZATION_ONLY" && resolved.organizationId
      ? { status: UserStatus.ACTIVE, organizationMemberships: { some: { organizationId: resolved.organizationId, status: "ACTIVE", removedAt: null } } }
      : { status: UserStatus.ACTIVE };
    const recipients = await prisma.user.findMany({ where: recipientWhere, select: { id: true }, take: 5000 });
    await Promise.all(recipients.filter((user) => user.id !== session.userId).map((user) => notifyUser({
      userId: user.id,
      title: resolved.scope === "DTSC_OFFICIAL" ? "Nouvelle annonce officielle DTSC" : "Nouvelle annonce",
      body: parsed.data.title,
      type: "ANNOUNCEMENT",
      targetUrl: announcementNotificationTarget(announcement.id),
      organizationId: resolved.organizationId,
      idempotencyKey: `announcement:published:${announcement.id}:${user.id}`,
    })));
  }

  await writeAuditLog({ userId: session.userId, action: isDraft ? "announcement.draft.create" : "announcement.publish", entity: "Announcement", entityId: announcement.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { scope: resolved.scope, draft: isDraft } });
  return NextResponse.json({ ok: true, announcement }, { status: 201 });
}
