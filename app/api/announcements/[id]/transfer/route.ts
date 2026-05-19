import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { announcementTransferSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = announcementTransferSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid transfer" }, { status: 400 });
  }
  const { id } = await params;
  const announcement = await prisma.announcement.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const recipients = await prisma.user.findMany({
    where: { id: { in: parsed.data.recipientIds } },
    select: { id: true },
  });
  if (!recipients.length) {
    return NextResponse.json({ error: "No recipient" }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.announcementShare.createMany({
      data: recipients.map((recipient) => ({
        announcementId: id,
        senderId: session.userId,
        recipientId: recipient.id,
        message: parsed.data.message || null,
      })),
      skipDuplicates: true,
    }),
    prisma.announcement.update({
      where: { id },
      data: { shareCount: { increment: recipients.length }, lastAction: "Annonce transférée" },
    }),
  ]);
  await notifyUsers({
    userIds: recipients.map((recipient) => recipient.id),
    title: "Annonce DTSC transférée",
    body: `${session.name} vous a transféré: ${announcement.title}`,
    type: "ANNOUNCEMENT",
    targetUrl: "/announcements",
  });
  await writeAuditLog({ userId: session.userId, action: "announcement.transfer", entity: "Announcement", entityId: id, metadata: { recipients: recipients.length }, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, recipientCount: recipients.length }, { status: 201 });
}
