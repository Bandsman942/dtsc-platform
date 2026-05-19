import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { announcementStatusSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: session ? 403 : 401, userId: session?.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = announcementStatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const { id } = await params;
  const data =
    parsed.data.action === "ARCHIVE"
      ? { status: "ARCHIVED", archivedAt: new Date(), lastAction: "Annonce archivée" }
      : parsed.data.action === "RESTORE"
        ? { status: "ACTIVE", archivedAt: null, deletedAt: null, lastAction: "Annonce restaurée" }
        : parsed.data.action === "PIN"
          ? { pinnedAt: new Date(), lastAction: "Annonce épinglée" }
          : { pinnedAt: null, lastAction: "Annonce désépinglée" };
  const updated = await prisma.announcement.update({ where: { id }, data });
  await writeAuditLog({ userId: session.userId, action: `announcement.${parsed.data.action.toLowerCase()}`, entity: "Announcement", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, announcement: updated });
}
