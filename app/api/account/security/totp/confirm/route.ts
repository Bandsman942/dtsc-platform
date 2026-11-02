import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { decryptTotpSecret, generateRecoveryCodes, hashRecoveryCode, verifyTotpCode } from "@/lib/auth/totp";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Reconnectez-vous pour continuer." }, { status: 401 });
  const limiter = await rateLimit(getRateLimitKey(req, "auth:totp-confirm:" + session.userId), 6, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limiter.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Saisissez le code à six chiffres." }, { status: 400 });

  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();
  const success = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: session.userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") return false;
    const factor = await tx.authTotpFactor.findUnique({
      where: { userId: session.userId },
      select: { id: true, secretCiphertext: true, enabledAt: true, lastAcceptedStep: true },
    });
    if (!factor || factor.enabledAt) return false;
    const step = verifyTotpCode(decryptTotpSecret(factor.secretCiphertext), parsed.data.code, { lastAcceptedStep: factor.lastAcceptedStep });
    if (step == null) return false;
    const changed = await tx.authTotpFactor.updateMany({
      where: { id: factor.id, enabledAt: null, OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: step } }] },
      data: { enabledAt: now, lastAcceptedStep: step },
    });
    if (changed.count !== 1) return false;
    await tx.authRecoveryCode.deleteMany({ where: { factorId: factor.id } });
    await tx.authRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ factorId: factor.id, codeHash: hashRecoveryCode(code)! })),
    });
    return true;
  });

  if (!success) return NextResponse.json({ error: "Code incorrect, expiré ou configuration déjà validée." }, { status: 400 });
  await writeAuditLog({ userId: session.userId, action: "AUTH_TOTP_ENABLED", entity: "AuthTotpFactor", entityId: session.userId, request: req });
  return NextResponse.json({ ok: true, recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
}
