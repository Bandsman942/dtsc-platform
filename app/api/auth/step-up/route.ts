import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { hasRecentStepUp, issueStepUp } from "@/lib/auth/step-up";
import { consumeTotpFactorCode, consumeTotpRecoveryCode } from "@/lib/auth/totp-factor-service";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security";
import { isSameOriginRequest } from "@/lib/request-security";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().trim().max(30).optional(),
}).strict();

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  return NextResponse.json({ verified: await hasRecentStepUp(session) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Reconnectez-vous pour continuer." }, { status: 401 });
  const limiter = await rateLimit(getRateLimitKey(req, "auth:step-up:" + session.userId),
    5, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limiter.ok) return NextResponse.json({ error: "Trop de tentatives de sécurité." }, { status: 429 });
  const input = schema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Confirmez votre identité." }, { status: 400 });
  const [user, factor] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { status: true, passwordHash: true } }),
    prisma.authTotpFactor.findUnique({ where: { userId: session.userId }, select: { enabledAt: true } }),
  ]);
  if (!user || user.status !== "ACTIVE" || !verifyPassword(input.data.password, user.passwordHash)) {
    await writeAuditLog({
      userId: session.userId, action: "AUTH_STEPUP_REJECTED",
      entity: "User", entityId: session.userId, request: req, result: "DENIED",
    });
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 403 });
  }
  if (factor?.enabledAt) {
    const code = input.data.code || "";
    const okay = /^\d{6}$/.test(code)
      ? await consumeTotpFactorCode(session.userId, code)
      : await consumeTotpRecoveryCode(session.userId, code);
    if (!okay) return NextResponse.json({ error: "Le code de sécurité est incorrect ou déjà utilisé." }, { status: 403 });
  }
  await issueStepUp(session);
  await writeAuditLog({
    userId: session.userId, action: "AUTH_STEPUP_COMPLETED",
    entity: "User", entityId: session.userId, request: req,
  });
  return NextResponse.json({ ok: true, expiresInSeconds: 300 }, { headers: { "Cache-Control": "no-store" } });
}
