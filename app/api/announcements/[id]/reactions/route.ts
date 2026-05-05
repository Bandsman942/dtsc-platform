import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { announcementReactionSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = announcementReactionSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.announcementReaction.findUnique({
    where: { announcementId_userId: { announcementId: id, userId: session.userId } },
  });

  if (existing?.value === body.data.value) {
    await prisma.announcementReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, action: "removed" });
  }

  await prisma.announcementReaction.upsert({
    where: { announcementId_userId: { announcementId: id, userId: session.userId } },
    update: { value: body.data.value },
    create: { announcementId: id, userId: session.userId, value: body.data.value },
  });

  return NextResponse.json({ ok: true, action: "saved" });
}
