import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { publicPublicationCommentUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

function canEdit(createdAt: Date, windowMinutes: number, isAuthor: boolean, isAdmin: boolean) {
  if (isAdmin) {
    return true;
  }
  return isAuthor && Date.now() <= createdAt.getTime() + windowMinutes * 60 * 1000;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = publicPublicationCommentUpdateSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  const { id } = await params;
  const [settings, comment] = await Promise.all([
    getAppSettings(),
    prisma.publicPublicationComment.findUnique({
      where: { id },
      select: { id: true, userId: true, createdAt: true },
    }),
  ]);

  if (!comment) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = session.role === UserRole.ADMIN;
  if (!canEdit(comment.createdAt, settings.commentEditWindowMinutes, comment.userId === session.userId, isAdmin)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Edit window expired" }, { status: 403 });
  }

  const updated = await prisma.publicPublicationComment.update({
    where: { id: comment.id },
    data: { content: body.data.content },
  });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, comment: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: session?.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await prisma.publicPublicationComment.deleteMany({ where: { id } });
  if (!deleted.count) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
