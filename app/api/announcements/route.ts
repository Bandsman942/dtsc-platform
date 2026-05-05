import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";
import { announcementSchema } from "@/lib/validators";

function canPublishAnnouncement(role: UserRole, allowClients: boolean) {
  return allowClients || role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAppSettings();
  if (!canPublishAnnouncement(session.role, settings.allowClientAnnouncements)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = announcementSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid announcement" }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      authorId: session.userId,
      title: body.data.title,
      content: body.data.content,
    },
  });

  const users = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await notifyUsers({
    userIds: users.map((user) => user.id),
    title: "Nouvelle annonce DTSC",
    body: body.data.title,
    type: "ANNOUNCEMENT",
  });

  return NextResponse.json({ ok: true, announcement }, { status: 201 });
}
