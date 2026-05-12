import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { conversationProjectSchema } from "@/lib/validators";

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

  const body = conversationProjectSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  const { id } = await params;
  let updated: { count: number };
  try {
    updated = await prisma.conversationProject.updateMany({
      where: { id, userId: session.userId },
      data: { name: body.data.name },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Project name already exists" }, { status: 409 });
    }
    throw error;
  }

  if (!updated.count) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "conversation_project_update", projectId: id },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.conversationProject.findFirst({
    where: { id, userId: session.userId },
    select: { id: true },
  });

  if (!project) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.conversation.updateMany({
    where: { userId: session.userId, projectId: id },
    data: { projectId: null, projectName: null },
  });
  await prisma.conversationProject.delete({ where: { id } });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "conversation_project_delete", projectId: id },
  });

  return NextResponse.json({ ok: true });
}
