import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { conversationProjectSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.conversationProject.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { conversations: true } } },
  });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
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

  const project = await prisma.conversationProject.upsert({
    where: { userId_name: { userId: session.userId, name: body.data.name } },
    update: { updatedAt: new Date() },
    create: { userId: session.userId, name: body.data.name },
  });

  await writeApiLog({
    request: req,
    statusCode: 201,
    userId: session.userId,
    startedAt,
    metadata: { action: "conversation_project_create", projectId: project.id },
  });

  return NextResponse.json({ project }, { status: 201 });
}
