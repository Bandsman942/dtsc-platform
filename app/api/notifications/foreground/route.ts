import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getVisibleNotificationWhereForSession } from "@/lib/notification-access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notificationWhere = await getVisibleNotificationWhereForSession(session);
  const notifications = await prisma.notification.findMany({
    where: { ...notificationWhere, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, body: true, targetUrl: true },
  });

  return NextResponse.json({ notifications });
}
