import { NextResponse } from "next/server";
import { z } from "zod";
import { MessageRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getActiveOrganizationId } from "@/lib/organizations";

type Params = {
  params: Promise<{ id: string }>;
};

const feedbackSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.null()]),
});

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = feedbackSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const message = await prisma.message.findFirst({
    where: {
      id,
      role: MessageRole.assistant,
      conversation: { userId: session.userId, organizationId },
    },
    select: { id: true },
  });

  if (!message) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const updated = await prisma.message.update({
    where: { id },
    data: {
      feedbackValue: body.data.value,
      feedbackUpdatedAt: body.data.value === null ? null : new Date(),
    },
    select: { id: true, feedbackValue: true, feedbackUpdatedAt: true },
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "chatbot_message_feedback", messageId: id, value: body.data.value },
  });

  return NextResponse.json({ message: updated });
}
