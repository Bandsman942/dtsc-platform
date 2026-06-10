import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyCash, type PharmacyCashAction } from "@/lib/pharmacy-cash-access";
import { closeCashSession, generateInvoiceFromSale, generateReceiptForPayment, recalculateSalePaymentStatus, validateCashRefund } from "@/lib/pharmacy-cash";
import { cashActionSchema } from "@/lib/pharmacy-cash-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; entity: string; id: string }> };
function permission(action: string): PharmacyCashAction {
  if (action === "close") return "close";
  if (action === "submit-validation") return "submit";
  if (action === "validate" || action === "validate-refund") return "validate";
  if (action === "reject" || action === "reject-refund") return "reject";
  if (action === "resolve-discrepancy") return "resolve";
  return "pay";
}

export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-cash:${session.userId}`), 140, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions de caisse." }, { status: 429 });
  const { organizationId, entity, id } = await params;
  const parsed = cashActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action de caisse invalide." }, { status: 400 });
  const data = parsed.data;
  if (!(await canAccessPharmacyCash(session.userId, organizationId, permission(data.action)))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reason = data.reason?.trim() || undefined;
  try {
    if (entity === "session") {
      const cashSession = await prisma.pharmacyCashSession.findFirst({ where: { id, organizationId } });
      if (!cashSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (data.action === "close") {
        const countedCashAmount = data.countedCashAmount;
        if (countedCashAmount === undefined) throw new Error("COUNTED_AMOUNT_REQUIRED");
        await closeCashSession(organizationId, id, session.userId, countedCashAmount, data.varianceJustification);
      } else if (data.action === "submit-validation") {
        if (cashSession.status !== "CLOSED") throw new Error("SESSION_NOT_CLOSED");
        await prisma.pharmacyCashSession.update({ where: { id }, data: { status: "PENDING_VALIDATION", submittedAt: new Date(), updatedById: session.userId } });
      } else if (data.action === "validate") {
        if (cashSession.status !== "PENDING_VALIDATION") throw new Error("SESSION_NOT_PENDING");
        if (cashSession.cashierId === session.userId) throw new Error("SELF_VALIDATION_FORBIDDEN");
        await prisma.pharmacyCashSession.update({ where: { id }, data: { status: "VALIDATED", validatedById: session.userId, validatedAt: new Date(), updatedById: session.userId } });
      } else if (data.action === "reject") {
        if (!reason) throw new Error("REASON_REQUIRED");
        await prisma.pharmacyCashSession.update({ where: { id }, data: { status: "REJECTED", rejectedById: session.userId, rejectedAt: new Date(), rejectionReason: reason, updatedById: session.userId } });
      } else throw new Error("INVALID_ACTION");
    } else if (entity === "payment" && data.action === "cancel-payment") {
      const payment = await prisma.pharmacyPayment.findFirst({ where: { id, organizationId, status: { in: ["PAID", "VALIDATED"] } } });
      if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!reason) throw new Error("REASON_REQUIRED");
      const paymentCashSessionId = payment.cashSessionId;
      if (paymentCashSessionId) {
        const openCashSession = await prisma.pharmacyCashSession.findFirst({ where: { id: paymentCashSessionId, organizationId, status: "OPEN" }, select: { id: true } });
        if (!openCashSession) throw new Error("PAYMENT_SESSION_CLOSED");
      }
      await prisma.pharmacyPayment.update({ where: { id }, data: { status: "CANCELLED", cancellationReason: reason, cancelledById: session.userId, cancelledAt: new Date(), updatedById: session.userId } });
      const saleId = payment.saleId;
      if (saleId) await recalculateSalePaymentStatus(organizationId, saleId);
    } else if (entity === "sale" && data.action === "generate-invoice") {
      await generateInvoiceFromSale(organizationId, id, session.userId);
    } else if (entity === "payment" && data.action === "generate-receipt") {
      await generateReceiptForPayment(organizationId, id, session.userId);
    } else if (entity === "refund") {
      const refund = await prisma.pharmacyRefund.findFirst({ where: { id, organizationId } });
      if (!refund) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (data.action === "validate-refund") await validateCashRefund(organizationId, id, session.userId);
      else if (data.action === "reject-refund") {
        if (!reason) throw new Error("REASON_REQUIRED");
        await prisma.pharmacyRefund.update({ where: { id }, data: { status: "REJECTED", rejectedById: session.userId, rejectedAt: new Date(), rejectionReason: reason } });
      } else if (data.action === "mark-refund-paid") {
        if (refund.status !== "VALIDATED") throw new Error("REFUND_NOT_VALIDATED");
        await prisma.pharmacyRefund.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
      } else throw new Error("INVALID_ACTION");
    } else if (entity === "discrepancy" && data.action === "resolve-discrepancy") {
      const discrepancy = await prisma.pharmacyCashDiscrepancy.findFirst({ where: { id, organizationId } });
      if (!discrepancy) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await prisma.pharmacyCashDiscrepancy.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), updatedById: session.userId } });
    } else throw new Error("INVALID_ACTION");
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_CASH_${data.action.toUpperCase().replaceAll("-", "_")}`, entity, entityId: id, request, metadata: { organizationId, reason: reason || null } });
    await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = { COUNTED_AMOUNT_REQUIRED: "Le montant cash compté est obligatoire.", JUSTIFICATION_REQUIRED: "Une justification est obligatoire pour cet écart.", SESSION_NOT_OPEN: "La session n'est pas ouverte.", SESSION_NOT_CLOSED: "La session doit être clôturée avant soumission.", SESSION_NOT_PENDING: "La clôture n'est pas en attente de validation.", SELF_VALIDATION_FORBIDDEN: "Le caissier ne peut pas valider sa propre clôture.", REASON_REQUIRED: "Le motif est obligatoire.", PAYMENT_SESSION_CLOSED: "Un paiement lié à une session clôturée ne peut plus être annulé librement.", REFUND_NOT_VALIDATED: "Le remboursement doit être validé avant paiement.", REFUND_NOT_SUBMITTED: "Le remboursement n'est plus en attente de validation.", SALE_ALREADY_RESTOCKED: "Cette vente a déjà été remise en stock.", BATCH_NOT_FOUND: "Un lot de la vente est introuvable.", INVALID_ACTION: "Cette action n'est pas autorisée." };
    return NextResponse.json({ error: code, message: messages[code] || "Action de caisse impossible." }, { status: 400 });
  }
}
