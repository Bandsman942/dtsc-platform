import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { generateTotpSecret, encryptTotpSecret, getTotpProvisioningUri } from "@/lib/auth/totp";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ password: z.string().min(1).max(256) }).strict();

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Reconnectez-vous pour continuer." }, { status: 401 });
  const limiter = await rateLimit(getRateLimitKey(req, "auth:totp-enroll:" + session.userId), 4, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limiter.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmez votre mot de passe." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true, passwordHash: true, status: true } });
  if (!user || user.status !== "ACTIVE" || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Impossible de vérifier votre identité." }, { status: 403 });
  }

  const current = await prisma.authTotpFactor.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });
  if (current?.enabledAt) return NextResponse.json({ error: "La double authentification est déjà activée." }, { status: 409 });

  // Encrypt before any persistence; missing encryption config fails closed.
  const secret = generateTotpSecret();
  const secretCiphertext = encryptTotpSecret(secret);
  if (current) {
    const updated = await prisma.authTotpFactor.updateMany({
      where: { userId: user.id, enabledAt: null },
      data: { secretCiphertext, lastAcceptedStep: null },
    });
    if (!updated.count) return NextResponse.json({ error: "La configuration de sécurité a changé. Actualisez la page." }, { status: 409 });
  } else {
    try {
      await prisma.authTotpFactor.create({ data: { userId: user.id, secretCiphertext } });
    } catch {
      return NextResponse.json({ error: "Une configuration existe déjà. Actualisez la page." }, { status: 409 });
    }
  }

  await writeAuditLog({ userId: user.id, action: "AUTH_TOTP_ENROLL_STARTED", entity: "AuthTotpFactor", entityId: user.id, request: req });
  return NextResponse.json(
    { ok: true, secret, provisioningUri: getTotpProvisioningUri(secret, user.email) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
