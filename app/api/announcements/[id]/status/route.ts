import { NextResponse } from "next/server";
import { canModerateAnnouncement } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { announcementStatusSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-status:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = announcementStatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, authorId: true, organizationId: true },
  });
  if (!announcement || !(await canModerateAnnouncement(session, announcement))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const data = parsed.data.action === "ARCHIVE"
    ? { status: "ARCHIVED", archivedAt: new Date(), lastAction: "Annonce archivée" }
    : parsed.data.action === "RESTORE"
      ? { status: "PUBLISHED", moderationStatus: "PUBLISHED", archivedAt: null, deletedAt: null, lastAction: "Annonce restaurée" }
      : parsed.data.action === "PIN"
        ? { pinnedAt: new Date(), lastAction: "Annonce épinglée" }
        : { pinnedAt: null, lastAction: "Annonce désépinglée" };

  const updated = await prisma.announcement.update({ where: { id }, data });
  await writeAuditLog({ userId: session.userId, action: `announcement.${parsed.data.action.toLowerCase()}`, entity: "Announcement", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, announcement: updated });
}
