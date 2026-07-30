import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { announcementNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { announcementCommentSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = announcementCommentSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  const { id } = await params;
  const parentId = body.data.parentId || null;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, authorId: true, title: true },
  });

  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parentComment = parentId
    ? await prisma.announcementComment.findFirst({
        where: { id: parentId, announcementId: announcement.id },
        select: { id: true, userId: true },
      })
    : null;
  if (parentId && !parentComment) {
    return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
  }

  const comment = await prisma.announcementComment.create({
    data: {
      announcementId: announcement.id,
      userId: session.userId,
      parentId,
      content: body.data.content,
    },
  });

  const recipientIds = new Set([announcement.authorId, parentComment?.userId].filter((userId): userId is string => Boolean(userId && userId !== session.userId)));
  await Promise.all(Array.from(recipientIds).map((userId) => notifyUser({
    userId,
    title: parentComment?.userId === userId ? "Nouvelle réponse à votre commentaire" : "Nouveau commentaire sur votre annonce",
    body: announcement.title,
    type: "ANNOUNCEMENT",
    targetUrl: announcementNotificationTarget(announcement.id, comment.id),
  })));

  return NextResponse.json({ ok: true, comment });
}
