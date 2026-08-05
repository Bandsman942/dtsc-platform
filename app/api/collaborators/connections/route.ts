import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { collaboratorsNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { authorizedCollaboratorIds, isCollaborationBlocked } from "@/lib/standard-collaboration";

function connectionPairKey(leftUserId: string, rightUserId: string) {
  return createHash("sha256").update([leftUserId, rightUserId].sort().join(":"), "utf8").digest("hex");
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const url = new URL(req.url);
  const query = (url.searchParams.get("query") || "").trim();
  const records = await prisma.collaborationConnection.findMany({
    where: { OR: [{ requesterId: session.userId }, { recipientId: session.userId }] },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const relatedIds = [...new Set(records.flatMap((record) => [record.requesterId, record.recipientId]).filter((id) => id !== session.userId))];
  const relatedUsers = relatedIds.length ? await prisma.user.findMany({
    where: { id: { in: relatedIds } },
    select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true },
  }) : [];
  const userById = new Map(relatedUsers.map((user) => [user.id, user]));
  let candidates: Array<{ id: string; name: string; email: string; avatarUrl: string | null; jobTitle: string | null }> = [];
  if (query.length >= 3) {
    const [authorizedIds, blocks] = await Promise.all([
      authorizedCollaboratorIds(session),
      prisma.collaborationUserBlock.findMany({ where: { revokedAt: null, OR: [{ blockerId: session.userId }, { blockedId: session.userId }] }, select: { blockerId: true, blockedId: true }, take: 2_000 }),
    ]);
    const excluded = new Set([session.userId, ...authorizedIds, ...relatedIds, ...blocks.map((item) => item.blockerId === session.userId ? item.blockedId : item.blockerId)]);
    candidates = await prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        id: { notIn: [...excluded] },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { companyName: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 20,
    });
  }
  const connections = records.map((record) => ({
    ...record,
    direction: record.requesterId === session.userId ? "OUTGOING" : "INCOMING",
    peer: userById.get(record.requesterId === session.userId ? record.recipientId : record.requesterId) || null,
  }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { resultCount: connections.length, candidateCount: candidates.length } });
  return NextResponse.json({ connections, candidates });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Origine refusée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-connection:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop d’invitations. Réessayez plus tard." }, { status: 429 });
  const body = await req.json().catch(() => null) as { targetUserId?: string; message?: string } | null;
  const targetUserId = body?.targetUserId?.trim();
  if (!targetUserId || targetUserId === session.userId) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Utilisateur invalide." }, { status: 400 });
  const target = await prisma.user.findFirst({ where: { id: targetUserId, status: UserStatus.ACTIVE }, select: { id: true, name: true } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND", message: "Utilisateur introuvable." }, { status: 404 });
  if (await isCollaborationBlocked(session.userId, targetUserId)) return NextResponse.json({ error: "BLOCKED", message: "Cette relation professionnelle ne peut pas être créée." }, { status: 403 });
  const pairKey = connectionPairKey(session.userId, targetUserId);
  const existing = await prisma.collaborationConnection.findUnique({ where: { pairKey } });
  if (existing?.status === "ACCEPTED") return NextResponse.json({ error: "ALREADY_CONNECTED", message: "Vous êtes déjà en relation professionnelle." }, { status: 409 });
  if (existing?.status === "PENDING") return NextResponse.json({ error: "ALREADY_PENDING", message: "Une invitation est déjà en attente." }, { status: 409 });
  const connection = await prisma.collaborationConnection.upsert({
    where: { pairKey },
    update: { requesterId: session.userId, recipientId: targetUserId, status: "PENDING", message: body?.message?.trim().slice(0, 500) || null, respondedAt: null },
    create: { pairKey, requesterId: session.userId, recipientId: targetUserId, status: "PENDING", message: body?.message?.trim().slice(0, 500) || null },
  });
  await notifyUser({ userId: targetUserId, title: "Invitation professionnelle", body: `${session.name} souhaite vous ajouter à ses collaborateurs.`, type: "COLLABORATION", targetUrl: collaboratorsNotificationTarget(""), idempotencyKey: `collaboration:connection:${connection.id}:pending` });
  await writeAuditLog({ userId: session.userId, action: "collaboration.connection.requested", entity: "CollaborationConnection", entityId: connection.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, connection }, { status: 201 });
}
