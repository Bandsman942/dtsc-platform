import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security";
import { revokeOneSession } from "@/lib/auth/session-registry";
import { isSameOriginRequest } from "@/lib/request-security";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

const revokeSchema = z.object({
  userId: z.string().min(1).max(160),
  sessionId: z.string().uuid(),
  password: z.string().min(1).max(256),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function GET(req: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ);
  if (access.response) return access.response;
  const url = new URL(req.url);
  const q = (url.searchParams.get("search") || "").trim().slice(0, 120);
  const cursor = url.searchParams.get("cursor");
  if (cursor && !z.string().uuid().safeParse(cursor).success) {
    return NextResponse.json({ error: "Pagination incorrecte." }, { status: 400 });
  }
  const now = new Date();
  const where = {
    revokedAt: null,
    absoluteExpiresAt: { gt: now },
    ...(q ? {
      user: { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] },
    } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.authSession.findMany({
      where, orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, userId: true, userAgent: true, lastSeenAt: true, createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.authSession.count({ where }),
  ]);
  return NextResponse.json({
    total: count,
    sessions: rows.slice(0, 20).map((row) => ({
      id: row.id, userId: row.userId,
      name: row.user.name, email: row.user.email,
      device: row.userAgent?.slice(0, 120) || "Appareil non identifié",
      lastSeenAt: row.lastSeenAt.toISOString(), createdAt: row.createdAt.toISOString(),
      current: row.id === access.session.sessionId,
    })),
    nextCursor: rows.length > 20 ? rows[19].id : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_MANAGE);
  if (access.response) return access.response;
  const limited = await rateLimit(getRateLimitKey(req, "admin:auth:sessions:" + access.session.userId),
    5, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limited.ok) return NextResponse.json({ error: "Trop d'actions. Réessayez plus tard." }, { status: 429 });
  const parsed = revokeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmez la session, le motif et votre mot de passe." }, { status: 400 });
  const actor = await prisma.user.findUnique({
    where: { id: access.session.userId },
    select: { passwordHash: true, status: true },
  });
  if (!actor || actor.status !== "ACTIVE" || !verifyPassword(parsed.data.password, actor.passwordHash)) {
    await writeAuditLog({
      userId: access.session.userId, action: "AUTH_ADMIN_REVOCATION_DENIED",
      entity: "AuthSession", entityId: parsed.data.sessionId, request: req,
      reasonCode: "PASSWORD_INVALID", riskLevel: "HIGH",
    });
    return NextResponse.json({ error: "Impossible de confirmer votre identité." }, { status: 403 });
  }
  const count = await revokeOneSession(parsed.data.userId, parsed.data.sessionId, "ADMIN_REVOKED_SESSION");
  if (!count) return NextResponse.json({ error: "Session introuvable ou déjà terminée." }, { status: 404 });
  await writeAuditLog({
    userId: access.session.userId, action: "AUTH_ADMIN_SESSION_REVOKED",
    entity: "AuthSession", entityId: parsed.data.sessionId, request: req,
    reasonCode: "ADMIN_REVOKED_SESSION", riskLevel: "HIGH",
    metadata: { targetUserId: parsed.data.userId, reason: parsed.data.reason },
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
