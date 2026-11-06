import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getCurrentKnownBrowser } from "@/lib/auth/known-browser";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/audit";

const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("trust"), password: z.string().min(1).max(256) }).strict(),
  z.object({ action: z.literal("revoke"), id: z.string().min(1).max(160) }).strict(),
]);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const current = await getCurrentKnownBrowser(session.userId);
  const devices = await prisma.authKnownBrowser.findMany({
    where: { userId: session.userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" }, take: 30,
    select: { id: true, agentLabel: true, lastSeenAt: true, createdAt: true, trustedUntil: true },
  });
  return NextResponse.json({
    currentId: current?.id || null,
    devices: devices.map(x => ({
      id: x.id, browser: x.agentLabel, lastSeenAt: x.lastSeenAt.toISOString(),
      createdAt: x.createdAt.toISOString(), trustedUntil: x.trustedUntil?.toISOString() || null,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, "auth:known-browser:" + session.userId),
    6, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limited.ok) return NextResponse.json({ error: "Trop d'actions. Réessayez plus tard." }, { status: 429 });
  const payload = changeSchema.safeParse(await req.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: "Action invalide." }, { status: 400 });

  if (payload.data.action === "trust") {
    if (!session.mfaVerifiedAt || Date.now() - session.mfaVerifiedAt > 10 * 60_000) {
      return NextResponse.json({ error: "Reconnectez-vous avec votre authentificateur pour confirmer cet appareil." }, { status: 428 });
    }
    const [factor, user, current] = await Promise.all([
      prisma.authTotpFactor.findUnique({ where: { userId: session.userId }, select: { enabledAt: true } }),
      prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true, status: true } }),
      getCurrentKnownBrowser(session.userId),
    ]);
    if (!factor?.enabledAt || !current || !user || user.status !== "ACTIVE" ||
        !verifyPassword(payload.data.password, user.passwordHash)) {
      return NextResponse.json({ error: "Identité ou appareil non vérifié." }, { status: 403 });
    }
    const alreadyTrusted = await prisma.authKnownBrowser.count({
      where: { userId: session.userId, revokedAt: null, trustedUntil: { gt: new Date() } },
    });
    if (alreadyTrusted >= 10) return NextResponse.json({ error: "Maximum de dix appareils fiables atteint." }, { status: 409 });
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await prisma.authKnownBrowser.updateMany({
      where: { id: current.id, userId: session.userId, revokedAt: null },
      data: { trustedAt: new Date(), trustedUntil: deadline },
    });
    if (!updated.count) return NextResponse.json({ error: "Appareil introuvable." }, { status: 404 });
    await writeAuditLog({
      userId: session.userId, action: "AUTH_BROWSER_TRUSTED", entity: "AuthKnownBrowser",
      entityId: current.id, request: req, metadata: { trustedUntil: deadline.toISOString() },
    });
    // Trusted is only a user-visible label, NEVER an MFA bypass or session issuance.
    return NextResponse.json({ ok: true, trustedUntil: deadline.toISOString() });
  }

  const count = await prisma.authKnownBrowser.updateMany({
    where: { id: payload.data.id, userId: session.userId, revokedAt: null },
    data: { revokedAt: new Date(), trustedAt: null, trustedUntil: null },
  });
  if (!count.count) return NextResponse.json({ error: "Appareil introuvable." }, { status: 404 });
  await writeAuditLog({
    userId: session.userId, action: "AUTH_BROWSER_REVOKED", entity: "AuthKnownBrowser",
    entityId: payload.data.id, request: req,
  });
  return NextResponse.json({ ok: true });
}
