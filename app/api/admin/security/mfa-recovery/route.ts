import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

const requestSchema = z.object({
  targetEmail: z.string().trim().toLowerCase().email().max(320),
  reason: z.string().trim().min(20).max(1000),
}).strict();
const ONE_HOUR = 60 * 60 * 1000;

export async function GET(req: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_READ);
  if (access.response) return access.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") === "APPROVED" ? "APPROVED" : "PENDING";
  const rows = await prisma.authMfaRecoveryRequest.findMany({
    where: { status, ...(status === "PENDING" ? { expiresAt: { gt: new Date() } } : {}) },
    orderBy: { createdAt: "desc" }, take: 40,
    select: {
      id: true, status: true, reason: true, createdAt: true, expiresAt: true, resolvedAt: true,
      requestedByUserId: true,
      target: { select: { name: true, email: true, id: true, role: true } },
      requester: { select: { name: true } },
      approver: { select: { name: true } },
    },
  });
  return NextResponse.json({ requests: rows }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SECURITY_MANAGE);
  if (access.response) return access.response;
  const limited = await rateLimit(getRateLimitKey(req, "admin:mfa-recovery:" + access.session.userId),
    3, 60 * 60 * 1000, { failureMode: "closed" });
  if (!limited.ok) return NextResponse.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
  if (!(await hasRecentStepUp(access.session))) return NextResponse.json({
    error: "Vérification récente de votre identité nécessaire.", reasonCode: "STEP_UP_REQUIRED",
  }, { status: 428 });
  const body = requestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Email administrateur et motif détaillé obligatoires." }, { status: 400 });
  const target = await prisma.user.findUnique({
    where: { email: body.data.targetEmail }, select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (target?.id === access.session.userId) {
    return NextResponse.json({ error: "Vous ne pouvez pas demander votre propre récupération MFA." }, { status: 403 });
  }
  if (!target || target.role !== "ADMIN" || target.status !== "ACTIVE") {
    return NextResponse.json({ error: "Récupération limitée aux comptes administrateurs actifs." }, { status: 403 });
  }
  const now = new Date();
  await prisma.authMfaRecoveryRequest.updateMany({
    where: { targetUserId: target.id, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", resolvedAt: now },
  });
  let request;
  try {
    request = await prisma.authMfaRecoveryRequest.create({
      data: {
        targetUserId: target.id, requestedByUserId: access.session.userId,
        reason: body.data.reason, expiresAt: new Date(now.getTime() + ONE_HOUR),
      },
      select: { id: true, expiresAt: true },
    });
  } catch {
    return NextResponse.json({ error: "Une demande est déjà en attente pour ce compte." }, { status: 409 });
  }
  await writeAuditLog({
    userId: access.session.userId, action: "AUTH_ADMIN_MFA_RECOVERY_REQUESTED",
    entity: "AuthMfaRecoveryRequest", entityId: request.id, request: req,
    riskLevel: "CRITICAL", metadata: { targetUserId: target.id, reason: body.data.reason },
  });
  // Notify the account owner, without including any token, code, secret or
  // instructions that could weaken the two-person recovery requirement.
  try {
    const notice = await sendZohoOutboundMail({
      deliveryMode: "direct", to: [target.email],
      subject: "DTSC Platform — Demande de récupération MFA",
      heading: "Une demande de récupération de sécurité a été ouverte",
      source: "auth-admin-recovery-request",
      message: [
        "Bonjour " + target.name + ",",
        "",
        "Un responsable DTSC a initié une demande de récupération de votre authentificateur.",
        "Cette demande ne donne aucun accès et exige la validation indépendante d'un autre responsable.",
        "Date UTC : " + now.toISOString(),
        "",
        "Si vous n'êtes pas à l'origine de cette démarche, contactez immédiatement le support DTSC.",
      ].join("\\n"),
    });
    if (!notice.sent) throw new Error("MAIL_UNAVAILABLE");
  } catch {
    await writeAuditLog({
      userId: access.session.userId, action: "AUTH_ADMIN_MFA_RECOVERY_ALERT_FAILED",
      entity: "AuthMfaRecoveryRequest", entityId: request.id, request: req,
      result: "FAILED", riskLevel: "HIGH",
    }).catch(() => undefined);
  }
    return NextResponse.json({ ok: true, request }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
