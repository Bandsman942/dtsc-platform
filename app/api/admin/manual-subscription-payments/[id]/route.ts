import { z } from "zod";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { DTSC_INTERNAL_ORGANIZATION_ID } from "@/lib/organizations";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { finalizeManualSubscriptionPayment } from "@/lib/subscription-payments";

const schema = z.object({ action: z.enum(["APPROVE", "REJECT"]), validationComment: z.string().trim().max(500).optional() }).superRefine((value, ctx) => {
  if (value.action === "REJECT" && !value.validationComment) ctx.addIssue({ code: "custom", path: ["validationComment"], message: "Le motif du refus est obligatoire." });
});
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `manual-subscription-payment-decision:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, { status: 400 });
  const { id } = await params;
  try {
    const validator = await prisma.user.findFirst({ where: { id: session.userId, status: "ACTIVE", hrcfoEmployee: { is: { status: "ACTIVE" } }, organizationMemberships: { some: { organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null } } }, select: { id: true } });
    if (!validator) return NextResponse.json({ error: "VALIDATOR_INACTIVE", message: "Le statut de collaborateur actif est nécessaire pour approuver." }, { status: 403 });
    const result = await finalizeManualSubscriptionPayment(id, { userId: session.userId, role: session.role }, parsed.data.action, parsed.data.validationComment);
    await writeAuditLog({ userId: session.userId, action: `MANUAL_SUBSCRIPTION_PAYMENT_${parsed.data.action}D`, entity: "ManualSubscriptionPayment", entityId: id, request: req, metadata: { validationComment: parsed.data.validationComment || null } });
    const payment = await prisma.manualSubscriptionPayment.findUnique({ where: { id }, select: { requestedByUserId: true, userId: true, organizationId: true, status: true } });
    let notificationPending = false;
    if (payment) {
      const recipients = new Set([payment.requestedByUserId, payment.userId].filter((value): value is string => Boolean(value) && value !== session.userId));
      if (payment.organizationId) {
        const administrators = await prisma.organizationMember.findMany({ where: { organizationId: payment.organizationId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
        for (const administrator of administrators) if (administrator.userId !== session.userId) recipients.add(administrator.userId);
      }
      for (const userId of recipients) {
        try {
          await notifyUser({ userId, title: payment.status === "APPROVED" ? "Paiement manuel approuvé" : "Paiement manuel refusé", body: payment.status === "APPROVED" ? "Votre demande a été approuvée. Consultez votre espace Abonnement." : "Votre demande a été refusée. Contactez DTSC pour le motif.", type: "SUBSCRIPTION_PAYMENT_DECISION", targetUrl: "/billing", idempotencyKey: `manual-subscription:${id}:${payment.status}:${userId}` });
        } catch { notificationPending = true; }
      }
    }
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { notificationPending } });
    return NextResponse.json({ ok: true, result, notificationPending });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code.includes("NOT_FOUND") ? 404 : code === "MANUAL_PAYMENT_EVIDENCE_REQUIRED" ? 422 : code.includes("REQUIRED") || code.includes("FORBIDDEN") ? 403 : code.includes("ALREADY") ? 409 : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { code } });
    return NextResponse.json({ error: code, message: code === "MANUAL_PAYMENT_SELF_APPROVAL_FORBIDDEN" ? "Vous ne pouvez pas approuver votre propre demande." : code === "MANUAL_PAYMENT_EVIDENCE_REQUIRED" ? "Référence absente : consignez une justification vérifiable d'au moins 10 caractères." : status === 500 ? "Impossible de finaliser ce paiement. Vérifiez son état avant de réessayer." : "Cette décision ne peut pas être appliquée." }, { status });
  }
}
