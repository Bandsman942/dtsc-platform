import { NextResponse } from "next/server";
import { canReadAnnouncement } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { announcementReactionSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-reaction:${session.userId}`), 300, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = announcementReactionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, scope: true, organizationId: true, moderationStatus: true, status: true, deletedAt: true },
  });
  if (!announcement || !canReadAnnouncement(announcement, session)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const existing = await prisma.announcementReaction.findUnique({
    where: { announcementId_userId: { announcementId: id, userId: session.userId } },
  });
  let action: "removed" | "saved";
  if (existing?.value === parsed.data.value) {
    await prisma.announcementReaction.delete({ where: { id: existing.id } });
    action = "removed";
  } else {
    await prisma.announcementReaction.upsert({
      where: { announcementId_userId: { announcementId: id, userId: session.userId } },
      update: { value: parsed.data.value },
      create: { announcementId: id, userId: session.userId, value: parsed.data.value },
    });
    action = "saved";
  }

  await writeAuditLog({ userId: session.userId, action: `announcement.reaction.${action}`, entity: "Announcement", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, action });
}
