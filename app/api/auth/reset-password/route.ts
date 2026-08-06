import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPasswordResetToken, passwordPolicyError } from "@/lib/account-recovery";
import { writeAuditLog } from "@/lib/audit";
import { clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/security";

const schema = z.object({ token: z.string().min(32).max(256), password: z.string().min(12).max(256) });

export async function POST(req: Request) {
  const limited = await rateLimit(getRateLimitKey(req, "auth:reset-password"), 8, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard.", reason: "RATE_LIMITED" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lien ou mot de passe invalide.", reason: "VALIDATION_ERROR" }, { status: 400 });
  const policyError = passwordPolicyError(parsed.data.password);
  if (policyError) return NextResponse.json({ error: policyError, reason: "PASSWORD_POLICY_FAILED" }, { status: 400 });

  const tokenHash = hashPasswordResetToken(parsed.data.token);
  const tokenRecord = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  const now = new Date();
  if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt <= now) {
    const reason = tokenRecord?.usedAt ? "RESET_TOKEN_ALREADY_USED" : tokenRecord ? "RESET_TOKEN_EXPIRED" : "RESET_TOKEN_INVALID";
    return NextResponse.json({ error: "Ce lien est invalide, expiré ou déjà utilisé.", reason }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: tokenRecord.userId }, select: { id: true, status: true } });
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ error: "Ce lien ne peut plus être utilisé.", reason: "RESET_TOKEN_INVALID" }, { status: 400 });

  const passwordHash = hashPassword(parsed.data.password);
  let completed = false;
  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: tokenRecord.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new Error("RESET_TOKEN_CONSUMED");
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    });
    completed = true;
  } catch {
    completed = false;
  }

  if (!completed) {
    return NextResponse.json({ error: "Ce lien est invalide, expiré ou déjà utilisé.", reason: "RESET_TOKEN_ALREADY_USED" }, { status: 400 });
  }

  await clearSessionCookie();
  await writeAuditLog({
    userId: user.id,
    action: "PASSWORD_RESET_COMPLETED",
    entity: "User",
    entityId: user.id,
    request: req,
    metadata: { sessionsRevoked: "current-cookie-session" },
  });
  return NextResponse.json({ ok: true, reason: "PASSWORD_RESET_COMPLETED" });
}
