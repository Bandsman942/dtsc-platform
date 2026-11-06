import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { isMfaRequiredAnywhere } from "@/lib/auth/mfa-policy";
import { consumeTotpFactorCode, consumeTotpRecoveryCode } from "@/lib/auth/totp-factor-service";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().trim().min(6).max(30),
}).strict();

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Reconnectez-vous pour continuer." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, "auth:totp-disable:" + session.userId), 4, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limited.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmez votre mot de passe et un code valide." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true, status: true } });
  if (!user || user.status !== "ACTIVE" || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Impossible de vérifier votre identité." }, { status: 403 });
  }
  // A factor is account-global. A different active tenant may still require it.
  if (await isMfaRequiredAnywhere(session.userId)) {
    return NextResponse.json({ error: "La double authentification est obligatoire pour au moins un de vos espaces." }, { status: 403 });
  }
  const factor = await prisma.authTotpFactor.findUnique({ where: { userId: session.userId }, select: { enabledAt: true } });
  if (!factor?.enabledAt) return NextResponse.json({ error: "La double authentification n'est pas activée." }, { status: 409 });
  const valid = /^\d{6}$/.test(parsed.data.code)
    ? await consumeTotpFactorCode(session.userId, parsed.data.code)
    : await consumeTotpRecoveryCode(session.userId, parsed.data.code);
  if (!valid) return NextResponse.json({ error: "Le code est incorrect ou déjà utilisé." }, { status: 403 });

  // Deletion is scoped to the verified account; caller was reauthenticated.
  await prisma.authTotpFactor.delete({ where: { userId: session.userId } });
  await writeAuditLog({ userId: session.userId, action: "AUTH_TOTP_DISABLED", entity: "AuthTotpFactor", entityId: session.userId, request: req });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
