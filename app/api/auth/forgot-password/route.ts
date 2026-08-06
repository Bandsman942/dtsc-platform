import { NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordResetToken, normalizeAccountEmail, PASSWORD_RESET_TTL_MINUTES } from "@/lib/account-recovery";
import { writeAuditLog } from "@/lib/audit";
import { getAccountBaseUrl } from "@/lib/domains";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

const schema = z.object({ email: z.string().email().max(320) });
const accepted = { ok: true, reason: "RESET_REQUEST_ACCEPTED" };

export async function POST(req: Request) {
  const limited = await rateLimit(getRateLimitKey(req, "auth:forgot-password"), 5, 15 * 60 * 1000);
  if (!limited.ok) return NextResponse.json(accepted, { status: 202 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(accepted, { status: 202 });

  const email = normalizeAccountEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, status: true } });
  if (!user || user.status !== "ACTIVE") return NextResponse.json(accepted, { status: 202 });

  const { token, tokenHash } = createPasswordResetToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
  ]);

  const accountBaseUrl = getAccountBaseUrl() || new URL(req.url).origin;
  const resetUrl = new URL("/auth/reset-password", accountBaseUrl);
  resetUrl.searchParams.set("token", token);

  try {
    await sendZohoOutboundMail({
      to: [user.email],
      subject: "Réinitialisation de votre mot de passe DTSC",
      heading: "Lien sécurisé à usage unique",
      message: `Bonjour ${user.name},\n\nUne demande de réinitialisation a été reçue pour votre compte DTSC. Utilisez ce lien dans les ${PASSWORD_RESET_TTL_MINUTES} prochaines minutes :\n\n${resetUrl.toString()}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
      deliveryMode: "direct",
      source: "account-password-recovery",
    });
  } catch {
    await prisma.passwordResetToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: new Date() } });
  }

  await writeAuditLog({
    userId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    entity: "User",
    entityId: user.id,
    request: req,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return NextResponse.json(accepted, { status: 202 });
}
