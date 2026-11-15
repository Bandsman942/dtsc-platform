import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";
import { canUserAccessSupportTicket } from "@/lib/support-access";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { uploadSupportPhoto, removeSupportPhoto, validateSupportPhoto } from "@/lib/support-media";
import { writeApiLog, writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!ticket || ticket.userId !== session.userId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!canUserAccessSupportTicket(ticket, session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `support-photo:${session.userId}`), 24, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const existing = await prisma.supportTicketAttachment.count({ where: { ticketId: id } });
  if (existing >= 5) return NextResponse.json({ message: "Maximum cinq photos par ticket." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ message: "Sélectionnez une photo." }, { status: 400 });
  const check = validateSupportPhoto(file);
  if (!check.ok) return NextResponse.json({ message: check.message }, { status: check.status });
  let uploaded: Awaited<ReturnType<typeof uploadSupportPhoto>> | null = null;
  try {
    uploaded = await uploadSupportPhoto(id, file);
    const photo = await prisma.supportTicketAttachment.create({
      data: { ticketId: id, uploadedById: session.userId, originalName: file.name.slice(0, 240), ...uploaded },
      select: { id: true, originalName: true },
    });
    await writeAuditLog({ userId: session.userId, action: "SUPPORT_TICKET_PHOTO_ADDED", entity: "SupportTicket", entityId: id, metadata: { attachmentId: photo.id }, request: req });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    if (uploaded) await removeSupportPhoto(id, uploaded.storageBucket, uploaded.storagePath);
    const message = error instanceof Error && (error.message.includes("image valide") || error.message.includes("Formats acceptés")) ? error.message : "Impossible d’enregistrer cette photo.";
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { action: "support_photo_failed" } });
    return NextResponse.json({ message }, { status: message.includes("image valide") ? 415 : 500 });
  }
}
