import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { publicationNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { publicPublicationCommentSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = publicPublicationCommentSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  const { id } = await params;
  const parentId = body.data.parentId || null;
  const publication = await prisma.publicPublication.findFirst({
    where: { id, published: true },
    select: { id: true, authorId: true, title: true, slug: true },
  });

  if (!publication) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parentComment = parentId
    ? await prisma.publicPublicationComment.findFirst({
        where: { id: parentId, publicationId: publication.id },
        select: { id: true, userId: true },
      })
    : null;
  if (parentId && !parentComment) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
  }

  const comment = await prisma.publicPublicationComment.create({
    data: {
      publicationId: publication.id,
      userId: session.userId,
      parentId,
      content: body.data.content,
    },
  });

  const recipientIds = new Set([publication.authorId, parentComment?.userId].filter((userId): userId is string => Boolean(userId && userId !== session.userId)));
  await Promise.all(Array.from(recipientIds).map((userId) => notifyUser({
    userId,
    title: parentComment?.userId === userId ? "Nouvelle réponse à votre commentaire" : "Nouveau commentaire sur une publication publique",
    body: publication.title,
    type: "PUBLICATION",
    targetUrl: publicationNotificationTarget(publication.slug, comment.id),
  })));

  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { publicationId: publication.id, commentId: comment.id } });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
