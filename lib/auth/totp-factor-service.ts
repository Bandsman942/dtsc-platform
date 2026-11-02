import { prisma } from "@/lib/prisma";
import { decryptTotpSecret, hashRecoveryCode, verifyTotpCode } from "@/lib/auth/totp";

/**
 * Consume a TOTP exactly once, across concurrent requests.
 * This backend-only building block is not a login route.
 * The AUTH-02 login challenge must call it BEFORE issuing a session.
 */
export async function consumeTotpFactorCode(userId: string, code: string): Promise<boolean> {
  if (!/^[0-9]{6}$/.test(code)) return false;
  const factor = await prisma.authTotpFactor.findUnique({
    where: { userId },
    select: { secretCiphertext: true, enabledAt: true, lastAcceptedStep: true },
  });
  if (!factor?.enabledAt) return false;
  // A missing encryption key or corrupted ciphertext must never bypass 2FA.
  const secret = decryptTotpSecret(factor.secretCiphertext);
  const step = verifyTotpCode(secret, code, { lastAcceptedStep: factor.lastAcceptedStep });
  if (step == null) return false;

  const result = await prisma.authTotpFactor.updateMany({
    where: {
      userId,
      enabledAt: { not: null },
      OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: step } }],
    },
    data: { lastAcceptedStep: step },
  });
  return result.count === 1;
}

/** Consume a backup code atomically. Never return a code hash to the frontend. */
export async function consumeTotpRecoveryCode(userId: string, code: string): Promise<boolean> {
  const codeHash = hashRecoveryCode(code);
  if (!codeHash) return false;
  const factor = await prisma.authTotpFactor.findUnique({
    where: { userId },
    select: { id: true, enabledAt: true },
  });
  if (!factor?.enabledAt) return false;
  const result = await prisma.authRecoveryCode.updateMany({
    where: { factorId: factor.id, codeHash, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return result.count === 1;
}
