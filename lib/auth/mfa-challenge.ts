import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { shouldUseSecureSessionCookie } from "@/lib/session-cookie-security";

const COOKIE = "dtsc_mfa_challenge";
const FIVE_MINUTES = 5 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function challengeCookieOptions(maxAge: number) {
  // Deliberately host-only: a pre-session challenge must not be a cross-subdomain SSO cookie.
  return { httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "strict" as const, path: "/", maxAge };
}

export async function clearMfaChallengeCookie() {
  (await cookies()).set(COOKIE, "", challengeCookieOptions(0));
}

export async function createMfaChallenge(input: { userId: string; organizationId: string | null; redirectTo: string; purpose?: "VERIFY" | "ENROLL" }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + FIVE_MINUTES);
  await prisma.authMfaChallenge.create({
    data: {
      userId: input.userId,
      purpose: input.purpose || "VERIFY",
      organizationId: input.organizationId,
      redirectTo: input.redirectTo,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });
  (await cookies()).set(COOKIE, token, challengeCookieOptions(Math.floor(FIVE_MINUTES / 1000)));
  return { expiresAt: expiresAt.toISOString() };
}

/**
 * Each attempted code consumes an attempt atomically before verification.
 * Only a successful challenge may produce a full dtsc_session cookie.
 */
export async function consumeMfaChallengeAttempt(expectedPurpose: "VERIFY" | "ENROLL" = "VERIFY") {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = new Date();
  const tokenHash = hashToken(token);
  const challenge = await prisma.authMfaChallenge.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, purpose: true, organizationId: true, redirectTo: true },
  });
  if (!challenge || challenge.purpose !== expectedPurpose) return null;
  const updated = await prisma.authMfaChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  return updated.count === 1 ? challenge : null;
}

export async function finalizeMfaChallenge(challengeId: string) {
  const result = await prisma.authMfaChallenge.updateMany({
    where: { id: challengeId, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lte: MAX_ATTEMPTS } },
    data: { consumedAt: new Date() },
  });
  return result.count === 1;
}

/** Password-verified pre-auth scope. No complete session or access to other APIs. */
export async function getMfaEnrollmentChallenge() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return prisma.authMfaChallenge.findFirst({
    where: {
      tokenHash: hashToken(token), purpose: "ENROLL", consumedAt: null,
      expiresAt: { gt: new Date() }, attempts: { lt: MAX_ATTEMPTS },
      user: { status: "ACTIVE" },
    },
    select: { id: true, userId: true, organizationId: true, redirectTo: true },
  });
}
