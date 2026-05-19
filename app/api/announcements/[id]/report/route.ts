import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { announcementReportSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = announcementReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }
  const { id } = await params;
  const announcement = await prisma.announcement.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    await tx.announcement.update({
      where: { id },
      data: { reportCount: { increment: 1 }, lastAction: "Signalement reçu" },
    });
    return saved;
  });
  const moderators = await prisma.user.findMany({
    where: { OR: [{ role: UserRole.ADMIN }, { role: UserRole.MANAGER }] },
    select: { id: true },
  });
  await notifyUsers({
    userIds: moderators.map((moderator) => moderator.id),
    title: "Signalement d'annonce",
    body: `${session.name} a signalé: ${announcement.title}`,
    type: "ANNOUNCEMENT",
    targetUrl: "/announcements",
  });
  await writeAuditLog({ userId: session.userId, action: "announcement.report", entity: "AnnouncementReport", entityId: report.id, metadata: { announcementId: id }, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, report }, { status: 201 });
}
