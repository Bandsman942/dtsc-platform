import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { publicPublicationReactionSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = publicPublicationReactionSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  const { id } = await params;
  const publication = await prisma.publicPublication.findFirst({ where: { id, published: true }, select: { id: true } });
  if (!publication) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.publicPublicationReaction.findUnique({
    where: { publicationId_userId: { publicationId: publication.id, userId: session.userId } },
  });

  if (existing?.value === body.data.value) {
    await prisma.publicPublicationReaction.delete({ where: { id: existing.id } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "removed" } });
    return NextResponse.json({ ok: true, action: "removed" });
  }

  await prisma.publicPublicationReaction.upsert({
    where: { publicationId_userId: { publicationId: publication.id, userId: session.userId } },
    update: { value: body.data.value },
    create: { publicationId: publication.id, userId: session.userId, value: body.data.value },
  });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "saved" } });
  return NextResponse.json({ ok: true, action: "saved" });
}
