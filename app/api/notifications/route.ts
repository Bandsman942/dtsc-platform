import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getVisibleNotificationWhereForSession } from "@/lib/notification-access";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notificationWhere = await getVisibleNotificationWhereForSession(session);
  const deleted = await prisma.notification.deleteMany({
    where: notificationWhere,
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "notifications_clear", count: deleted.count },
  });

  return NextResponse.json({ ok: true });
}
