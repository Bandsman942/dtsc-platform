import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { announcementCommentUpdateSchema } from "@/lib/validators";

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

  const body = announcementCommentUpdateSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  const { id } = await params;
  const [settings, comment] = await Promise.all([
    getAppSettings(),
    prisma.announcementComment.findUnique({
      where: { id },
      select: { id: true, userId: true, createdAt: true },
    }),
  ]);

  if (!comment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = session.role === UserRole.ADMIN;
  if (!canEdit(comment.createdAt, settings.commentEditWindowMinutes, comment.userId === session.userId, isAdmin)) {
    return NextResponse.json({ error: "Edit window expired" }, { status: 403 });
  }

  const updated = await prisma.announcementComment.update({
    where: { id: comment.id },
    data: { content: body.data.content },
  });

  return NextResponse.json({ ok: true, comment: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await prisma.announcementComment.deleteMany({
    where: { id },
  });

  if (!deleted.count) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
