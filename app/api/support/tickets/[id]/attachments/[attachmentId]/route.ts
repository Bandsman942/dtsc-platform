import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserAccessSupportTicket } from "@/lib/support-access";
import { createSupportPhotoUrl } from "@/lib/support-media";
import { writeApiLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string; attachmentId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, attachmentId } = await params;
  const photo = await prisma.supportTicketAttachment.findFirst({
    where: { id: attachmentId, ticketId: id },
    select: { storageBucket: true, storagePath: true, ticket: { select: { userId: true } } },
  });
  if (!photo || !canUserAccessSupportTicket(photo.ticket, session)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const signedUrl = await createSupportPhotoUrl(id, photo.storageBucket, photo.storagePath);
    await writeApiLog({ request: req, userId: session.userId, statusCode: 302, startedAt });
    return NextResponse.redirect(signedUrl, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ message: "Photo temporairement indisponible." }, { status: 503 });
  }
}
