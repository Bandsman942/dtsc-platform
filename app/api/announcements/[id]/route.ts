import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { announcementUpdateSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

function canEdit(createdAt: Date, windowMinutes: number, isAuthor: boolean, isAdmin: boolean) {
  if (isAdmin) {
    return true;
  }
  const deadline = createdAt.getTime() + windowMinutes * 60 * 1000;
  return isAuthor && Date.now() <= deadline;
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = announcementUpdateSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid announcement" }, { status: 400 });
  }

  const { id } = await params;
  const [settings, announcement] = await Promise.all([
    getAppSettings(),
    prisma.announcement.findUnique({
      where: { id },
      select: { id: true, authorId: true, createdAt: true },
    }),
  ]);

  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = session.role === UserRole.ADMIN;
  if (!canEdit(announcement.createdAt, settings.announcementEditWindowMinutes, announcement.authorId === session.userId, isAdmin)) {
    return NextResponse.json({ error: "Edit window expired" }, { status: 403 });
  }

  const updated = await prisma.announcement.update({
    where: { id: announcement.id },
    data: {
      title: body.data.title,
      content: body.data.content,
    },
  });

  return NextResponse.json({ ok: true, announcement: updated });
}
