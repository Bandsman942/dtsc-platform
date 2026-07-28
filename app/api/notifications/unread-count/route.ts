import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getVisibleNotificationWhereForSession } from "@/lib/notification-access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where = await getVisibleNotificationWhereForSession(session);
  const unreadCount = await prisma.notification.count({
    where: { ...where, readAt: null },
  });
  return NextResponse.json({ unreadCount });
}
