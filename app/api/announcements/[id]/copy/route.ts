import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { announcementCopySchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = announcementCopySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid copy" }, { status: 400 });
  }
  const { id } = await params;
  const source = await prisma.announcement.findFirst({
    where: { id, deletedAt: null },
    select: { title: true, content: true, category: true, visibility: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const copy = await prisma.announcement.create({
    data: {
      authorId: session.userId,
      title: `${parsed.data.titlePrefix} ${source.title}`.slice(0, 160),
      content: source.content,
      category: source.category,
      visibility: source.visibility,
      status: "DRAFT",
      lastAction: "Copie créée",
    },
  });
  await writeAuditLog({ userId: session.userId, action: "announcement.copy", entity: "Announcement", entityId: copy.id, metadata: { sourceId: id }, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, announcement: copy }, { status: 201 });
}
