import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
    take: 200,
  });

  return NextResponse.json({ conversations });
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.userId,
      title: "Nouvelle conversation",
    },
  });

  return NextResponse.json({ conversation });
}
