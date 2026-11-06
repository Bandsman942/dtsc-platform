import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { isSameOriginRequest } from "@/lib/request-security";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(20).max(1000),
}).strict();

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_MANAGE);
  if (access.response) return access.response;
  const limited = await rateLimit(getRateLimitKey(req, "admin:mfa-recovery-decision:" + access.session.userId),
    5, 60 * 60 * 1000, { failureMode: "closed" });
  if (!limited.ok) return NextResponse.json({ error: "Trop de décisions rapprochées." }, { status: 429 });
  if (!(await hasRecentStepUp(access.session))) return NextResponse.json({
    error: "Confirmez votre identité et votre facteur avant cette décision.",
    reasonCode: "STEP_UP_REQUIRED",
  }, { status: 428 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Décision et justification détaillée requises." }, { status: 400 });
  const { id } = await params;
  const current = await prisma.authMfaRecoveryRequest.findUnique({
    where: { id },
    select: { id: true, targetUserId: true, requestedByUserId: true, status: true, expiresAt: true },
  });
  if (!current || current.status !== "PENDING" || current.expiresAt <= new Date()) {
    return NextResponse.json({ error: "Demande expirée ou déjà traitée." }, { status: 409 });
  }
  // Dual control is enforced on the API. Neither requester nor target may
  // resolve their own recovery, regardless of role or visible UI.
  if ([current.requestedByUserId, current.targetUserId].includes(access.session.userId)) {
    await writeAuditLog({
      userId: access.session.userId, action: "AUTH_ADMIN_MFA_RECOVERY_DECISION_DENIED",
      entity: "AuthMfaRecoveryRequest", entityId: current.id, result: "DENIED",
      reasonCode: "TWO_PERSON_RULE", riskLevel: "CRITICAL", request: req,
    });
    return NextResponse.json({ error: "Une autre personne autorisée doit prendre cette décision." }, { status: 403 });
  }
  const now = new Date();
  const resolved = await prisma.$transaction(async (tx) => {
    const updated = await tx.authMfaRecoveryRequest.updateMany({
      where: { id, status: "PENDING", expiresAt: { gt: now },
        requestedByUserId: { not: access.session.userId }, targetUserId: { not: access.session.userId } },
      data: {
        status: body.data.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedByUserId: access.session.userId, resolvedAt: now,
      },
    });
    if (updated.count !== 1) return false;
    if (body.data.decision === "APPROVE") {
      const target = await tx.user.findUnique({
        where: { id: current.targetUserId }, select: { role: true, status: true },
      });
      if (!target || target.role !== "ADMIN" || target.status !== "ACTIVE") {
        // Abort all writes, including the decision. No partial recovery.
        throw new Error("RECOVERY_TARGET_NO_LONGER_ELIGIBLE");
      }
      await tx.user.update({
        where: { id: current.targetUserId },
        data: { mfaRecoveryRequired: true, mfaRecoveryInvalidBefore: now },
      });
      await tx.authTotpFactor.deleteMany({ where: { userId: current.targetUserId } });
      await tx.authMfaChallenge.updateMany({
        where: { userId: current.targetUserId, consumedAt: null },
        data: { consumedAt: now },
      });
    }
    return true;
  }).catch((error) => {
    if (error instanceof Error && error.message === "RECOVERY_TARGET_NO_LONGER_ELIGIBLE") return false;
    throw error;
  });
  if (!resolved) return NextResponse.json({ error: "Demande indisponible ou cible non autorisée." }, { status: 409 });
  await writeAuditLog({
    userId: access.session.userId, action: body.data.decision === "APPROVE"
      ? "AUTH_ADMIN_MFA_RECOVERY_APPROVED" : "AUTH_ADMIN_MFA_RECOVERY_REJECTED",
    entity: "AuthMfaRecoveryRequest", entityId: id, riskLevel: "CRITICAL",
    request: req, metadata: { targetUserId: current.targetUserId, reason: body.data.reason,
      requestedByUserId: current.requestedByUserId },
  });
  // A security-critical reset must be independently visible to the target.
  // An email outage never rolls back an already committed transaction.
  const targetOwner = await prisma.user.findUnique({
    where: { id: current.targetUserId }, select: { email: true, name: true },
  });
  if (targetOwner) {
    try {
      const result = await sendZohoOutboundMail({
        deliveryMode: "direct", to: [targetOwner.email],
        subject: "DTSC Platform — Décision de récupération MFA",
        heading: "Sécurité de votre compte administrateur",
        source: "auth-admin-recovery-decision",
        message: [
          "Bonjour " + targetOwner.name + ",",
          "",
          body.data.decision === "APPROVE"
            ? "La récupération de votre authentificateur a été validée sous double contrôle."
            : "Une demande de récupération de votre authentificateur a été rejetée.",
          body.data.decision === "APPROVE"
            ? "Toutes vos anciennes sessions sont invalidées. Vous devrez configurer un nouvel authentificateur après vérification de votre mot de passe."
            : "Votre authentificateur existant reste inchangé.",
          "Date UTC : " + now.toISOString(),
          "En cas de doute, contactez immédiatement le support DTSC.",
        ].join("\\n"),
      });
      if (!result.sent) throw new Error("MAIL_UNAVAILABLE");
    } catch {
      await writeAuditLog({
        userId: access.session.userId, action: "AUTH_ADMIN_MFA_RECOVERY_ALERT_FAILED",
        entity: "AuthMfaRecoveryRequest", entityId: id, request: req,
        result: "FAILED", riskLevel: "HIGH",
      }).catch(() => undefined);
    }
  }
    return NextResponse.json({
    ok: true,
    decision: body.data.decision,
    targetMustReEnroll: body.data.decision === "APPROVE",
  }, { headers: { "Cache-Control": "no-store" } });
}
