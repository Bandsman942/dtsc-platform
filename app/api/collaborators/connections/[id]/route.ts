import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { collaboratorsNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Origine refusée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as { action?: "ACCEPT" | "DECLINE" | "CANCEL" } | null;
  if (!body?.action || !["ACCEPT", "DECLINE", "CANCEL"].includes(body.action)) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Action invalide." }, { status: 400 });
  const record = await prisma.collaborationConnection.findUnique({ where: { id } });
  if (!record || record.status !== "PENDING") return NextResponse.json({ error: "NOT_FOUND", message: "Invitation introuvable ou déjà traitée." }, { status: 404 });
  const isRecipient = record.recipientId === session.userId;
  const isRequester = record.requesterId === session.userId;
  if ((body.action === "CANCEL" && !isRequester) || (body.action !== "CANCEL" && !isRecipient)) return NextResponse.json({ error: "FORBIDDEN", message: "Action non autorisée." }, { status: 403 });
  const status = body.action === "ACCEPT" ? "ACCEPTED" : body.action === "DECLINE" ? "DECLINED" : "CANCELED";
  const updated = await prisma.collaborationConnection.update({ where: { id }, data: { status, respondedAt: new Date() } });
  const targetUserId = isRecipient ? record.requesterId : record.recipientId;
  await notifyUser({ userId: targetUserId, title: status === "ACCEPTED" ? "Invitation acceptée" : "Invitation mise à jour", body: status === "ACCEPTED" ? `${session.name} a accepté votre invitation professionnelle.` : `${session.name} a mis à jour l’invitation professionnelle.`, type: "COLLABORATION", targetUrl: collaboratorsNotificationTarget(""), idempotencyKey: `collaboration:connection:${id}:${status}` });
  await writeAuditLog({ userId: session.userId, action: `collaboration.connection.${status.toLowerCase()}`, entity: "CollaborationConnection", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, connection: updated });
}
