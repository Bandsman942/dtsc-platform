import { z } from "zod";
import { UserRole, UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { isCollaborationBlocked } from "@/lib/standard-collaboration";

const createSchema = z.object({ targetUserId: z.string().cuid(), message: z.string().trim().max(500).optional() });

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const requests = await prisma.collaborationContactRequest.findMany({
    where: { OR: [{ requesterId: session.userId }, { targetUserId: session.userId }], status: "PENDING" },
    include: {
      requester: { select: { id: true, name: true, avatarUrl: true, jobTitle: true } },
      targetUser: { select: { id: true, name: true, avatarUrl: true, jobTitle: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { count: requests.length } });
  return NextResponse.json({
    incoming: requests.filter((item) => item.targetUserId === session.userId),
    outgoing: requests.filter((item) => item.requesterId === session.userId),
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Origine refusée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-contact-request:${session.userId}`), 30, 24 * 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Limite quotidienne d’invitations atteinte." }, { status: 429 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.targetUserId === session.userId) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Destinataire invalide." }, { status: 400 });
  const target = await prisma.user.findFirst({ where: { id: parsed.data.targetUserId, status: UserStatus.ACTIVE, ...(session.role === UserRole.ADMIN ? {} : { publicProfileConsent: true }) }, select: { id: true, name: true } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND", message: "Utilisateur introuvable." }, { status: 404 });
  if (await isCollaborationBlocked(session.userId, target.id)) return NextResponse.json({ error: "BLOCKED", message: "Cette invitation ne peut pas être envoyée." }, { status: 403 });
  const existing = await prisma.collaborationContactRequest.findFirst({
    where: { OR: [{ requesterId: session.userId, targetUserId: target.id }, { requesterId: target.id, targetUserId: session.userId }] },
  });
  if (existing?.status === "ACCEPTED") return NextResponse.json({ error: "ALREADY_CONNECTED", message: "Vous êtes déjà en relation." }, { status: 409 });
  if (existing?.status === "PENDING") return NextResponse.json({ error: "ALREADY_PENDING", message: "Une invitation est déjà en attente." }, { status: 409 });
  const invitationLabel = session.role === UserRole.ADMIN ? "ADMIN DTSC" : null;
  const invitationMessage = invitationLabel ? `${invitationLabel}${parsed.data.message ? ` — ${parsed.data.message}` : ""}` : parsed.data.message || null;
  const contactRequest = existing
    ? await prisma.collaborationContactRequest.update({ where: { id: existing.id }, data: { requesterId: session.userId, targetUserId: target.id, status: "PENDING", message: invitationMessage, respondedAt: null } })
    : await prisma.collaborationContactRequest.create({ data: { requesterId: session.userId, targetUserId: target.id, message: invitationMessage } });
  await notifyUser({
    userId: target.id,
    title: invitationLabel ? "Invitation de contact · ADMIN DTSC" : "Invitation de contact",
    body: `${session.name} souhaite vous ajouter à ses collaborateurs.`,
    type: "COLLABORATION",
    targetUrl: "/collaborators",
    idempotencyKey: `collaboration:contact-request:${contactRequest.id}:${contactRequest.updatedAt.toISOString()}`,
  });
  await writeAuditLog({ userId: session.userId, action: "COLLABORATION_CONTACT_REQUEST_SENT", entity: "CollaborationContactRequest", entityId: contactRequest.id, request: req, metadata: { targetUserId: target.id, invitationLabel } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, request: contactRequest }, { status: 201 });
}
