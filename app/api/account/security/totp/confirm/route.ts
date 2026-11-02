import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, setSessionCookie } from "@/lib/auth";
import { consumeMfaChallengeAttempt, finalizeMfaChallenge, clearMfaChallengeCookie } from "@/lib/auth/mfa-challenge";
import { getDefaultContextForRole, resolveOrganizationLoginContext } from "@/lib/organizations";
import { resolveTrustedInternalRedirect } from "@/lib/post-login-redirect";
import { decryptTotpSecret, generateRecoveryCodes, hashRecoveryCode, verifyTotpCode } from "@/lib/auth/totp";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/audit";
import { recordAuthenticatedBrowser } from "@/lib/auth/known-browser";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const session = await getSession();
  // A pending enrollment challenge proves password ownership, but is NOT a
  // regular authenticated session. It can only complete TOTP enrollment.
  const enrollment = session ? null : await consumeMfaChallengeAttempt("ENROLL");
  const userId = session?.userId || enrollment?.userId;
  if (!userId) return NextResponse.json({ error: "La vérification a expiré. Reconnectez-vous." }, { status: 401 });
  const limiter = await rateLimit(getRateLimitKey(req, "auth:totp-confirm:" + userId), 6, 15 * 60 * 1000, { failureMode: "closed" });
  if (!limiter.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Saisissez le code à six chiffres." }, { status: 400 });

  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();
  const success = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") return false;
    const factor = await tx.authTotpFactor.findUnique({
      where: { userId: userId },
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
    // Complete recovery only after the freshly enrolled factor and recovery
    // codes are committed. Old cookies remain invalidated by the timestamp.
    await tx.user.update({
      where: { id: userId },
      data: { mfaRecoveryRequired: false },
    });
    return true;
  });

  if (!success) return NextResponse.json({ error: "Code incorrect, expiré ou configuration déjà validée." }, { status: 400 });
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!actor || actor.status !== "ACTIVE") return NextResponse.json({ error: "Compte indisponible." }, { status: 403 });
  let context = getDefaultContextForRole();
  if (enrollment?.organizationId) {
    try { context = await resolveOrganizationLoginContext(actor, enrollment.organizationId); }
    catch { return NextResponse.json({ error: "Cet espace n'est plus accessible. Reconnectez-vous." }, { status: 403 }); }
  }
  if (enrollment && !(await finalizeMfaChallenge(enrollment.id))) {
    return NextResponse.json({ error: "Vérification déjà consommée. Reconnectez-vous." }, { status: 409 });
  }
  const issuedSession = await setSessionCookie({
    ...actor, mfaVerifiedAt: Date.now(),
    activeContext: session?.activeContext || context.activeContext,
    activeOrganizationId: session?.activeOrganizationId || context.activeOrganizationId,
    activeOrganizationName: session?.activeOrganizationName || context.activeOrganizationName,
    activeOrganizationRole: session?.activeOrganizationRole || context.activeOrganizationRole,
  }, session ? { previousSession: session } : {});
  if (!issuedSession) return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
  if (enrollment) await clearMfaChallengeCookie();
  await recordAuthenticatedBrowser(req, actor);
  await writeAuditLog({ userId, action: "AUTH_TOTP_ENABLED", entity: "AuthTotpFactor", entityId: userId, request: req });
  return NextResponse.json({
    ok: true,
    recoveryCodes,
    redirectTo: enrollment ? resolveTrustedInternalRedirect(enrollment.redirectTo) || "/dashboard" : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
