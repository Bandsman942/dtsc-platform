import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth";
import { clearMfaChallengeCookie, consumeMfaChallengeAttempt, finalizeMfaChallenge } from "@/lib/auth/mfa-challenge";
import { consumeTotpFactorCode, consumeTotpRecoveryCode } from "@/lib/auth/totp-factor-service";
import { getDefaultContextForRole, resolveOrganizationLoginContext } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { resolveTrustedInternalRedirect } from "@/lib/post-login-redirect";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  mode: z.enum(["totp", "recovery"]),
  code: z.string().trim().min(6).max(30),
}).strict();

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const limiter = await rateLimit(getRateLimitKey(req, "auth:mfa-challenge"), 12, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limiter.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Saisissez un code de vérification valide." }, { status: 400 });
  const challenge = await consumeMfaChallengeAttempt();
  if (!challenge) {
    await clearMfaChallengeCookie();
    return NextResponse.json({ error: "La vérification a expiré ou le nombre de tentatives est atteint. Reconnectez-vous." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    await clearMfaChallengeCookie();
    return NextResponse.json({ error: "Ce compte ne peut pas être connecté." }, { status: 403 });
  }
  const factor = await prisma.authTotpFactor.findUnique({
    where: { userId: user.id },
    select: { enabledAt: true },
  });
  if (!factor?.enabledAt) {
    await clearMfaChallengeCookie();
    return NextResponse.json({ error: "La configuration de sécurité a changé. Recommencez la connexion." }, { status: 401 });
  }
  const valid = parsed.data.mode === "totp"
    ? await consumeTotpFactorCode(user.id, parsed.data.code)
    : await consumeTotpRecoveryCode(user.id, parsed.data.code);
  if (!valid) {
    await writeAuditLog({ userId: user.id, action: "AUTH_MFA_CODE_REJECTED", entity: "AuthMfaChallenge", entityId: challenge.id, request: req });
    return NextResponse.json({ error: "Code incorrect, expiré ou déjà utilisé." }, { status: 401 });
  }

  let context = getDefaultContextForRole();
  if (challenge.organizationId) {
    try {
      context = await resolveOrganizationLoginContext(user, challenge.organizationId);
    } catch {
      await clearMfaChallengeCookie();
      return NextResponse.json({ error: "Cet espace n'est plus accessible. Recommencez la connexion." }, { status: 403 });
    }
  }
  // A pre-auth token cannot be reused even during concurrent submissions.
  if (!(await finalizeMfaChallenge(challenge.id))) {
    await clearMfaChallengeCookie();
    return NextResponse.json({ error: "Vérification déjà utilisée. Reconnectez-vous." }, { status: 409 });
  }
  await clearMfaChallengeCookie();
  const session = await setSessionCookie({
    ...user,
    mfaVerifiedAt: Date.now(),
    activeContext: context.activeContext,
    activeOrganizationId: context.activeOrganizationId,
    activeOrganizationName: context.activeOrganizationName,
    activeOrganizationRole: context.activeOrganizationRole,
  });
  if (!session) {
    await clearSessionCookie();
    return NextResponse.json({ error: "Impossible de créer la session. Reconnectez-vous." }, { status: 503 });
  }
  await writeAuditLog({ userId: user.id, action: "AUTH_MFA_LOGIN_COMPLETED", entity: "AuthMfaChallenge", entityId: challenge.id, request: req });
  return NextResponse.json({
    ok: true,
    redirectTo: resolveTrustedInternalRedirect(challenge.redirectTo) || "/dashboard",
  }, { headers: { "Cache-Control": "no-store" } });
}
