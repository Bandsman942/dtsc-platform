import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { revokeOneSession, revokeOtherSessions } from "@/lib/auth/session-registry";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/audit";

const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revoke"), sessionId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("revoke_others") }).strict(),
]);

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Votre session a expiré." }, { status: 401 });
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  if (cursor && !z.string().uuid().safeParse(cursor).success) {
    return NextResponse.json({ error: "Pagination invalide." }, { status: 400 });
  }
  const rows = await prisma.authSession.findMany({
    where: { userId: session.userId, revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true, absoluteExpiresAt: true },
  });
  const more = rows.length > 20;
  return NextResponse.json({
    sessions: rows.slice(0, 20).map((row) => ({
      id: row.id,
      device: row.userAgent?.slice(0, 160) || "Appareil non identifié",
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.absoluteExpiresAt.toISOString(),
      current: row.id === session.sessionId,
    })),
    nextCursor: more ? rows[19].id : null,
    currentSessionRegistered: Boolean(session.sessionId),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Votre session a expiré." }, { status: 401 });
  const limit = await rateLimit(getRateLimitKey(req, "account:sessions:" + session.userId), 8, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limit.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  const payload = mutation.safeParse(await req.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: "Action invalide." }, { status: 400 });

  if (payload.data.action === "revoke_others") {
    if (!session.sessionId) {
      return NextResponse.json({ error: "Veuillez renouveler votre connexion avant cette action." }, { status: 409 });
    }
    const count = await revokeOtherSessions(session.userId, session.sessionId);
    await writeAuditLog({
      userId: session.userId,
      action: "AUTH_OTHER_SESSIONS_REVOKED",
      entity: "User", entityId: session.userId, request: req,
      metadata: { revokedCount: count },
    });
    return NextResponse.json({ ok: true, revokedCount: count }, { headers: { "Cache-Control": "no-store" } });
  }

  const count = await revokeOneSession(session.userId, payload.data.sessionId, "USER_REVOKED_DEVICE");
  if (!count) return NextResponse.json({ error: "Cette session n'est plus active." }, { status: 404 });
  await writeAuditLog({
    userId: session.userId,
    action: "AUTH_SESSION_REVOKED",
    entity: "AuthSession", entityId: payload.data.sessionId, request: req,
    metadata: { current: payload.data.sessionId === session.sessionId },
  });
  const current = payload.data.sessionId === session.sessionId;
  if (current) await clearSessionCookie();
  return NextResponse.json({ ok: true, currentRevoked: current }, { headers: { "Cache-Control": "no-store" } });
}
