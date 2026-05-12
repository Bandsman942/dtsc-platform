import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { conversationUpdateSchema } from "@/lib/validators";
import { writeApiLog } from "@/lib/audit";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, { params }: Params) {
  void req;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: session.userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = conversationUpdateSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid conversation update" }, { status: 400 });
  }

  if (!body.data.title && typeof body.data.projectName === "undefined" && typeof body.data.projectId === "undefined") {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { id } = await params;
  let projectName = body.data.projectName || null;
  const projectId = body.data.projectId || null;
  if (projectId) {
    const project = await prisma.conversationProject.findFirst({
      where: { id: projectId, userId: session.userId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectName = project.name;
  }

  const conversation = await prisma.conversation.updateMany({
    where: { id, userId: session.userId },
    data: {
      ...(body.data.title ? { title: body.data.title } : {}),
      ...(typeof body.data.projectName !== "undefined" || typeof body.data.projectId !== "undefined"
        ? { projectName, projectId }
        : {}),
    },
  });

  if (!conversation.count) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "conversation_update", conversationId: id, projectId, projectName },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await prisma.conversation.deleteMany({
    where: { id, userId: session.userId },
  });

  if (!conversation.count) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "conversation_delete", conversationId: id },
  });

  return NextResponse.json({ ok: true });
}
