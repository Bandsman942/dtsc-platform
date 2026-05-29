import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getActiveOrganizationId, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const notificationContextWhere: Prisma.NotificationWhereInput = organizationId
    ? isDtscInternalSession(session)
      ? { OR: [{ organizationId }, { organizationId: null }] }
      : { organizationId }
    : { organizationId: null };
  const notification = await prisma.notification.updateMany({
    where: { id, userId: session.userId, ...notificationContextWhere },
    data: { readAt: new Date() },
  });

  await writeApiLog({
    request: req,
    statusCode: notification.count ? 200 : 404,
    userId: session.userId,
    startedAt,
    metadata: { action: "notification_read", notificationId: id },
  });

  if (!notification.count) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
