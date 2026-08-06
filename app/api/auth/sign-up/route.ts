import { NextResponse } from "next/server";
import { SubscriptionStatus, UserRole } from "@prisma/client";
import { passwordPolicyError } from "@/lib/account-recovery";
import { prisma } from "@/lib/prisma";
import { signUpSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { setSessionCookie } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import {
  createPendingRegistration,
  sendSignUpOtpEmail,
  verifyPendingRegistrationOtp,
} from "@/lib/otp";
import { writeAuditLog } from "@/lib/audit";
import { ensureBillingPlans, getNextBillingPeriod } from "@/lib/billing";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limiter = await rateLimit(getRateLimitKey(req, "auth:sign-up"), 5, 30 * 60 * 1000);
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard.", reason: "RATE_LIMITED", resetAt: new Date(limiter.resetAt).toISOString() },
      { status: 429 },
    );
  }

  const rawBody = await req.json().catch(() => null);
  const body = signUpSchema.safeParse(rawBody);
  if (!body.success || rawBody?.legalConsent !== true) {
    return NextResponse.json({ error: "Les informations d’inscription sont incomplètes.", reason: "VALIDATION_ERROR" }, { status: 400 });
  }
  const policyError = passwordPolicyError(body.data.password);
  if (policyError) {
    return NextResponse.json({ error: policyError, reason: "PASSWORD_POLICY_FAILED" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: body.data.email },
    select: { id: true },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: "Impossible de créer ce compte avec les informations fournies.", reason: "REGISTRATION_UNAVAILABLE" },
      { status: 409 },
    );
  }

  const role = process.env.ADMIN_EMAIL?.toLowerCase() === body.data.email ? UserRole.ADMIN : UserRole.CLIENT;
  const settings = await getAppSettings();

  if (settings.signUpOtpEnabled && !body.data.otp) {
    const { code, expiresAt } = await createPendingRegistration({
      name: body.data.name,
      email: body.data.email,
      passwordHash: hashPassword(body.data.password),
      companyName: body.data.companyName || null,
      phone: body.data.phone || null,
      role,
      expiresInMinutes: settings.signUpOtpExpirationMinutes,
    });

    const mail = await sendSignUpOtpEmail({
      email: body.data.email,
      name: body.data.name,
      code,
      expiresInMinutes: settings.signUpOtpExpirationMinutes,
    }).catch((error) => ({
      sent: false,
      reason: error instanceof Error ? error.message : "OTP email failed",
    }));

    if (!mail.sent) {
      return NextResponse.json(
        { error: "Le code de vérification n’a pas pu être envoyé.", reason: "OTP_EMAIL_FAILED" },
        { status: 502 },
      );
    }

    await writeAuditLog({
      action: "SIGNUP_OTP_SENT",
      entity: "PendingRegistration",
      entityId: body.data.email,
      metadata: { expiresAt: expiresAt.toISOString() },
      request: req,
    });

    return NextResponse.json({ ok: true, otpRequired: true, email: body.data.email, expiresAt: expiresAt.toISOString() });
  }

  let verifiedPendingRegistration: {
    name: string;
    email: string;
    passwordHash: string;
    companyName: string | null;
    phone: string | null;
    role: UserRole;
  } | null = null;

  if (settings.signUpOtpEnabled) {
    const verification = await verifyPendingRegistrationOtp(body.data.email, body.data.otp || "");
    if (!verification.ok) {
      const status = verification.reason === "EXPIRED" || verification.reason === "LOCKED" ? 410 : 400;
      return NextResponse.json(
        { error: "Code de vérification invalide ou expiré.", reason: verification.reason },
        { status },
      );
    }
    verifiedPendingRegistration = verification.pendingRegistration;
  }

  const plans = await ensureBillingPlans();
  const freemium = plans.find((plan) => plan.id === "freemium");
  const user = await prisma.user.create({
    data: {
      name: verifiedPendingRegistration?.name || body.data.name,
      email: verifiedPendingRegistration?.email || body.data.email,
      passwordHash: verifiedPendingRegistration?.passwordHash || hashPassword(body.data.password),
      companyName: verifiedPendingRegistration?.companyName || body.data.companyName || null,
      phone: verifiedPendingRegistration?.phone || body.data.phone || null,
      role: verifiedPendingRegistration?.role || role,
      dailyMessageLimit: freemium?.dailyMessageLimit || settings.defaultDailyMessageLimit,
      dailyTokenLimit: freemium?.dailyTokenLimit || settings.defaultDailyTokenLimit,
    },
  });

  if (freemium) {
    const { start, end } = getNextBillingPeriod();
    await prisma.subscription.create({
      data: { userId: user.id, planId: freemium.id, status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end },
    });
  }

  if (settings.signUpOtpEnabled) {
    await prisma.pendingRegistration.delete({ where: { email: body.data.email } }).catch(() => null);
  }

  await writeAuditLog({
    userId: user.id,
    action: settings.signUpOtpEnabled ? "SIGNUP_COMPLETED_WITH_OTP" : "SIGNUP_COMPLETED",
    entity: "User",
    entityId: user.id,
    metadata: { role: user.role, legalConsent: true },
    request: req,
  });

  await setSessionCookie(user);
  return NextResponse.json({ ok: true });
}
