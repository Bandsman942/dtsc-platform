import { randomInt } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/security";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

export function generateOtpCode() {
  return String(randomInt(100000, 1000000));
}

export async function createPendingRegistration({
  name,
  email,
  passwordHash,
  companyName,
  phone,
  role,
  expiresInMinutes,
}: {
  name: string;
  email: string;
  passwordHash: string;
  companyName?: string | null;
  phone?: string | null;
  role: UserRole;
  expiresInMinutes: number;
}) {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const pendingRegistration = await prisma.pendingRegistration.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      companyName,
      phone,
      role,
      otpHash: hashPassword(code),
      attempts: 0,
      expiresAt,
    },
    create: {
      name,
      email,
      passwordHash,
      companyName,
      phone,
      role,
      otpHash: hashPassword(code),
      expiresAt,
    },
  });

  return { pendingRegistration, code, expiresAt };
}

export async function sendSignUpOtpEmail({
  email,
  name,
  code,
  expiresInMinutes,
}: {
  email: string;
  name: string;
  code: string;
  expiresInMinutes: number;
}) {
  return sendZohoOutboundMail({
    deliveryMode: "direct",
    subject: "Code de vérification DTSC Platform",
    to: [email],
    heading: "Sécurité du compte DTSC",
    source: "signup-otp",
    message: [
      `Bonjour ${name},`,
      "",
      "Votre demande de création de compte DTSC Platform a bien été reçue.",
      "",
      `Code OTP: ${code}`,
      "",
      `Ce code expire dans ${expiresInMinutes} minute(s). Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.`,
      "",
      "Equipe DTSC",
    ].join("\n"),
  });
}

export async function verifyPendingRegistrationOtp(email: string, otp: string) {
  const pendingRegistration = await prisma.pendingRegistration.findUnique({
    where: { email },
  });

  if (!pendingRegistration) {
    return { ok: false as const, reason: "NOT_FOUND" };
  }

  if (pendingRegistration.expiresAt < new Date()) {
    await prisma.pendingRegistration.delete({ where: { email } }).catch(() => null);
    return { ok: false as const, reason: "EXPIRED" };
  }

  if (pendingRegistration.attempts >= 5) {
    await prisma.pendingRegistration.delete({ where: { email } }).catch(() => null);
    return { ok: false as const, reason: "LOCKED" };
  }

  if (!verifyPassword(otp, pendingRegistration.otpHash)) {
    await prisma.pendingRegistration.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false as const, reason: "INVALID" };
  }

  return { ok: true as const, pendingRegistration };
}
