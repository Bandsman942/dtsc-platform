import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { canManageSupportTickets } from "@/lib/support-access";
import { ticketMessageUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string; messageId: string }> };

async function authorize(params: Params["params"], userId: string, canManage: boolean) {
  const { id, messageId } = await params;
  const message = await prisma.ticketMessage.findFirst({
    where: { id: messageId, ticketId: id },
    include: { ticket: { select: { id: true, userId: true } } },
  });
  if (!message || (message.ticket.userId !== userId && !canManage)) {
    return null;
  }
  return message;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `support-message-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ message: "Trop de modifications sur une courte période." }, { status: 429 });
  }
  const parsed = ticketMessageUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  const message = await authorize(params, session.userId, canManageSupportTickets(session));
  if (!message || (message.userId !== session.userId && !canManageSupportTickets(session)) || message.deletedAt) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const updated = await prisma.ticketMessage.update({ where: { id: message.id }, data: { content: parsed.data.content } });
  await writeAuditLog({ userId: session.userId, action: "SUPPORT_MESSAGE_UPDATED", entity: "TicketMessage", entityId: message.id, request: req, metadata: { ticketId: message.ticketId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, message: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `support-message-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ message: "Trop de suppressions sur une courte période." }, { status: 429 });
  }
  const message = await authorize(params, session.userId, canManageSupportTickets(session));
  if (!message || (message.userId !== session.userId && !canManageSupportTickets(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.ticketMessage.update({ where: { id: message.id }, data: { content: "Message supprimé", deletedAt: new Date() } });
  await writeAuditLog({ userId: session.userId, action: "SUPPORT_MESSAGE_DELETED", entity: "TicketMessage", entityId: message.id, request: req, metadata: { ticketId: message.ticketId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
