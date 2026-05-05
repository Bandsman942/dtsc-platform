import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
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
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, authorId: true, title: true },
  });

  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const comment = await prisma.announcementComment.create({
    data: {
      announcementId: announcement.id,
      userId: session.userId,
      content: body.data.content,
    },
  });

  if (announcement.authorId !== session.userId) {
    await notifyUser({
      userId: announcement.authorId,
      title: "Nouveau commentaire sur votre annonce",
      body: announcement.title,
      type: "ANNOUNCEMENT",
      targetUrl: "/announcements",
    });
  }

  return NextResponse.json({ ok: true, comment });
}
